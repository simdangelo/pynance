"""rename date to occurred_on

Revision ID: e05b814b1dda
Revises: c2114fc97c93
Create Date: 2026-08-05 22:12:17.504207

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e05b814b1dda'
down_revision: str | Sequence[str] | None = 'c2114fc97c93'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column('transactions', "date", new_column_name="occurred_on")
    op.create_unique_constraint('uq_categories_name', 'categories', ["name"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("uq_categories_name", 'categories', type_='unique')
    op.alter_column("transactions", "occurred_on", new_column_name="date")