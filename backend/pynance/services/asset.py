from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from pynance.models.asset import Asset
from pynance.models.category import Category
from pynance.models.transaction import Transaction
from pynance.models.transfer import Transfer
from pynance.models.types import TransactionType
from pynance.schemas.asset import AssetCreate, AssetUpdate
from pynance.services.exceptions import (
    AssetInUseError,
    AssetNotFoundError,
    DuplicateAssetNameError,
)


def create_asset(db: Session, user_id: int, asset: AssetCreate) -> Asset:
    existing_asset = db.execute(
        select(Asset).where(Asset.user_id == user_id, Asset.name == asset.name)
    ).scalar_one_or_none()
    if existing_asset:
        raise DuplicateAssetNameError(f"Asset with name {asset.name} already exists")

    new_asset = Asset(
        name=asset.name,
        asset_type=asset.asset_type,
        opening_balance=asset.opening_balance,
        user_id=user_id,
    )
    db.add(new_asset)
    db.commit()
    db.refresh(new_asset)
    return new_asset


def get_asset(db: Session, user_id: int, asset_id: int) -> Asset:
    asset = db.execute(
        select(Asset).where(Asset.id == asset_id, Asset.user_id == user_id)
    ).scalar_one_or_none()
    if not asset:
        raise AssetNotFoundError(f"Asset with id {asset_id} doesn't exist")
    return asset


def list_assets(db: Session, user_id: int) -> list[Asset]:
    return list(db.execute(select(Asset).where(Asset.user_id == user_id)).scalars().all())


def update_asset(db: Session, user_id: int, asset_id: int, update: AssetUpdate) -> Asset:
    asset = get_asset(db, user_id, asset_id)

    if update.name is not None and update.name != asset.name:
        existing_asset = db.execute(
            select(Asset).where(Asset.user_id == user_id, Asset.name == update.name)
        ).scalar_one_or_none()
        if existing_asset:
            raise DuplicateAssetNameError(f"Asset with name {update.name} already exists")

    for field_to_update, value in update.model_dump(exclude_unset=True).items():
        setattr(asset, field_to_update, value)

    db.commit()
    db.refresh(asset)
    return asset


def delete_asset(db: Session, user_id: int, asset_id: int) -> Asset:
    asset = get_asset(db, user_id, asset_id)
    db.delete(asset)

    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise AssetInUseError(
            f"Asset with id '{asset_id}' is associated to one or more transactions or transfers."
            " You can't delete it"
        ) from e
    return asset


def get_asset_balance(db: Session, user_id: int, asset_id: int) -> Decimal:
    return get_asset_balances(db, user_id).get(asset_id, Decimal("0"))


def get_asset_balances(db: Session, user_id: int) -> dict[int, Decimal]:
    # Saldo di partenza
    opening_balances = db.execute(
        select(Asset.id, Asset.opening_balance).where(Asset.user_id == user_id)
    ).all()

    # (Entrate - uscite)
    transaction_nets = db.execute(
        select(
            Transaction.asset_id,
            func.coalesce(
                func.sum(
                    case(
                        (Category.transaction_type == TransactionType.EXPENSE, -Transaction.amount),
                        (Category.transaction_type == TransactionType.INCOME, Transaction.amount),
                        else_=0,
                    )
                ),
                0,
            ),
        )
        .select_from(Transaction)
        .join(Category, Transaction.category_id == Category.id)
        .where(Transaction.user_id == user_id)
        .group_by(Transaction.asset_id)
    ).all()

    # Trasferimenti ricevuti
    transfer_ins = db.execute(
        select(
            Transfer.destination_asset_id,
            func.coalesce(func.sum(Transfer.amount), 0),
        )
        .where(Transfer.user_id == user_id)
        .group_by(Transfer.destination_asset_id)
    ).all()

    # Trasferimenti Inviati
    transfer_outs = db.execute(
        select(
            Transfer.source_asset_id,
            func.coalesce(func.sum(Transfer.amount), 0),
        )
        .where(Transfer.user_id == user_id)
        .group_by(Transfer.source_asset_id)
    ).all()

    balances: dict[int, Decimal] = {}
    for asset_id, opening_balance in opening_balances:
        balances[int(asset_id)] = Decimal(opening_balance or 0)
    for asset_id, net in transaction_nets:
        balances[int(asset_id)] = balances[int(asset_id)] + net
    for asset_id, amount in transfer_ins:
        balances[int(asset_id)] = balances.get(int(asset_id), Decimal("0")) + Decimal(amount or 0)
    for asset_id, amount in transfer_outs:
        balances[int(asset_id)] = balances.get(int(asset_id), Decimal("0")) - Decimal(amount or 0)

    return balances


@dataclass(frozen=True)
class NetWorthTrendPoint:
    year: int
    month: int
    amount: Decimal


def _month_start(year: int, month: int) -> date:
    return date(year, month, 1)


def _shift_month(year: int, month: int) -> tuple[int, int]:
    return (year + 1, 1) if month == 12 else (year, month + 1)


def get_net_worth_trend(
    db: Session, user_id: int, start_date: date, end_date: date
) -> list[NetWorthTrendPoint]:
    earliest = db.execute(
        select(func.min(Transaction.occurred_on)).where(Transaction.user_id == user_id)
    ).scalar_one()
    if earliest is not None:
        start_date = max(start_date, earliest)

    opening_total = db.execute(
        select(func.coalesce(func.sum(Asset.opening_balance), 0)).where(Asset.user_id == user_id)
    ).scalar_one()

    prior_total = db.execute(
        select(
            func.coalesce(
                func.sum(
                    case(
                        (Category.transaction_type == TransactionType.EXPENSE, -Transaction.amount),
                        (Category.transaction_type == TransactionType.INCOME, Transaction.amount),
                        else_=0,
                    )
                ),
                0,
            )
        )
        .select_from(Transaction)
        .join(Category, Transaction.category_id == Category.id)
        .where(Transaction.user_id == user_id, Transaction.occurred_on < start_date)
    ).scalar_one()

    transaction_nets = db.execute(
        select(
            func.extract("year", Transaction.occurred_on),
            func.extract("month", Transaction.occurred_on),
            func.coalesce(
                func.sum(
                    case(
                        (Category.transaction_type == TransactionType.EXPENSE, -Transaction.amount),
                        (Category.transaction_type == TransactionType.INCOME, Transaction.amount),
                        else_=0,
                    )
                ),
                0,
            ),
        )
        .select_from(Transaction)
        .join(Category, Transaction.category_id == Category.id)
        .where(
            Transaction.user_id == user_id,
            Transaction.occurred_on >= start_date,
            Transaction.occurred_on <= end_date,
        )
        .group_by(
            func.extract("year", Transaction.occurred_on),
            func.extract("month", Transaction.occurred_on),
        )
        .order_by(
            func.extract("year", Transaction.occurred_on),
            func.extract("month", Transaction.occurred_on),
        )
    ).all()

    transaction_nets_by_month: dict[tuple[int, int], Decimal] = {}
    for year, month, net in transaction_nets:
        transaction_nets_by_month[(int(year), int(month))] = Decimal(net or 0)

    running = Decimal(opening_total or 0) + Decimal(prior_total or 0)
    points: list[NetWorthTrendPoint] = []
    year, month = start_date.year, start_date.month
    while (year, month) <= (end_date.year, end_date.month):
        running += transaction_nets_by_month.get((year, month), Decimal("0"))
        points.append(NetWorthTrendPoint(year, month, running))
        year, month = _shift_month(year, month)

    return points
