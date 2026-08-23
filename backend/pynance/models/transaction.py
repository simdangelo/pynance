from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from pynance.database import Base
from pynance.models.category import Category
from pynance.models.types import TransactionType


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    occurred_on: Mapped[date] = mapped_column(Date(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    category: Mapped[Category] = relationship()
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), nullable=False)

    @property
    def transaction_type(self) -> TransactionType:
        return self.category.transaction_type
