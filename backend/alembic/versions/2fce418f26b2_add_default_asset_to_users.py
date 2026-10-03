"""add default asset to users

Revision ID: 2fce418f26b2
Revises: 8b62a7a30a1c
Create Date: 2026-10-01 21:10:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2fce418f26b2"
down_revision: str | Sequence[str] | None = "8b62a7a30a1c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("users", sa.Column("default_asset_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "users_default_asset_id_fkey",
        "users",
        "assets",
        ["default_asset_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("users_default_asset_id_fkey", "users", type_="foreignkey")
    op.drop_column("users", "default_asset_id")
