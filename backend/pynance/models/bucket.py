from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from pynance.database import Base
from pynance.models.types import LiquidityCategory

if TYPE_CHECKING:
    from pynance.models.asset import Asset


class Bucket(Base):
    """A user-defined pot of money (purpose/strategy lives here, not on Asset).

    Buckets are configurable rows: rename/add/remove them freely. The derived
    liquidity category of an asset is read from its bucket.
    """

    __tablename__ = "buckets"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    liquidity_category: Mapped[LiquidityCategory] = mapped_column(
        Enum(LiquidityCategory), nullable=False
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    assets: Mapped[list[Asset]] = relationship(back_populates="bucket")

    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_bucket_user_id"),)
