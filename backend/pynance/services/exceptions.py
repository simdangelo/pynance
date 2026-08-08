class DuplicateCategoryError(Exception):
    pass


class CategoryNotFoundError(Exception):
    pass


class TransactionTypeMismatchError(Exception):
    pass


class TransactionNotFoundError(Exception):
    pass


class CategoryHasTransactionsError(Exception):
    pass
