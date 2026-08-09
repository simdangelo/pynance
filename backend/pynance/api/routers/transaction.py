from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from pynance.database import get_db
from pynance.models.transaction import Transaction
from pynance.models.types import TransactionType
from pynance.schemas.transaction import (
    ComparisonResponse,
    SummaryByCategoryRowResponse,
    SummaryResponse,
    TransactionCreate,
    TransactionResponse,
    TransactionUpdate,
    TrendByCategoryResponse,
    TrendPointResponse,
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


@router.get("/summary", response_model=SummaryResponse, status_code=status.HTTP_200_OK)
def get_summary(
    month: int, year: int, db: Annotated[Session, Depends(get_db)]
) -> transaction_service.Summary:
    return transaction_service.get_summary(db, month, year)


@router.get(
    "/summary-by-category",
    response_model=list[SummaryByCategoryRowResponse],
    status_code=status.HTTP_200_OK,
)
def get_summary_by_category(
    transaction_type: TransactionType,
    month: int,
    year: int,
    db: Annotated[Session, Depends(get_db)],
) -> list[transaction_service.SummaryByCategoryRow]:
    return transaction_service.get_summary_by_category(db, transaction_type, month, year)


@router.get("/trend", response_model=list[TrendPointResponse])
def get_trend(
    start_date: date, end_date: date, db: Annotated[Session, Depends(get_db)]
) -> list[transaction_service.TrendPoint]:
    return transaction_service.get_trend(
        db, date_range=transaction_service.DataRange(start_date, end_date)
    )


@router.get("/trend-by-category", response_model=list[TrendByCategoryResponse])
def get_trend_by_category(
    start_date: date, end_date: date, db: Annotated[Session, Depends(get_db)]
) -> list[transaction_service.TrendByCategory]:
    return transaction_service.get_trend_by_category(
        db, date_range=transaction_service.DataRange(start_date, end_date)
    )


@router.get("/comparison", response_model=ComparisonResponse)
def get_comparison(
    year: int,
    month: int,
    db: Annotated[Session, Depends(get_db)],
) -> transaction_service.Comparison:
    return transaction_service.get_comparison(db, year, month)


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
def list_transactions(db: Annotated[Session, Depends(get_db)]) -> list[Transaction]:
    return transaction_service.list_transactions(db)
