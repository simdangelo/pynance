from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class BalanceAdjustmentResponse(BaseModel):
    id: int
    asset_id: int
    amount: Decimal
    occurred_on: date
    note: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReconciliationRowRequest(BaseModel):
    asset_id: int
    declared_balance: Decimal


class ReconciliationRequest(BaseModel):
    occurred_on: date
    note: str | None = None
    rows: list[ReconciliationRowRequest]


class ReconciliationRowResult(BaseModel):
    asset_id: int
    balance: Decimal
    declared_balance: Decimal
    delta: Decimal


class ReconciliationResponse(BaseModel):
    adjustments: list[BalanceAdjustmentResponse]
    rows: list[ReconciliationRowResult]
