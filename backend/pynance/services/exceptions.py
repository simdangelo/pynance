class DuplicateCategoryError(Exception):
    pass


class CategoryNotFoundError(Exception):
    pass


class TransactionNotFoundError(Exception):
    pass


class CategoryHasTransactionsError(Exception):
    pass


class MonthWithoutYearError(Exception):
    pass


class RecurringTemplateNotFoundError(Exception):
    pass


class PausedTemplateError(Exception):
    pass


class NextOccurrenceNotDueError(Exception):
    pass


class DuplicateAssetNameError(Exception):
    pass


class AssetNotFoundError(Exception):
    pass


class AssetInUseError(Exception):
    pass


class TransferNotFoundError(Exception):
    pass


class SelfTransferError(Exception):
    pass


class DuplicateEmailError(Exception):
    pass


class InvalidCredentialsError(Exception):
    pass
