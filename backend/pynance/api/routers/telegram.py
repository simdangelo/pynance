from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from pynance.api.dependencies import CurrentUser
from pynance.database import get_db
from pynance.services import telegram_link as telegram_link_service

router = APIRouter()


@router.post("/link-code", status_code=201)
def create_link_code(
    current_user: CurrentUser, db: Annotated[Session, Depends(get_db)]
) -> dict[str, str]:
    link_code = telegram_link_service.create_link_code(db, current_user.id)
    return {"code": link_code.code}
