"""remove transaction_type from transaction table

Revision ID: 2b1849957535
Revises: e05b814b1dda
Create Date: 2026-08-10 12:27:18.718622

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '2b1849957535'
down_revision: str | Sequence[str] | None = 'e05b814b1dda'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_column('transactions', 'transaction_type')


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column('transactions', sa.Column('transaction_type', postgresql.ENUM('INCOME', 'EXPENSE', name='transactiontype'), autoincrement=False, nullable=False))
