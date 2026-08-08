from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from pynance.database import get_db
from pynance.models.transaction import Transaction
from pynance.models.types import TransactionType
from pynance.schemas.transaction import (
    CategorySpendingResponse,
    MonthlySummaryResponse,
    TransactionCreate,
    TransactionResponse,
    TransactionUpdate,
)
from pynance.services import transaction as transaction_service
from pynance.services.exceptions import (
    CategoryNotFoundError,
    TransactionNotFoundError,
    TransactionTypeMismatchError,
)

router = APIRouter()


@router.post("", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
def create_transaction(
    transaction: TransactionCreate, db: Annotated[Session, Depends(get_db)]
) -> Transaction:
    try:
        result = transaction_service.create_transaction(db, transaction)
    except CategoryNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Category doesn't exist"
        ) from e
    except TransactionTypeMismatchError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Transaction type does not match category type",
        ) from e
    return result


@router.get("/summary", response_model=MonthlySummaryResponse, status_code=status.HTTP_200_OK)
def get_monthly_summary(
    month: int, year: int, db: Annotated[Session, Depends(get_db)]
) -> transaction_service.MonthlySummary:
    return transaction_service.get_monthly_summary(db, month, year)


@router.get(
    "/spending-by-category",
    response_model=list[CategorySpendingResponse],
    status_code=status.HTTP_200_OK,
)
def get_categories_summary(
    transaction_type: TransactionType,
    month: int,
    year: int,
    db: Annotated[Session, Depends(get_db)],
) -> list[transaction_service.CategorySummary]:
    return transaction_service.get_categories_summary(db, transaction_type, month, year)


@router.get("/{transaction_id}", response_model=TransactionResponse)
def get_transaction(transaction_id: int, db: Annotated[Session, Depends(get_db)]) -> Transaction:
    try:
        result = transaction_service.get_transaction(db, transaction_id)
    except TransactionNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Transaction doesn't exist"
        ) from e
    return result


@router.patch("/{transaction_id}", response_model=TransactionResponse)
def update_transaction(
    transaction_id: int, update: TransactionUpdate, db: Annotated[Session, Depends(get_db)]
) -> Transaction:
    try:
        result = transaction_service.update_transaction(db, transaction_id, update)
    except TransactionNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Transaction doesn't exist"
        ) from e
    except CategoryNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Category doesn't exist"
        ) from e
    except TransactionTypeMismatchError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Transaction type does not match category type",
        ) from e
    return result


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(transaction_id: int, db: Annotated[Session, Depends(get_db)]) -> None:
    try:
        transaction_service.delete_transaction(db, transaction_id)
    except TransactionNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Transaction doesn't exist"
        ) from e


@router.get("", response_model=list[TransactionResponse], status_code=status.HTTP_200_OK)
def get_transactions(db: Annotated[Session, Depends(get_db)]) -> list[Transaction]:
    return transaction_service.get_transactions(db)
