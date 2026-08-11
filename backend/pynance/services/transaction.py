from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from sqlalchemy import ColumnElement, and_, func, select
from sqlalchemy.orm import Session, selectinload

from pynance.models.category import Category
from pynance.models.transaction import Transaction
from pynance.models.types import TransactionType
from pynance.schemas.transaction import (
    TransactionCreate,
    TransactionUpdate,
)
from pynance.services.exceptions import (
    CategoryNotFoundError,
    MonthWithoutYearError,
    TransactionNotFoundError,
)


def create_transaction(db: Session, transaction: TransactionCreate) -> Transaction:
    category = db.execute(
        select(Category).where(Category.id == transaction.category_id)
    ).scalar_one_or_none()
    if category is None:
        raise CategoryNotFoundError(f"Category with id '{transaction.category_id}' doesn't exist")

    new_transaction = Transaction(
        amount=transaction.amount,
        category_id=transaction.category_id,
        description=transaction.description,
        occurred_on=transaction.occurred_on,
    )

    db.add(new_transaction)
    db.commit()
    db.refresh(new_transaction)
    return new_transaction


def get_transaction(db: Session, transaction_id: int) -> Transaction:
    result = db.execute(
        select(Transaction).where(Transaction.id == transaction_id)
    ).scalar_one_or_none()
    if result is None:
        raise TransactionNotFoundError(f"Transaction with id '{transaction_id}' doesn't exist")
    return result


def update_transaction(db: Session, transaction_id: int, update: TransactionUpdate) -> Transaction:
    transaction = get_transaction(db, transaction_id)

    new_category_id = (
        update.category_id if update.category_id is not None else transaction.category_id
    )
    category = db.execute(
        select(Category).where(Category.id == new_category_id)
    ).scalar_one_or_none()
    if category is None:
        raise CategoryNotFoundError(f"Category with id '{new_category_id}' doesn't exist")

    for field_to_update, value in update.model_dump(exclude_unset=True).items():
        setattr(transaction, field_to_update, value)

    db.commit()
    db.refresh(transaction)
    return transaction


def delete_transaction(db: Session, transaction_id: int) -> Transaction:
    transaction = get_transaction(db, transaction_id)
    db.delete(transaction)
    db.commit()
    return transaction


@dataclass
class TransactionFilters:
    q: str | None = None
    year: int | None = None
    month: int | None = None
    category_id: int | None = None


def list_transactions(db: Session, filter_params: TransactionFilters) -> list[Transaction]:
    conditions: list[ColumnElement[bool]] = []

    if filter_params.q:
        conditions.append(Transaction.description.ilike(f"%{filter_params.q}%"))
    if filter_params.category_id:
        conditions.append(Transaction.category_id == filter_params.category_id)
    if filter_params.month and filter_params.year:
        first_day = date(filter_params.year, filter_params.month, 1)
        next_year, next_month = (
            (filter_params.year + 1, 1)
            if filter_params.month == 12
            else (filter_params.year, filter_params.month + 1)
        )
        first_day_next_month = date(next_year, next_month, 1)
        conditions.append(
            and_(
                Transaction.occurred_on >= first_day, Transaction.occurred_on < first_day_next_month
            )
        )
    if filter_params.year and not filter_params.month:
        first_day = date(filter_params.year, 1, 1)
        first_day_next_year = date(filter_params.year + 1, 1, 1)
        conditions.append(
            and_(
                Transaction.occurred_on >= first_day, Transaction.occurred_on < first_day_next_year
            )
        )
    if not filter_params.year and filter_params.month:
        raise MonthWithoutYearError("Cannot filter month without year")

    query = (
        select(Transaction)
        .options(selectinload(Transaction.category))
        .where(*conditions)
        .order_by(Transaction.occurred_on.desc())
    )
    return list(db.execute(query).scalars().all())


@dataclass(frozen=True)
class Summary:
    income: Decimal
    expense: Decimal


def get_summary(db: Session, month: int, year: int) -> Summary:
    first_day = date(year, month, 1)
    next_year, next_month = (year + 1, 1) if month == 12 else (year, month + 1)
    first_day_next_month = date(next_year, next_month, 1)

    rows = db.execute(
        select(Category.transaction_type, func.sum(Transaction.amount))
        .join(Category, Category.id == Transaction.category_id)
        .where(
            Transaction.occurred_on >= first_day,
            Transaction.occurred_on < first_day_next_month,
        )
        .group_by(Category.transaction_type)
    ).all()

    income = Decimal("0")
    expense = Decimal("0")
    for transaction_type, total in rows:
        if transaction_type == TransactionType.INCOME:
            income = total
        else:
            expense = total
    return Summary(income, expense)


