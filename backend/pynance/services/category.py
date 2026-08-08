from sqlalchemy import select
from sqlalchemy.orm import Session

from pynance.models.category import Category
from pynance.schemas.category import CategoryCreate
from pynance.services.exceptions import DuplicateCategoryError


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
