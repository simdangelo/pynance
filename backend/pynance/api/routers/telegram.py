from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from pynance.api.dependencies import CurrentUser
from pynance.database import get_db
from pynance.schemas.telegram import BotInfoResponse, LinkCodeResponse
from pynance.services import telegram_link as telegram_link_service

router = APIRouter()


@router.get("/bot", response_model=BotInfoResponse, status_code=status.HTTP_200_OK)
def get_bot_info(current_user: CurrentUser) -> BotInfoResponse:
    return BotInfoResponse(bot_username=telegram_link_service.get_bot_username())


@router.post("/link-code", response_model=LinkCodeResponse, status_code=status.HTTP_201_CREATED)
def create_link_code(
    current_user: CurrentUser, db: Annotated[Session, Depends(get_db)]
) -> LinkCodeResponse:
    link_code = telegram_link_service.create_link_code(db, current_user.id)
    return LinkCodeResponse(
        code=link_code.code,
        expires_in_minutes=telegram_link_service.LINK_CODE_TTL_MINUTES,
    )


@router.delete("/link-code", status_code=status.HTTP_204_NO_CONTENT)
def revoke_link_codes(current_user: CurrentUser, db: Annotated[Session, Depends(get_db)]) -> None:
    telegram_link_service.revoke_link_codes(db, current_user.id)