@dataclass(frozen=True)
class SummaryByCategoryRow:
    category_id: int
    category_name: str
    amount: Decimal


def get_summary_by_category(
    db: Session, transaction_type: TransactionType, month: int, year: int
) -> list[SummaryByCategoryRow]:
    first_day = date(year, month, 1)
    next_year, next_month = (year + 1, 1) if month == 12 else (year, month + 1)
    first_day_next_month = date(next_year, next_month, 1)

    rows = db.execute(
        select(Transaction.category_id, Category.name, func.sum(Transaction.amount))
        .where(
            Transaction.occurred_on >= first_day,
            Transaction.occurred_on < first_day_next_month,
            Category.transaction_type == transaction_type,
        )
        .join(Category, Transaction.category_id == Category.id)
        .group_by(Transaction.category_id, Category.name)
    ).all()

    return [SummaryByCategoryRow(cid, name, total) for cid, name, total in rows]


@dataclass(frozen=True)
class DataRange:
    start_date: date
    end_date: date


@dataclass
class TrendPoint:
    year: int
    month: int
    income: Decimal
    expense: Decimal


def get_trend(db: Session, date_range: DataRange) -> list[TrendPoint]:
    year_expr = func.extract("year", Transaction.occurred_on)
    month_expr = func.extract("month", Transaction.occurred_on)

    rows = db.execute(
        select(year_expr, month_expr, Category.transaction_type, func.sum(Transaction.amount))
        .join(Category, Category.id == Transaction.category_id)
        .where(
            Transaction.occurred_on >= date_range.start_date,
            Transaction.occurred_on <= date_range.end_date,
        )
        .group_by(year_expr, month_expr, Category.transaction_type)
        .order_by(year_expr, month_expr, Category.transaction_type)
    ).all()

    trends: dict[tuple[int, int], TrendPoint] = {}
    for year, month, transaction_type, amount in rows:
        key = (int(year), int(month))
        trend = trends.setdefault(
            key,
            TrendPoint(year=int(year), month=int(month), income=Decimal("0"), expense=Decimal("0")),
        )

        if transaction_type == "income":
            trend.income = amount
        elif transaction_type == "expense":
            trend.expense = amount

    return list(trends.values())


@dataclass
class TrendByCategoryPoint:
    year: int
    month: int
    amount: Decimal


@dataclass
class TrendByCategory:
    category_id: int
    category_name: str
    points: list[TrendByCategoryPoint] = field(default_factory=list[TrendByCategoryPoint])


def get_trend_by_category(db: Session, date_range: DataRange) -> list[TrendByCategory]:
    year_expr = func.extract("year", Transaction.occurred_on)
    month_expr = func.extract("month", Transaction.occurred_on)

    rows = db.execute(
        select(Category.id, Category.name, year_expr, month_expr, func.sum(Transaction.amount))
        .join(Category, Category.id == Transaction.category_id)
        .where(
            Transaction.occurred_on >= date_range.start_date,
            Transaction.occurred_on <= date_range.end_date,
        )
        .group_by(Category.id, Category.name, year_expr, month_expr)
        .order_by(Category.id, Category.name, year_expr, month_expr)
    ).all()

    trends: dict[int, TrendByCategory] = {}
    for category_id, category_name, year, month, amount in rows:
        trend = trends.setdefault(category_id, TrendByCategory(category_id, category_name))
        trend.points.append(TrendByCategoryPoint(year=int(year), month=int(month), amount=amount))

    return list(trends.values())


@dataclass
class Comparison:
    current: Summary
    previous: Summary


def get_comparison(db: Session, year: int, month: int) -> Comparison:
    reference_date = date(year, month, 1)

    current_year = reference_date.year
    current_month = reference_date.month

    previous_year = current_year - 1 if current_month == 1 else current_year
    previous_month = 12 if current_month == 1 else current_month - 1

    current_monthly_summary = get_summary(db, current_month, current_year)
    previous_monthly_summary = get_summary(db, previous_month, previous_year)

    return Comparison(current_monthly_summary, previous_monthly_summary)
