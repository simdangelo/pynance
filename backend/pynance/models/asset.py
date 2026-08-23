from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from pynance.database import Base
from pynance.models.types import AssetType


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    asset_type: Mapped[AssetType] = mapped_column(Enum(AssetType), nullable=False)
    opening_balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
