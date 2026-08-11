from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from pynance.database import get_db
from pynance.models.recurring_template import RecurringTemplate
from pynance.models.transaction import Transaction
from pynance.schemas.recurring_template import (
    RecurringTemplateCreate,
    RecurringTemplateResponse,
    RecurringTemplateUpdate,
)
from pynance.schemas.transaction import TransactionResponse
from pynance.services import recurring_template as recurring_template_service
from pynance.services.exceptions import (
    CategoryNotFoundError,
    NextOccurrenceNotDueError,
    PausedTemplateError,
    RecurringTemplateNotFoundError,
)

router = APIRouter()


@router.post("", response_model=RecurringTemplateResponse, status_code=status.HTTP_201_CREATED)
def create_recurring_template(
    recurring_template: RecurringTemplateCreate, db: Annotated[Session, Depends(get_db)]
) -> RecurringTemplate:
    try:
        return recurring_template_service.create_recurring_template(db, recurring_template)
    except CategoryNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Category doesn't exist"
        ) from e


@router.get("", response_model=list[RecurringTemplateResponse], status_code=status.HTTP_200_OK)
def list_recurring_templates(
    db: Annotated[Session, Depends(get_db)],
) -> list[RecurringTemplate]:
    return recurring_template_service.list_recurring_templates(db)


@router.patch(
    "/{recurring_template_id}",
    response_model=RecurringTemplateResponse,
    status_code=status.HTTP_200_OK,
)
def update_recurring_template(
    recurring_template_id: int,
    update: RecurringTemplateUpdate,
    db: Annotated[Session, Depends(get_db)],
) -> RecurringTemplate:
    try:
        return recurring_template_service.update_recurring_template(
            db, recurring_template_id, update
        )
    except RecurringTemplateNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Template doesn't exist"
        ) from e
    except CategoryNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Category doesn't exist"
        ) from e


@router.delete("/{recurring_template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recurring_template(
    recurring_template_id: int, db: Annotated[Session, Depends(get_db)]
) -> None:
    try:
        recurring_template_service.delete_recurring_template(db, recurring_template_id)
    except RecurringTemplateNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Template doesn't exist"
        ) from e


@router.post(
    "/{recurring_template_id}/generate",
    response_model=TransactionResponse,
    status_code=status.HTTP_201_CREATED,
)
def generate_next(
    recurring_template_id: int, db: Annotated[Session, Depends(get_db)]
) -> Transaction:
    try:
        return recurring_template_service.generate_next(db, recurring_template_id)
    except RecurringTemplateNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Template doesn't exist"
        ) from e
    except PausedTemplateError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Template is paused"
        ) from e
    except NextOccurrenceNotDueError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Next occurrence is not due yet"
        ) from e
