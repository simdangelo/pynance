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
