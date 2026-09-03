from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from pynance.api.dependencies import SESSION_COOKIE_NAME, CurrentUser
from pynance.config import settings
from pynance.database import get_db
from pynance.models.user import User
from pynance.schemas.user import UserCreate, UserLogin, UserResponse
from pynance.services import auth as auth_service
from pynance.services.exceptions import (
    DuplicateEmailError,
    InvalidCredentialsError,
)

router = APIRouter()


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user: UserCreate, db: Annotated[Session, Depends(get_db)]) -> User:
    try:
        return auth_service.register_user(db, user)
    except DuplicateEmailError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email already exists"
        ) from e


@router.post("/login", response_model=UserResponse)
def login(user: UserLogin, response: Response, db: Annotated[Session, Depends(get_db)]) -> User:
    try:
        session = auth_service.login_user(db, user)
    except InvalidCredentialsError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        ) from e

    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session.token,
        httponly=True,
        secure=settings.secure_cookies,
        max_age=settings.access_session_expire_days * 24 * 60 * 60,
        samesite="lax",
    )
    return session.user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> None:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token:
        auth_service.logout_user(db, token)
    response.delete_cookie(SESSION_COOKIE_NAME)


@router.get("/me", response_model=UserResponse)
def me(current_user: CurrentUser) -> User:
    return current_user
