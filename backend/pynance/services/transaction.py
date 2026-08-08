from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from pynance.models.category import Category
from pynance.models.transaction import Transaction
from pynance.models.types import TransactionType
from pynance.schemas.transaction import TransactionCreate, TransactionUpdate
from pynance.services.exceptions import (
    CategoryNotFoundError,
    TransactionNotFoundError,
    TransactionTypeMismatchError,
)


def create_transaction(db: Session, transaction: TransactionCreate) -> Transaction:
    category = db.execute(
        select(Category).where(Category.id == transaction.category_id)
    ).scalar_one_or_none()
    if category is None:
        raise CategoryNotFoundError(f"Category with id '{transaction.category_id}' doesn't exist")

    if category.transaction_type != transaction.transaction_type:
        raise TransactionTypeMismatchError(
            f"Transaction type {transaction.transaction_type}"
            f" does not match category type {category.transaction_type}"
        )
    new_transaction = Transaction(
        transaction_type=transaction.transaction_type,
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

    # Valori effettivi che la transazione avrà dopo l'update: se il campo è stato
    # fornito dal client si usa quello, altrimenti si mantiene il valore attuale.
    new_type = (
        update.transaction_type
        if update.transaction_type is not None
        else transaction.transaction_type
    )
    new_category_id = (
        update.category_id if update.category_id is not None else transaction.category_id
    )

    # Ogni transazione deve avere lo stesso transaction_type della propria categoria.
    # Si riesegue il controllo solo se category_id o transaction_type cambiano davvero.

    if new_category_id != transaction.category_id or new_type != transaction.transaction_type:
        category = db.execute(
            select(Category).where(Category.id == new_category_id)
        ).scalar_one_or_none()
        if category is None:
            raise CategoryNotFoundError(f"Category with id '{new_category_id}' doesn't exist")
        if category.transaction_type != new_type:
            raise TransactionTypeMismatchError(
                f"Transaction type {new_type} "
                f"doesn't match category type {category.transaction_type}"
            )

    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(transaction, field, value)

    db.commit()
    db.refresh(transaction)
    return transaction


def delete_transaction(db: Session, transaction_id: int) -> Transaction:
    transaction = get_transaction(db, transaction_id)
    db.delete(transaction)
    db.commit()
    return transaction


def get_transactions(db: Session) -> list[Transaction]:
    return list(db.execute(select(Transaction)).scalars().all())


@dataclass(frozen=True)
class MonthlySummary:
    income: Decimal
    expense: Decimal


def get_monthly_summary(db: Session, month: int, year: int) -> MonthlySummary:
    first_day = date(year, month, 1)
    next_year, next_month = (year + 1, 1) if month == 12 else (year, month + 1)
    first_day_next_month = date(next_year, next_month, 1)

    rows = db.execute(
        select(Transaction.transaction_type, func.sum(Transaction.amount))
        .where(
            Transaction.occurred_on >= first_day,
            Transaction.occurred_on < first_day_next_month,
        )
        .group_by(Transaction.transaction_type)
    ).all()

    income = Decimal("0")
    expense = Decimal("0")
    for transaction_type, total in rows:
        if transaction_type == TransactionType.INCOME:
            income = total
        else:
            expense = total
    return MonthlySummary(income, expense)


@dataclass(frozen=True)
class CategorySummary:
    category_id: int
    category_name: str
    amount: Decimal


def get_categories_summary(
    db: Session, transaction_type: TransactionType, month: int, year: int
) -> list[CategorySummary]:
    first_day = date(year, month, 1)
    next_year, next_month = (year + 1, 1) if month == 12 else (year, month + 1)
    first_day_next_month = date(next_year, next_month, 1)

    rows = db.execute(
        select(Transaction.category_id, Category.name, func.sum(Transaction.amount))
        .where(
            Transaction.occurred_on >= first_day,
            Transaction.occurred_on < first_day_next_month,
            Transaction.transaction_type == transaction_type,
        )
        .join(Category, Transaction.category_id == Category.id)
        .group_by(Transaction.category_id, Category.name)
    ).all()

    return [CategorySummary(cid, name, total) for cid, name, total in rows]
