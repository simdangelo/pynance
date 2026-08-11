from enum import StrEnum, auto


class TransactionType(StrEnum):
    INCOME = auto()
    EXPENSE = auto()


class Frequency(StrEnum):
    YEARLY = auto()
    MONTHLY = auto()
    WEEKLY = auto()
    CUSTOM = auto()
