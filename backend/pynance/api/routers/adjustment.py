from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from pynance.api.dependencies import CurrentUser
from pynance.database import get_db
from pynance.models.adjustment import BalanceAdjustment
from pynance.schemas.adjustment import (
    BalanceAdjustmentResponse,
    ReconciliationRequest,
    ReconciliationResponse,
    ReconciliationRowResult,
)
from pynance.services import adjustment as adjustment_service
from pynance.services.exceptions import AdjustmentNotFoundError, AssetNotFoundError

router = APIRouter()


def _to_response(adjustment: BalanceAdjustment) -> BalanceAdjustmentResponse:
    return BalanceAdjustmentResponse.model_validate(adjustment)


@router.post("/reconcile", response_model=ReconciliationResponse, status_code=status.HTTP_200_OK)
def reconcile(
    data: ReconciliationRequest,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> ReconciliationResponse:
    try:
        result = adjustment_service.reconcile(db, current_user.id, data)
    except AssetNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return ReconciliationResponse(
        adjustments=[_to_response(adjustment) for adjustment in result.adjustments],
        rows=[
            ReconciliationRowResult(
                asset_id=row.asset_id,
                balance=row.balance,
                declared_balance=row.declared_balance,
                delta=row.delta,
            )
            for row in result.rows
        ],
    )


@router.get("", response_model=list[BalanceAdjustmentResponse], status_code=status.HTTP_200_OK)
def list_adjustments(
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    asset_id: int | None = None,
) -> list[BalanceAdjustmentResponse]:
    return [
        _to_response(adjustment)
        for adjustment in adjustment_service.list_adjustments(db, current_user.id, asset_id)
    ]


@router.delete("/{adjustment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_adjustment(
    adjustment_id: int,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> None:
    try:
        adjustment_service.delete_adjustment(db, current_user.id, adjustment_id)
    except AdjustmentNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
