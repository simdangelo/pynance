from dataclasses import dataclass
from datetime import date

from sqlalchemy import ColumnElement, and_, select
from sqlalchemy.orm import Session

from pynance.models.asset import Asset
from pynance.models.transfer import Transfer
from pynance.schemas.transfer import TransferCreate, TransferUpdate
from pynance.services.exceptions import (
    AssetNotFoundError,
    MonthWithoutYearError,
    SelfTransferError,
    TransferNotFoundError,
)


def create_transfer(db: Session, user_id: int, transfer: TransferCreate) -> Transfer:
    source_asset = db.execute(
        select(Asset).where(Asset.id == transfer.source_asset_id, Asset.user_id == user_id)
    ).scalar_one_or_none()
    if not source_asset:
        raise AssetNotFoundError(f"Source asset id '{transfer.source_asset_id}' doesn't exist")

    destination_asset = db.execute(
        select(Asset).where(Asset.id == transfer.destination_asset_id, Asset.user_id == user_id)
    ).scalar_one_or_none()
    if not destination_asset:
        raise AssetNotFoundError(
            f"Destination asset id '{transfer.destination_asset_id}' doesn't exist"
        )

    if transfer.source_asset_id == transfer.destination_asset_id:
        raise SelfTransferError(
            "To complete a transfer source asset must be different from Destination asset"
        )

    new_transfer = Transfer(
        source_asset_id=transfer.source_asset_id,
        destination_asset_id=transfer.destination_asset_id,
        amount=transfer.amount,
        description=transfer.description,
        occurred_on=transfer.occurred_on,
        user_id=user_id,
    )

    db.add(new_transfer)
    db.commit()
    db.refresh(new_transfer)
    return new_transfer


def get_transfer(db: Session, user_id: int, transfer_id: int) -> Transfer:
    transfer = db.execute(
        select(Transfer).where(Transfer.id == transfer_id, Transfer.user_id == user_id)
    ).scalar_one_or_none()
    if not transfer:
        raise TransferNotFoundError(f"Transfer with id '{transfer_id}' doesn't exist")
    return transfer


@dataclass
class TransferFilters:
    q: str | None = None
    year: int | None = None
    month: int | None = None
    source_asset_id: int | None = None
    destination_asset_id: int | None = None


def list_transfers(db: Session, user_id: int, filter_params: TransferFilters) -> list[Transfer]:
    conditions: list[ColumnElement[bool]] = [Transfer.user_id == user_id]

    if filter_params.q:
        conditions.append(Transfer.description.ilike(f"%{filter_params.q}%"))
    if filter_params.source_asset_id:
        conditions.append(Transfer.source_asset_id == filter_params.source_asset_id)
    if filter_params.destination_asset_id:
        conditions.append(Transfer.destination_asset_id == filter_params.destination_asset_id)
    if filter_params.month and filter_params.year:
        first_day = date(filter_params.year, filter_params.month, 1)
        next_year, next_month = (
            (filter_params.year + 1, 1)
            if filter_params.month == 12
            else (filter_params.year, filter_params.month + 1)
        )
        first_day_next_month = date(next_year, next_month, 1)
        conditions.append(
            and_(Transfer.occurred_on >= first_day, Transfer.occurred_on < first_day_next_month)
        )
    if filter_params.year and not filter_params.month:
        first_day = date(filter_params.year, 1, 1)
        first_day_next_year = date(filter_params.year + 1, 1, 1)
        conditions.append(
            and_(Transfer.occurred_on >= first_day, Transfer.occurred_on < first_day_next_year)
        )
    if not filter_params.year and filter_params.month:
        raise MonthWithoutYearError("Cannot filter month without year")

    query = select(Transfer).where(*conditions).order_by(Transfer.occurred_on.desc())
    return list(db.execute(query).scalars().all())


def update_transfer(
    db: Session, user_id: int, transfer_id: int, update: TransferUpdate
) -> Transfer:
    transfer = get_transfer(db, user_id, transfer_id)

    new_source_id = (
        update.source_asset_id if update.source_asset_id is not None else transfer.source_asset_id
    )
    new_dest_id = (
        update.destination_asset_id
        if update.destination_asset_id is not None
        else transfer.destination_asset_id
    )

    source_asset = db.execute(
        select(Asset).where(Asset.id == new_source_id, Asset.user_id == user_id)
    ).scalar_one_or_none()
    if not source_asset:
        raise AssetNotFoundError(f"Source asset id '{new_source_id}' doesn't exist")

    destination_asset = db.execute(
        select(Asset).where(Asset.id == new_dest_id, Asset.user_id == user_id)
    ).scalar_one_or_none()
    if not destination_asset:
        raise AssetNotFoundError(f"Destination asset id '{new_dest_id}' doesn't exist")

    if new_source_id == new_dest_id:
        raise SelfTransferError(
            "To complete a transfer source asset must be different from Destination asset"
        )

    for field_to_update, value in update.model_dump(exclude_unset=True).items():
        setattr(transfer, field_to_update, value)

    db.commit()
    db.refresh(transfer)
    return transfer


def delete_transfer(db: Session, user_id: int, transfer_id: int) -> Transfer:
    transfer = get_transfer(db, user_id, transfer_id)

    db.delete(transfer)
    db.commit()
    return transfer
