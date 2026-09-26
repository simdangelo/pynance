from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from pynance.models.types import AssetClass, LiquidityCategory


class AssetBase(BaseModel):
    name: str
    asset_class: AssetClass
    opening_balance: Decimal


class AssetCreate(AssetBase):
    bucket_id: int


class AssetUpdate(BaseModel):
    name: str | None = None
    asset_class: AssetClass | None = None
    bucket_id: int | None = None
    opening_balance: Decimal | None = None


class AssetResponse(AssetBase):
    id: int
    bucket_id: int
    liquidity_category: LiquidityCategory
    created_at: datetime
    balance: Decimal

    model_config = ConfigDict(from_attributes=True)


class NetWorthTrendPointResponse(BaseModel):
    year: int
    month: int
    amount: Decimal


class LiquidityAllocationRowResponse(BaseModel):
    liquidity_category: LiquidityCategory
    total: Decimal


class BucketAllocationRowResponse(BaseModel):
    bucket_id: int
    bucket_name: str
    liquidity_category: LiquidityCategory
    total: Decimal


class AllocationResponse(BaseModel):
    by_liquidity: list[LiquidityAllocationRowResponse]
    by_bucket: list[BucketAllocationRowResponse]
