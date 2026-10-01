from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from pynance.models.adjustment import BalanceAdjustment
from pynance.models.asset import Asset
from pynance.schemas.adjustment import ReconciliationRequest
from pynance.services.asset import get_asset_balances
from pynance.services.exceptions import AdjustmentNotFoundError, AssetNotFoundError


@dataclass(frozen=True)
class ReconciliationRow:
    asset_id: int
    balance: Decimal
    declared_balance: Decimal
    delta: Decimal


@dataclass(frozen=True)
class ReconciliationResult:
    adjustments: list[BalanceAdjustment]
    rows: list[ReconciliationRow]


def reconcile(db: Session, user_id: int, data: ReconciliationRequest) -> ReconciliationResult:
    """Align asset balances to declared values by creating the needed corrections.

    For each row, `delta = declared_balance - current_balance`: a non-zero delta
    becomes a `BalanceAdjustment` on that asset (positive raises the balance).
    """
    balances = get_asset_balances(db, user_id)
    adjustments: list[BalanceAdjustment] = []
    rows: list[ReconciliationRow] = []

    for row in data.rows:
        asset = db.execute(
            select(Asset).where(Asset.id == row.asset_id, Asset.user_id == user_id)
        ).scalar_one_or_none()
        if asset is None:
            raise AssetNotFoundError(f"Asset with id {row.asset_id} doesn't exist")

        balance = balances.get(asset.id, Decimal("0.00"))
        delta = (row.declared_balance - balance).quantize(Decimal("0.01"))
        rows.append(
            ReconciliationRow(
                asset_id=asset.id,
                balance=balance,
                declared_balance=row.declared_balance,
                delta=delta,
            )
        )
        if delta != 0:
            adjustment = BalanceAdjustment(
                asset_id=asset.id,
                amount=delta,
                occurred_on=data.occurred_on,
                note=data.note,
                user_id=user_id,
            )
            db.add(adjustment)
            adjustments.append(adjustment)

    db.commit()
    for adjustment in adjustments:
        db.refresh(adjustment)
    return ReconciliationResult(adjustments=adjustments, rows=rows)


def list_adjustments(
    db: Session, user_id: int, asset_id: int | None = None
) -> list[BalanceAdjustment]:
    query = select(BalanceAdjustment).where(BalanceAdjustment.user_id == user_id)
    if asset_id is not None:
        query = query.where(BalanceAdjustment.asset_id == asset_id)
    return list(
        db.execute(
            query.order_by(BalanceAdjustment.occurred_on.desc(), BalanceAdjustment.id.desc())
        )
        .scalars()
        .all()
    )


def delete_adjustment(db: Session, user_id: int, adjustment_id: int) -> BalanceAdjustment:
    adjustment = db.execute(
        select(BalanceAdjustment).where(
            BalanceAdjustment.id == adjustment_id, BalanceAdjustment.user_id == user_id
        )
    ).scalar_one_or_none()
    if adjustment is None:
        raise AdjustmentNotFoundError(f"Adjustment with id {adjustment_id} doesn't exist")
    db.delete(adjustment)
    db.commit()
    return adjustment
