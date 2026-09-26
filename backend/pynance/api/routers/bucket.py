from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from pynance.api.dependencies import CurrentUser
from pynance.database import get_db
from pynance.models.bucket import Bucket
from pynance.schemas.bucket import BucketCreate, BucketResponse, BucketUpdate
from pynance.services import bucket as bucket_service
from pynance.services.exceptions import (
    BucketNotEmptyError,
    BucketNotFoundError,
    DuplicateBucketNameError,
    InvalidReassignTargetError,
)

router = APIRouter()


def _to_response(bucket: Bucket) -> BucketResponse:
    return BucketResponse.model_validate(bucket)


@router.post("", response_model=BucketResponse, status_code=status.HTTP_201_CREATED)
def create_bucket(
    bucket: BucketCreate, current_user: CurrentUser, db: Annotated[Session, Depends(get_db)]
) -> BucketResponse:
    try:
        new_bucket = bucket_service.create_bucket(db, current_user.id, bucket)
    except DuplicateBucketNameError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bucket exists") from e
    return _to_response(new_bucket)


@router.get("", response_model=list[BucketResponse], status_code=status.HTTP_200_OK)
def list_buckets(
    current_user: CurrentUser, db: Annotated[Session, Depends(get_db)]
) -> list[BucketResponse]:
    return [_to_response(bucket) for bucket in bucket_service.list_buckets(db, current_user.id)]


@router.get("/{bucket_id}", response_model=BucketResponse, status_code=status.HTTP_200_OK)
def get_bucket(
    bucket_id: int, current_user: CurrentUser, db: Annotated[Session, Depends(get_db)]
) -> BucketResponse:
    try:
        bucket = bucket_service.get_bucket(db, current_user.id, bucket_id)
    except BucketNotFoundError as e:
        raise HTTPException(status_code=404, detail="Bucket doesn't exist") from e
    return _to_response(bucket)


@router.patch("/{bucket_id}", response_model=BucketResponse, status_code=status.HTTP_200_OK)
def update_bucket(
    bucket_id: int,
    update: BucketUpdate,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> BucketResponse:
    try:
        bucket = bucket_service.update_bucket(db, current_user.id, bucket_id, update)
    except BucketNotFoundError as e:
        raise HTTPException(status_code=404, detail="Bucket doesn't exist") from e
    except DuplicateBucketNameError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bucket exists") from e
    return _to_response(bucket)


@router.delete("/{bucket_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bucket(
    bucket_id: int,
    current_user: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    reassign_to: Annotated[int | None, Query()] = None,
) -> None:
    try:
        bucket_service.delete_bucket(db, current_user.id, bucket_id, reassign_to)
    except BucketNotFoundError as e:
        raise HTTPException(status_code=404, detail="Bucket doesn't exist") from e
    except BucketNotEmptyError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Bucket still has assets"
        ) from e
    except InvalidReassignTargetError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e)) from e
