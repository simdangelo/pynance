from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from pynance.models.types import TransactionType


class TransactionBase(BaseModel):
    transaction_type: TransactionType
    amount: Decimal
    category_id: int
    asset_id: int
    description: str
    occurred_on: date


class TransactionCreate(BaseModel):
    amount: Decimal
    category_id: int
    asset_id: int
    description: str
    occurred_on: date


class TransactionUpdate(BaseModel):
    amount: Decimal | None = None
    category_id: int | None = None
    asset_id: int | None = None
    description: str | None = None
    occurred_on: date | None = None


class TransactionResponse(TransactionBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SummaryResponse(BaseModel):
    income: Decimal
    expense: Decimal


class SummaryByCategoryRowResponse(BaseModel):
    category_id: int
    category_name: str
    amount: Decimal


class TrendPointResponse(BaseModel):
    year: int
    month: int
    expense: Decimal
    income: Decimal


class TrendByCategoryPointResponse(BaseModel):
    year: int
    month: int
    amount: Decimal


class TrendByCategoryResponse(BaseModel):
    category_id: int
    category_name: str
    points: list[TrendByCategoryPointResponse]


class ComparisonResponse(BaseModel):
    current: SummaryResponse
    previous: SummaryResponse
