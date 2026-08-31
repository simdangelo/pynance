"""add users sessions and user_id ownership

Revision ID: 2832174e63af
Revises: c0868db1c4b8
Create Date: 2026-08-28 08:53:33.771309

"""
from collections.abc import Sequence
from datetime import UTC, datetime

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '2832174e63af'
down_revision: str | Sequence[str] | None = 'c0868db1c4b8'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Seed user that owns all pre-existing rows (single-user data imported before
# authentication existed). Replace before real use in production.
SEED_EMAIL = "seed@pynance.local"
SEED_PASSWORD_HASH = "!"  # bcrypt-style placeholder; never a real password


def _add_user_id_with_backfill(table: str, fk_name: str) -> None:
    """Add a NOT NULL user_id FK to a table, backfilling existing rows to the seed user."""
    op.add_column(table, sa.Column('user_id', sa.Integer(), nullable=True))
    op.execute(
        f"UPDATE {table} SET user_id = (SELECT id FROM users WHERE email = '{SEED_EMAIL}')"
    )
    op.alter_column(table, 'user_id', nullable=False)
    op.create_foreign_key(fk_name, table, 'users', ['user_id'], ['id'])


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email'),
    )
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)

    op.create_table(
        'sessions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('token', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_sessions_user_id'),
        sa.PrimaryKeyConstraint('id'),
    )

    # Seed user that owns all pre-existing data.
    op.execute(
        f"INSERT INTO users (email, password_hash, created_at) VALUES "
        f"('{SEED_EMAIL}', '{SEED_PASSWORD_HASH}', '{datetime.now(UTC).isoformat()}')"
    )

    _add_user_id_with_backfill('assets', 'fk_assets_user_id')
    op.drop_constraint(op.f('assets_name_key'), 'assets', type_='unique')
    op.create_unique_constraint('uq_asset_user_id', 'assets', ['user_id', 'name'])

    _add_user_id_with_backfill('categories', 'fk_categories_user_id')
    op.drop_constraint(op.f('uq_categories_name'), 'categories', type_='unique')
    op.create_unique_constraint('uq_category_user_id', 'categories', ['user_id', 'name'])

    _add_user_id_with_backfill('recurring_templates', 'fk_recurring_templates_user_id')

    _add_user_id_with_backfill('transactions', 'fk_transactions_user_id')

    _add_user_id_with_backfill('transfers', 'fk_transfers_user_id')


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_transfers_user_id', 'transfers', type_='foreignkey')
    op.drop_column('transfers', 'user_id')
    op.drop_constraint('fk_transactions_user_id', 'transactions', type_='foreignkey')
    op.drop_column('transactions', 'user_id')
    op.drop_constraint('fk_recurring_templates_user_id', 'recurring_templates', type_='foreignkey')
    op.drop_column('recurring_templates', 'user_id')
    op.drop_constraint('fk_categories_user_id', 'categories', type_='foreignkey')
    op.drop_constraint('uq_category_user_id', 'categories', type_='unique')
    op.create_unique_constraint(op.f('uq_categories_name'), 'categories', ['name'])
    op.drop_column('categories', 'user_id')
    op.drop_constraint('fk_assets_user_id', 'assets', type_='foreignkey')
    op.drop_constraint('uq_asset_user_id', 'assets', type_='unique')
    op.create_unique_constraint(op.f('assets_name_key'), 'assets', ['name'])
    op.drop_column('assets', 'user_id')
    op.drop_constraint('fk_sessions_user_id', 'sessions', type_='foreignkey')
    op.drop_table('sessions')
    op.drop_index(op.f('ix_users_id'), table_name='users')
    op.drop_table('users')
