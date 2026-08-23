from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from pynance.models.types import AssetType


class AssetBase(BaseModel):
    name: str
    asset_type: AssetType
    opening_balance: Decimal


class AssetCreate(AssetBase):
    pass


class AssetUpdate(BaseModel):
    name: str | None = None
    asset_type: AssetType | None = None
    opening_balance: Decimal | None = None


class AssetResponse(AssetBase):
    id: int
    created_at: datetime
    balance: Decimal

    model_config = ConfigDict(from_attributes=True)
