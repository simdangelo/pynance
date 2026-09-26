from sqlalchemy import func, select
from sqlalchemy.orm import Session

from pynance.models.bucket import Bucket
from pynance.models.types import LiquidityCategory
from pynance.schemas.bucket import BucketCreate, BucketUpdate
from pynance.services.exceptions import (
    BucketNotEmptyError,
    BucketNotFoundError,
    DuplicateBucketNameError,
    InvalidReassignTargetError,
)


def create_bucket(db: Session, user_id: int, bucket: BucketCreate) -> Bucket:
    existing = db.execute(
        select(Bucket).where(Bucket.user_id == user_id, Bucket.name == bucket.name)
    ).scalar_one_or_none()
    if existing:
        raise DuplicateBucketNameError(f"Bucket with name {bucket.name} already exists")

    sort_order = bucket.sort_order
    if sort_order is None:
        max_order = db.execute(
            select(func.coalesce(func.max(Bucket.sort_order), -1)).where(Bucket.user_id == user_id)
        ).scalar_one()
        sort_order = int(max_order) + 1

    new_bucket = Bucket(
        name=bucket.name,
        description=bucket.description,
        liquidity_category=bucket.liquidity_category,
        sort_order=sort_order,
        user_id=user_id,
    )
    db.add(new_bucket)
    db.commit()
    db.refresh(new_bucket)
    return new_bucket


def get_bucket(db: Session, user_id: int, bucket_id: int) -> Bucket:
    bucket = db.execute(
        select(Bucket).where(Bucket.id == bucket_id, Bucket.user_id == user_id)
    ).scalar_one_or_none()
    if not bucket:
        raise BucketNotFoundError(f"Bucket with id {bucket_id} doesn't exist")
    return bucket


def list_buckets(db: Session, user_id: int) -> list[Bucket]:
    return list(
        db.execute(
            select(Bucket).where(Bucket.user_id == user_id).order_by(Bucket.sort_order, Bucket.name)
        )
        .scalars()
        .all()
    )


def get_default_bucket(db: Session, user_id: int) -> Bucket | None:
    return db.execute(
        select(Bucket)
        .where(Bucket.user_id == user_id)
        .order_by(Bucket.sort_order, Bucket.id)
        .limit(1)
    ).scalar_one_or_none()


def update_bucket(db: Session, user_id: int, bucket_id: int, update: BucketUpdate) -> Bucket:
    bucket = get_bucket(db, user_id, bucket_id)

    if update.name is not None and update.name != bucket.name:
        existing = db.execute(
            select(Bucket).where(Bucket.user_id == user_id, Bucket.name == update.name)
        ).scalar_one_or_none()
        if existing:
            raise DuplicateBucketNameError(f"Bucket with name {update.name} already exists")

    for field_to_update, value in update.model_dump(exclude_unset=True).items():
        setattr(bucket, field_to_update, value)

    db.commit()
    db.refresh(bucket)
    return bucket


def delete_bucket(
    db: Session, user_id: int, bucket_id: int, reassign_to_id: int | None = None
) -> Bucket:
    bucket = get_bucket(db, user_id, bucket_id)
    assets = list(bucket.assets)

    if assets:
        if reassign_to_id is None:
            raise BucketNotEmptyError(bucket.id, len(assets))
        if reassign_to_id == bucket_id:
            raise InvalidReassignTargetError("Cannot reassign assets to the bucket being deleted")
        target = get_bucket(db, user_id, reassign_to_id)
        for asset in assets:
            asset.bucket = target

    db.delete(bucket)
    db.commit()
    return bucket


def seed_default_buckets(db: Session, user_id: int) -> list[Bucket]:
    """Create the neutral starter buckets for a user, once.

    Idempotent: if the user already has any bucket nothing is added, so it is
    safe to call at registration and from a data migration.
    """
    has_any = db.execute(select(Bucket.id).where(Bucket.user_id == user_id).limit(1)).first()
    if has_any is not None:
        return []

    buckets = [
        Bucket(
            name="Liquidità quotidiana",
            liquidity_category=LiquidityCategory.LIQUID,
            sort_order=0,
            user_id=user_id,
        ),
        Bucket(
            name="Fondo di emergenza",
            liquidity_category=LiquidityCategory.RESERVE,
            sort_order=1,
            user_id=user_id,
        ),
        Bucket(
            name="Investimenti",
            liquidity_category=LiquidityCategory.INVESTED,
            sort_order=2,
            user_id=user_id,
        ),
    ]
    db.add_all(buckets)
    db.commit()
    for bucket in buckets:
        db.refresh(bucket)
    return buckets
