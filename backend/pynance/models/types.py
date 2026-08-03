from enum import StrEnum, auto


class TransactionType(StrEnum):
    INCOME = auto()
    EXPENSE = auto()
