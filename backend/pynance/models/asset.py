from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from pynance.database import Base
from pynance.models.bucket import Bucket
from pynance.models.types import AssetClass, LiquidityCategory


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Non-native enum: renders as VARCHAR + CHECK, so adding a value to this
    # growing taxonomy is a normal migration (not ALTER TYPE ... ADD VALUE).
    asset_class: Mapped[AssetClass] = mapped_column(
        Enum(
            AssetClass,
            native_enum=False,
            create_constraint=True,
            validate_strings=True,
            length=32,
        ),
        nullable=False,
    )
    # Required: the liquidity headline is derived from the bucket, so an
    # asset without one would silently drop out of the totals.
    bucket_id: Mapped[int] = mapped_column(ForeignKey("buckets.id"), nullable=False)
    bucket: Mapped[Bucket] = relationship(back_populates="assets")
    opening_balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_asset_user_id"),)

    @property
    def liquidity_category(self) -> LiquidityCategory:
        """Derived from the bucket, never stored: reassigning the bucket
        reclassifies the asset everywhere with no data migration."""
        return self.bucket.liquidity_category
