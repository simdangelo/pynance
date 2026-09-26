from enum import StrEnum, auto


class TransactionType(StrEnum):
    INCOME = auto()
    EXPENSE = auto()


class Frequency(StrEnum):
    YEARLY = auto()
    MONTHLY = auto()
    WEEKLY = auto()
    CUSTOM = auto()


class LiquidityCategory(StrEnum):
    LIQUID = auto()
    RESERVE = auto()
    INVESTED = auto()


class AssetClass(StrEnum):
    CURRENT_ACCOUNT = auto()
    DEPOSIT_ACCOUNT = auto()
    MONEY_MARKET_ETF = auto()
    GOVERNMENT_BOND = auto()
    CORPORATE_BOND = auto()
    BOND_ETF = auto()
    EQUITY_ETF = auto()
    STOCK = auto()
    OTHER = auto()
