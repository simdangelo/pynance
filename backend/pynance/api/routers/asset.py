from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from pynance.database import get_db
from pynance.schemas.asset import AssetCreate, AssetResponse, AssetUpdate
from pynance.services import asset as asset_service
from pynance.services.exceptions import (
    AssetInUseError,
    AssetNotFoundError,
    DuplicateAssetNameError,
)

router = APIRouter()


@router.post("", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
def create_asset(asset: AssetCreate, db: Annotated[Session, Depends(get_db)]) -> AssetResponse:
    try:
        new_asset = asset_service.create_asset(db, asset)
    except DuplicateAssetNameError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Asset already exists"
        ) from e

    return AssetResponse(
        id=new_asset.id,
        name=new_asset.name,
        asset_type=new_asset.asset_type,
        opening_balance=new_asset.opening_balance,
        balance=new_asset.opening_balance,
        created_at=new_asset.created_at,
    )


@router.get("", response_model=list[AssetResponse], status_code=status.HTTP_200_OK)
def list_assets(db: Annotated[Session, Depends(get_db)]) -> list[AssetResponse]:
    assets = asset_service.list_assets(db)
    balances = asset_service.get_asset_balances(db)
    return [
        AssetResponse(
            id=a.id,
            name=a.name,
            asset_type=a.asset_type,
            opening_balance=a.opening_balance,
            balance=balances.get(a.id, Decimal("0")),
            created_at=a.created_at,
        )
        for a in assets
    ]


@router.get("/{asset_id}", response_model=AssetResponse)
def get_asset(asset_id: int, db: Annotated[Session, Depends(get_db)]) -> AssetResponse:
    try:
        asset = asset_service.get_asset(db, asset_id)
    except AssetNotFoundError as e:
        raise HTTPException(status_code=404, detail="Asset doesn't exist") from e
    balance = asset_service.get_asset_balance(db, asset.id)
    return AssetResponse(
        id=asset.id,
        name=asset.name,
        asset_type=asset.asset_type,
        opening_balance=asset.opening_balance,
        balance=balance,
        created_at=asset.created_at,
    )


@router.patch("/{asset_id}", response_model=AssetResponse, status_code=status.HTTP_200_OK)
def update_asset(
    asset_id: int, update: AssetUpdate, db: Annotated[Session, Depends(get_db)]
) -> AssetResponse:
    try:
        asset = asset_service.update_asset(db, asset_id, update)
    except AssetNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Asset doesn't exist"
        ) from e
    except DuplicateAssetNameError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Asset name already exist"
        ) from e
    balance = asset_service.get_asset_balance(db, asset.id)
    return AssetResponse(
        id=asset.id,
        name=asset.name,
        asset_type=asset.asset_type,
        opening_balance=asset.opening_balance,
        balance=balance,
        created_at=asset.created_at,
    )


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(asset_id: int, db: Annotated[Session, Depends(get_db)]) -> None:
    try:
        asset_service.delete_asset(db, asset_id)
    except AssetNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Asset doesn't exist"
        ) from e
    except AssetInUseError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Asset is associated to existing transactions",
        ) from e
