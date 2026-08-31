from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from pynance.api.dependencies import CurrentUser
from pynance.database import get_db
from pynance.models.category import Category
from pynance.schemas.category import CategoryCreate, CategoryResponse, CategoryUpdate
from pynance.services import category as category_service
from pynance.services.exceptions import (
    CategoryHasTransactionsError,
    CategoryNotFoundError,
    DuplicateCategoryError,
)

router = APIRouter()


@router.post("", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(
    category: CategoryCreate,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> Category:
    try:
        result = category_service.create_category(db, current_user.id, category)
    except DuplicateCategoryError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Category already exists"
        ) from e
    return result


@router.get("", response_model=list[CategoryResponse], status_code=status.HTTP_200_OK)
def list_categories(
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> list[Category]:
    return category_service.list_categories(db, current_user.id)


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: int,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> None:
    try:
        category_service.delete_category(db, current_user.id, category_id)
    except CategoryNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Category doesn't exist"
        ) from e
    except CategoryHasTransactionsError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Category is associated to existing transactions",
        ) from e


@router.patch("/{category_id}", response_model=CategoryResponse)
def update_category(
    category_id: int,
    update: CategoryUpdate,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> Category:
    try:
        return category_service.update_category(db, current_user.id, category_id, update)
    except CategoryNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Category doesn't exist"
        ) from e
