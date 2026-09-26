from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from pynance.api.dependencies import CurrentUser
from pynance.database import get_db
from pynance.models.asset import Asset
from pynance.schemas.asset import (
    AllocationResponse,
    AssetCreate,
    AssetResponse,
    AssetUpdate,
    BucketAllocationRowResponse,
    LiquidityAllocationRowResponse,
    NetWorthTrendPointResponse,
)
from pynance.services import asset as asset_service
from pynance.services.exceptions import (
    AssetInUseError,
    AssetNotFoundError,
    BucketNotFoundError,
    DuplicateAssetNameError,
)

router = APIRouter()


def _to_response(asset: Asset, balance: Decimal) -> AssetResponse:
    return AssetResponse(
        id=asset.id,
        name=asset.name,
        asset_class=asset.asset_class,
        bucket_id=asset.bucket_id,
        liquidity_category=asset.liquidity_category,
        opening_balance=asset.opening_balance,
        balance=balance,
        created_at=asset.created_at,
    )


@router.post("", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
def create_asset(
    asset: AssetCreate, current_user: CurrentUser, db: Annotated[Session, Depends(get_db)]
) -> AssetResponse:
    try:
        new_asset = asset_service.create_asset(db, current_user.id, asset)
    except DuplicateAssetNameError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Asset already exists"
        ) from e
    except BucketNotFoundError as e:
        raise HTTPException(status_code=404, detail="Bucket doesn't exist") from e

    return _to_response(new_asset, new_asset.opening_balance)


@router.get("", response_model=list[AssetResponse], status_code=status.HTTP_200_OK)
def list_assets(
    current_user: CurrentUser, db: Annotated[Session, Depends(get_db)]
) -> list[AssetResponse]:
    assets = asset_service.list_assets(db, current_user.id)
    balances = asset_service.get_asset_balances(db, current_user.id)
    return [_to_response(asset, balances.get(asset.id, Decimal("0"))) for asset in assets]


@router.get("/net-worth-trend", response_model=list[NetWorthTrendPointResponse])
def get_net_worth_trend(
    current_user: CurrentUser,
    start_date: date,
    end_date: date,
    db: Annotated[Session, Depends(get_db)],
) -> list[asset_service.NetWorthTrendPoint]:
    return asset_service.get_net_worth_trend(db, current_user.id, start_date, end_date)


@router.get("/allocation", response_model=AllocationResponse, status_code=status.HTTP_200_OK)
def get_allocation(
    current_user: CurrentUser, db: Annotated[Session, Depends(get_db)]
) -> AllocationResponse:
    allocation = asset_service.get_allocation(db, current_user.id)
    return AllocationResponse(
        by_liquidity=[
            LiquidityAllocationRowResponse(
                liquidity_category=row.liquidity_category, total=row.total
            )
            for row in allocation.by_liquidity
        ],
        by_bucket=[
            BucketAllocationRowResponse(
                bucket_id=row.bucket_id,
                bucket_name=row.bucket_name,
                liquidity_category=row.liquidity_category,
                total=row.total,
            )
            for row in allocation.by_bucket
        ],
    )


@router.get("/{asset_id}", response_model=AssetResponse)
def get_asset(
    asset_id: int, current_user: CurrentUser, db: Annotated[Session, Depends(get_db)]
) -> AssetResponse:
    try:
        asset = asset_service.get_asset(db, current_user.id, asset_id)
    except AssetNotFoundError as e:
        raise HTTPException(status_code=404, detail="Asset doesn't exist") from e
    balance = asset_service.get_asset_balance(db, current_user.id, asset.id)
    return _to_response(asset, balance)


@router.patch("/{asset_id}", response_model=AssetResponse, status_code=status.HTTP_200_OK)
def update_asset(
    asset_id: int,
    update: AssetUpdate,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> AssetResponse:
    try:
        asset = asset_service.update_asset(db, current_user.id, asset_id, update)
    except AssetNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Asset doesn't exist"
        ) from e
    except DuplicateAssetNameError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Asset name already exist"
        ) from e
    except BucketNotFoundError as e:
        raise HTTPException(status_code=404, detail="Bucket doesn't exist") from e
    balance = asset_service.get_asset_balance(db, current_user.id, asset.id)
    return _to_response(asset, balance)


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(
    asset_id: int, current_user: CurrentUser, db: Annotated[Session, Depends(get_db)]
) -> None:
    try:
        asset_service.delete_asset(db, current_user.id, asset_id)
    except AssetNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Asset doesn't exist"
        ) from e
    except AssetInUseError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Asset is associated to existing transactions",
        ) from e
