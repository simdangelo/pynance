"""add exclude from reports to categories

Revision ID: fd97b0e9af5a
Revises: 2fce418f26b2
Create Date: 2026-10-13 07:30:16.882858

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "fd97b0e9af5a"
down_revision: str | Sequence[str] | None = "2fce418f26b2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    # Existing categories default to "included in reports".
    op.add_column("categories", sa.Column("exclude_from_reports", sa.Boolean(), nullable=True))
    bind.execute(sa.text("UPDATE categories SET exclude_from_reports = false"))
    op.alter_column("categories", "exclude_from_reports", nullable=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("categories", "exclude_from_reports")
