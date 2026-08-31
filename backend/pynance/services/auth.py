import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from pynance.config import settings
from pynance.models.session import Session as UserSession
from pynance.models.user import User
from pynance.schemas.user import UserCreate, UserLogin
from pynance.services.exceptions import (
    DuplicateEmailError,
    InvalidCredentialsError,
)
from pynance.services.security import hash_password, verify_password


def register_user(db: Session, data: UserCreate) -> User:
    email = db.execute(
        select(User).where(func.lower(User.email) == data.email.lower())
    ).scalar_one_or_none()
    if email:
        raise DuplicateEmailError(f"Email {data.email.lower()} already exists")

    new_user = User(email=data.email.lower(), password_hash=hash_password(data.password))
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


def login_user(db: Session, data: UserLogin) -> UserSession:
    user = db.execute(
        select(User).where(func.lower(User.email) == data.email.lower())
    ).scalar_one_or_none()
    if not user:
        raise InvalidCredentialsError("Invalid email or password")

    if not verify_password(data.password, user.password_hash):
        raise InvalidCredentialsError("Invalid email or password")

    user_session = UserSession(
        user_id=user.id,
        token=secrets.token_urlsafe(32),
        expires_at=datetime.now(UTC) + timedelta(days=settings.access_session_expire_days),
    )
    db.add(user_session)
    db.commit()
    db.refresh(user_session)
    return user_session


def logout_user(db: Session, token: str) -> None:
    session = db.execute(select(UserSession).where(UserSession.token == token)).scalar_one_or_none()

    if session is not None:
        db.delete(session)
        db.commit()


def get_user_by_token(db: Session, token: str) -> User | None:
    session = db.execute(select(UserSession).where(UserSession.token == token)).scalar_one_or_none()
    if session is None or session.expires_at <= datetime.now(UTC):
        return None

    return session.user
