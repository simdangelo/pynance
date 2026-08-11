from datetime import timedelta

from dateutil.relativedelta import relativedelta
from sqlalchemy import select
from sqlalchemy.orm import Session

from pynance.models.category import Category
from pynance.models.recurring_template import RecurringTemplate
from pynance.models.transaction import Transaction
from pynance.models.types import Frequency
from pynance.schemas.recurring_template import (
    RecurringTemplateCreate,
    RecurringTemplateUpdate,
)
from pynance.services.exceptions import (
    CategoryNotFoundError,
    PausedTemplateError,
    RecurringTemplateNotFoundError,
)


def create_recurring_template(
    db: Session, recurring_template: RecurringTemplateCreate
) -> RecurringTemplate:
    category = db.execute(
        select(Category.id).where(Category.id == recurring_template.category_id)
    ).scalar_one_or_none()
    if not category:
        raise CategoryNotFoundError(
            f"Category with id '{recurring_template.category_id}' doesn't exist"
        )

    new_recurring_template = RecurringTemplate(
        description=recurring_template.description,
        amount=recurring_template.amount,
        category_id=recurring_template.category_id,
        frequency=recurring_template.frequency,
        interval=recurring_template.interval,
        next_occurrence=recurring_template.next_occurrence,
        active=recurring_template.active,
    )

    db.add(new_recurring_template)
    db.commit()
    db.refresh(new_recurring_template)
    return new_recurring_template


def list_recurring_templates(db: Session) -> list[RecurringTemplate]:
    return list(db.execute(select(RecurringTemplate)).scalars().all())


def delete_recurring_template(db: Session, recurring_template_id: int) -> RecurringTemplate:
    recurring_template = db.execute(
        select(RecurringTemplate).where(RecurringTemplate.id == recurring_template_id)
    ).scalar_one_or_none()
    if not recurring_template:
        raise RecurringTemplateNotFoundError(
            f"Recurring template with id '{recurring_template_id}' doesn't exist"
        )

    db.delete(recurring_template)
    db.commit()
    return recurring_template


def update_recurring_template(
    db: Session, recurring_template_id: int, update: RecurringTemplateUpdate
) -> RecurringTemplate:
    recurring_template = db.execute(
        select(RecurringTemplate).where(RecurringTemplate.id == recurring_template_id)
    ).scalar_one_or_none()
    if recurring_template is None:
        raise RecurringTemplateNotFoundError(
            f"Recurring template with id '{recurring_template_id}' doesn't exist"
        )
    if update.category_id is not None:
        category = db.execute(
            select(Category).where(Category.id == update.category_id)
        ).scalar_one_or_none()
        if category is None:
            raise CategoryNotFoundError(f"Category with id '{update.category_id}' doesn't exist")

    for field_to_update, value in update.model_dump(exclude_unset=True).items():
        setattr(recurring_template, field_to_update, value)

    db.commit()
    db.refresh(recurring_template)
    return recurring_template


def generate_next(db: Session, recurring_template_id: int) -> Transaction:
    template = db.execute(
        select(RecurringTemplate).where(RecurringTemplate.id == recurring_template_id)
    ).scalar_one_or_none()
    if not template:
        raise RecurringTemplateNotFoundError(
            f"Recurring template with id '{recurring_template_id}' doesn't exist"
        )
    if not template.active:
        raise PausedTemplateError("A paused template cannot generate transactions")

    new_transaction = Transaction(
        amount=template.amount,
        category_id=template.category_id,
        description=template.description,
        occurred_on=template.next_occurrence,
    )
    db.add(new_transaction)

    start_date = template.next_occurrence
    interval = template.interval
    match template.frequency:
        case Frequency.YEARLY:
            next_occurrence = start_date + relativedelta(years=interval)
        case Frequency.MONTHLY:
            next_occurrence = start_date + relativedelta(months=interval)
        case Frequency.WEEKLY:
            next_occurrence = start_date + timedelta(weeks=interval)
        case Frequency.CUSTOM:
            next_occurrence = start_date + relativedelta(weeks=interval)
        case _:
            raise ValueError(f"Unhandled frequency: {template.frequency}")

    template.next_occurrence = next_occurrence

    db.commit()
    db.refresh(template)
    db.refresh(new_transaction)
    return new_transaction
