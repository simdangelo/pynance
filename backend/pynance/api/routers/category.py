from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from pynance.database import get_db
from pynance.models.category import Category
from pynance.schemas.category import CategoryCreate, CategoryResponse
from pynance.services import category as category_service
from pynance.services.exceptions import DuplicateCategoryError

router = APIRouter()


@router.post("", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(category: CategoryCreate, db: Annotated[Session, Depends(get_db)]) -> Category:
    try:
        result = category_service.create_category(db, category)
    except DuplicateCategoryError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Category already exists"
        ) from e
    return result


@router.get("", response_model=list[CategoryResponse], status_code=status.HTTP_200_OK)
def get_categories(db: Annotated[Session, Depends(get_db)]) -> list[Category]:
    return category_service.get_categories(db)
