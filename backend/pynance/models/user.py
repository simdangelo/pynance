from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from pynance.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    # Quick-entry asset (Telegram bot, recurring templates). NULL means
    # "use the automatic heuristic". use_alter breaks the users<->assets cycle.
    default_asset_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "assets.id",
            ondelete="SET NULL",
            use_alter=True,
            name="users_default_asset_id_fkey",
        ),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
