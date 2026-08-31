from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from pynance.models.category import Category
from pynance.schemas.category import CategoryCreate, CategoryUpdate
from pynance.services.exceptions import (
    CategoryHasTransactionsError,
    CategoryNotFoundError,
    DuplicateCategoryError,
)


def create_category(db: Session, user_id: int, category: CategoryCreate) -> Category:
    existing = db.execute(
        select(Category).where(Category.user_id == user_id, Category.name == category.name)
    ).scalar_one_or_none()
    if existing is not None:
        raise DuplicateCategoryError(f"Category with name '{category.name}' already exists")

    new_category = Category(
        name=category.name,
        transaction_type=category.transaction_type,
        user_id=user_id,
    )
    db.add(new_category)
    db.commit()
    db.refresh(new_category)
    return new_category


def list_categories(db: Session, user_id: int) -> list[Category]:
    return list(db.execute(select(Category).where(Category.user_id == user_id)).scalars().all())


def delete_category(db: Session, user_id: int, category_id: int) -> Category:
    category = db.execute(
        select(Category).where(Category.id == category_id, Category.user_id == user_id)
    ).scalar_one_or_none()
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


def update_category(
    db: Session, user_id: int, category_id: int, update: CategoryUpdate
) -> Category:
    category = db.execute(
        select(Category).where(Category.id == category_id, Category.user_id == user_id)
    ).scalar_one_or_none()
    if category is None:
        raise CategoryNotFoundError(f"Category with id '{category_id}' doesn't exist")

    for field_to_update, value in update.model_dump(exclude_unset=True).items():
        setattr(category, field_to_update, value)

    db.commit()
    db.refresh(category)
    return category
