from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class TransferBase(BaseModel):
    source_asset_id: int
    destination_asset_id: int
    amount: Decimal
    description: str
    occurred_on: date


class TransferCreate(TransferBase):
    pass


class TransferUpdate(BaseModel):
    source_asset_id: int | None = None
    destination_asset_id: int | None = None
    amount: Decimal | None = None
    description: str | None = None
    occurred_on: date | None = None


class TransferResponse(TransferBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
