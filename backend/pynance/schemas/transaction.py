from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from pynance.models.types import TransactionType


class TransactionBase(BaseModel):
    transaction_type: TransactionType
    amount: Decimal
    category_id: int
    description: str
    occurred_on: date


class TransactionCreate(TransactionBase):
    pass


class TransactionUpdate(BaseModel):
    transaction_type: TransactionType | None = None
    amount: Decimal | None = None
    category_id: int | None = None
    description: str | None = None
    occurred_on: date | None = None


class TransactionResponse(TransactionBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MonthlySummaryResponse(BaseModel):
    income: Decimal
    expense: Decimal


class CategorySpendingResponse(BaseModel):
    category_id: int
    category_name: str
    amount: Decimal


class MonthlyTrendResponse(BaseModel):
    year: int
    month: int
    expense: Decimal
    income: Decimal


class CategoryMonthPointResponse(BaseModel):
    year: int
    month: int
    amount: Decimal


class CategoryTrendResponse(BaseModel):
    category_id: int
    category_name: str
    points: list[CategoryMonthPointResponse]


class MonthComparisonResponse(BaseModel):
    current: MonthlySummaryResponse
    previous: MonthlySummaryResponse
