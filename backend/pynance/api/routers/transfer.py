from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from pynance.api.dependencies import CurrentUser
from pynance.database import get_db
from pynance.models.transfer import Transfer
from pynance.schemas.transfer import TransferCreate, TransferResponse, TransferUpdate
from pynance.services import transfer as transfer_service
from pynance.services.exceptions import (
    AssetNotFoundError,
    MonthWithoutYearError,
    SelfTransferError,
    TransferNotFoundError,
)

router = APIRouter()


@router.post("", response_model=TransferResponse, status_code=status.HTTP_201_CREATED)
def create_transfer(
    transfer: TransferCreate, current_user: CurrentUser, db: Annotated[Session, Depends(get_db)]
) -> Transfer:
    try:
        return transfer_service.create_transfer(db, current_user.id, transfer)
    except AssetNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Asset doesn't exist"
        ) from e
    except SelfTransferError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="To complete a transfer source asset must be different from Destination asset",
        ) from e


@router.get("/{transfer_id}", response_model=TransferResponse, status_code=status.HTTP_200_OK)
def get_transfer(
    transfer_id: int, current_user: CurrentUser, db: Annotated[Session, Depends(get_db)]
) -> Transfer:
    try:
        return transfer_service.get_transfer(db, current_user.id, transfer_id)
    except TransferNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Transfer doesn't exist"
        ) from e


@router.get("", response_model=list[TransferResponse], status_code=status.HTTP_200_OK)
def list_transfers(
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    q: str | None = None,
    year: int | None = None,
    month: int | None = None,
    source_asset_id: int | None = None,
    destination_asset_id: int | None = None,
) -> list[Transfer]:
    filter_params = transfer_service.TransferFilters(
        q, year, month, source_asset_id, destination_asset_id
    )
    try:
        return transfer_service.list_transfers(db, current_user.id, filter_params)
    except MonthWithoutYearError as e:
        raise HTTPException(
            detail="Cannot filter month without year", status_code=status.HTTP_400_BAD_REQUEST
        ) from e


@router.patch("/{transfer_id}", response_model=TransferResponse, status_code=status.HTTP_200_OK)
def update_transfer(
    transfer_id: int,
    update: TransferUpdate,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> Transfer:
    try:
        return transfer_service.update_transfer(db, current_user.id, transfer_id, update)
    except TransferNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Transfer doesn't exist"
        ) from e
    except AssetNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Asset doesn't exist"
        ) from e
    except SelfTransferError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="To complete a transfer source asset must be different from Destination asset",
        ) from e


@router.delete("/{transfer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transfer(
    transfer_id: int, current_user: CurrentUser, db: Annotated[Session, Depends(get_db)]
) -> None:
    try:
        transfer_service.delete_transfer(db, current_user.id, transfer_id)
    except TransferNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Transfer doesn't exist"
        ) from e
