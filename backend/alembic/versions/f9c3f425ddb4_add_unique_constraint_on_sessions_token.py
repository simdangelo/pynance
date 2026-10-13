"""add unique constraint on sessions token

Revision ID: f9c3f425ddb4
Revises: fd97b0e9af5a
Create Date: 2026-10-13 07:37:31.812576

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f9c3f425ddb4"
down_revision: str | Sequence[str] | None = "fd97b0e9af5a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_unique_constraint("uq_sessions_token", "sessions", ["token"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("uq_sessions_token", "sessions", type_="unique")
