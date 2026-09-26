"""remove cash and real estate from asset class

Revision ID: 554b153fdbda
Revises: fd3767429296
Create Date: 2026-09-26 22:56:10.419890

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "554b153fdbda"
down_revision: str | Sequence[str] | None = "fd3767429296"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ASSET_CLASSES = (
    "CURRENT_ACCOUNT",
    "DEPOSIT_ACCOUNT",
    "MONEY_MARKET_ETF",
    "GOVERNMENT_BOND",
    "CORPORATE_BOND",
    "BOND_ETF",
    "EQUITY_ETF",
    "STOCK",
    "OTHER",
)
OLD_ASSET_CLASSES = (
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


def _check(values: tuple[str, ...]) -> str:
    return f"asset_class IN ({', '.join(f'{value!r}' for value in values)})"


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    # Rows using a removed value would violate the new CHECK: reclassify them.
    bind.execute(sa.text("UPDATE assets SET asset_class = 'CURRENT_ACCOUNT' WHERE asset_class = 'CASH'"))
    bind.execute(sa.text("UPDATE assets SET asset_class = 'OTHER' WHERE asset_class = 'REAL_ESTATE'"))

    op.drop_constraint("assetclass", "assets", type_="check")
    op.create_check_constraint("assetclass", "assets", _check(ASSET_CLASSES))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("assetclass", "assets", type_="check")
    op.create_check_constraint("assetclass", "assets", _check(OLD_ASSET_CLASSES))
