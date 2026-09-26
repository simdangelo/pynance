from datetime import datetime

from pydantic import BaseModel, ConfigDict

from pynance.models.types import LiquidityCategory


class BucketBase(BaseModel):
    name: str
    description: str | None = None


class BucketCreate(BucketBase):
    liquidity_category: LiquidityCategory
    sort_order: int | None = None


class BucketUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    liquidity_category: LiquidityCategory | None = None
    sort_order: int | None = None


class BucketResponse(BucketBase):
    id: int
    liquidity_category: LiquidityCategory
    sort_order: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
