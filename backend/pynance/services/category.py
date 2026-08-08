from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from pynance.models.category import Category
from pynance.schemas.category import CategoryCreate
from pynance.services.exceptions import (
    CategoryHasTransactionsError,
    CategoryNotFoundError,
    DuplicateCategoryError,
)


def create_category(db: Session, category: CategoryCreate) -> Category:
    existing = db.execute(
        select(Category).where(Category.name == category.name)
    ).scalar_one_or_none()
    if existing is not None:
        raise DuplicateCategoryError(f"Category with name '{category.name}' already exists")

    new_category = Category(name=category.name, transaction_type=category.transaction_type)
    db.add(new_category)
    db.commit()
    db.refresh(new_category)
    return new_category


def get_categories(db: Session) -> list[Category]:
    return list(db.execute(select(Category)).scalars().all())


def delete_category(db: Session, category_id: int) -> Category:
    category = db.execute(select(Category).where(Category.id == category_id)).scalar_one_or_none()
    if category is None:
        raise CategoryNotFoundError(f"Category with id '{category_id}' doesn't exist")

    db.delete(category)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise CategoryHasTransactionsError(
            f"Category with id '{category_id}' is associated to one or more transactions."
            " You can't delete it"
        ) from e
    return category
