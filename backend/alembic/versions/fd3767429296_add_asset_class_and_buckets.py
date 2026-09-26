"""add asset class and buckets

Revision ID: fd3767429296
Revises: 37a779a5efa2
Create Date: 2026-09-26 22:30:02.092418

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "fd3767429296"
down_revision: str | Sequence[str] | None = "37a779a5efa2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ASSET_CLASSES = (
    "CURRENT_ACCOUNT",
    "CASH",
    "DEPOSIT_ACCOUNT",
    "MONEY_MARKET_ETF",
    "GOVERNMENT_BOND",
    "CORPORATE_BOND",
    "BOND_ETF",
    "EQUITY_ETF",
    "STOCK",
    "REAL_ESTATE",
    "OTHER",
)
LIQUIDITY_CATEGORIES = ("LIQUID", "RESERVE", "INVESTED")

DEFAULT_BUCKETS: tuple[tuple[str, str], ...] = (
    ("Liquidità quotidiana", "LIQUID"),
    ("Fondo di emergenza", "RESERVE"),
    ("Investimenti", "INVESTED"),
)

# old Asset.type name -> (new AssetClass name, bucket liquidity category)
OLD_ASSET_TYPE_MAP: tuple[tuple[str, str, str], ...] = (
    ("LIQUID", "CURRENT_ACCOUNT", "LIQUID"),
    ("SAVINGS", "DEPOSIT_ACCOUNT", "RESERVE"),
    ("ETF", "EQUITY_ETF", "INVESTED"),
)


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()

    liquidity_category = sa.Enum(*LIQUIDITY_CATEGORIES, name="liquiditycategory")

    op.create_table(
        "buckets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("liquidity_category", liquidity_category, nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "name", name="uq_bucket_user_id"),
    )

    op.add_column("assets", sa.Column("asset_class", sa.String(length=32), nullable=True))
    op.add_column("assets", sa.Column("bucket_id", sa.Integer(), nullable=True))
    op.create_foreign_key("assets_bucket_id_fkey", "assets", "buckets", ["bucket_id"], ["id"])

    users = bind.execute(sa.text("SELECT id FROM users")).fetchall()
    for (user_id,) in users:
        bucket_ids: dict[str, int] = {}
        for sort_order, (name, category) in enumerate(DEFAULT_BUCKETS):
            result = bind.execute(
                sa.text(
                    "INSERT INTO buckets"
                    " (name, liquidity_category, sort_order, created_at, user_id)"
                    " VALUES (:name, :category, :sort_order, now(), :user_id)"
                    " RETURNING id"
                ),
                {
                    "name": name,
                    "category": category,
                    "sort_order": sort_order,
                    "user_id": user_id,
                },
            )
            bucket_ids[category] = int(result.scalar_one())

        for old_type, asset_class, category in OLD_ASSET_TYPE_MAP:
            bind.execute(
                sa.text(
                    "UPDATE assets SET asset_class = :asset_class, bucket_id = :bucket_id"
                    " WHERE user_id = :user_id AND asset_type::text = :old_type"
                ),
                {
                    "asset_class": asset_class,
                    "bucket_id": bucket_ids[category],
                    "user_id": user_id,
                    "old_type": old_type,
                },
            )

    # Defensive: no asset may be left unclassified before the NOT NULL below.
    bind.execute(sa.text("UPDATE assets SET asset_class = 'OTHER' WHERE asset_class IS NULL"))
    bind.execute(
        sa.text(
            "UPDATE assets SET bucket_id = ("
            " SELECT b.id FROM buckets b WHERE b.user_id = assets.user_id"
            " ORDER BY b.sort_order, b.id LIMIT 1"
            ") WHERE bucket_id IS NULL"
        )
    )

    op.alter_column("assets", "asset_class", nullable=False)
    op.alter_column("assets", "bucket_id", nullable=False)

    classes = ", ".join(f"'{asset_class}'" for asset_class in ASSET_CLASSES)
    op.create_check_constraint("assetclass", "assets", f"asset_class IN ({classes})")

    op.drop_column("assets", "asset_type")
    sa.Enum(name="assettype").drop(bind, checkfirst=True)


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()

    asset_type = sa.Enum("LIQUID", "SAVINGS", "ETF", name="assettype")
    asset_type.create(bind, checkfirst=True)

    op.add_column("assets", sa.Column("asset_type", asset_type, nullable=True))
    bind.execute(
        sa.text(
            "UPDATE assets SET asset_type = 'LIQUID'"
            " WHERE asset_class IN ('CURRENT_ACCOUNT', 'CASH')"
        )
    )
    bind.execute(
        sa.text("UPDATE assets SET asset_type = 'SAVINGS' WHERE asset_class = 'DEPOSIT_ACCOUNT'")
    )
    bind.execute(
        sa.text(
            "UPDATE assets SET asset_type = 'ETF'"
            " WHERE asset_class IN ('MONEY_MARKET_ETF', 'GOVERNMENT_BOND',"
            " 'CORPORATE_BOND', 'BOND_ETF', 'EQUITY_ETF', 'STOCK',"
            " 'REAL_ESTATE', 'OTHER')"
        )
    )
    bind.execute(sa.text("UPDATE assets SET asset_type = 'LIQUID' WHERE asset_type IS NULL"))
    op.alter_column("assets", "asset_type", nullable=False)

    op.drop_constraint("assetclass", "assets", type_="check")
    op.drop_constraint("assets_bucket_id_fkey", "assets", type_="foreignkey")
    op.drop_column("assets", "bucket_id")
    op.drop_column("assets", "asset_class")
    op.drop_table("buckets")
    sa.Enum(name="liquiditycategory").drop(bind, checkfirst=True)
