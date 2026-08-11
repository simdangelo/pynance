from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from pynance.models.types import Frequency


class RecurringTemplateBase(BaseModel):
    description: str
    amount: Decimal
    category_id: int
    frequency: Frequency
    interval: int
    next_occurrence: date
    active: bool


class RecurringTemplateCreate(RecurringTemplateBase):
    pass


class RecurringTemplateUpdate(BaseModel):
    description: str | None = None
    amount: Decimal | None = None
    category_id: int | None = None
    frequency: Frequency | None = None
    interval: int | None = None
    next_occurrence: date | None = None
    active: bool | None = None


class RecurringTemplateResponse(RecurringTemplateBase):
    id: int
    created_at: datetime
    overdue: bool

    model_config = ConfigDict(from_attributes=True)
