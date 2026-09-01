from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from pynance.database import get_db
from pynance.models.user import User
from pynance.services.auth import get_user_by_token

SESSION_COOKIE_NAME = "session_token"


def get_current_user(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> User:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    user = get_user_by_token(db, token) if token else None
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
        )
    request.state.user_id = user.id
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
