import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from pynance.models.telegram_link import LinkCode, TelegramLink
from pynance.services.exceptions import (
    ChatAlreadyLinkedError,
    InvalidLinkCodeError,
    LinkCodeExpiredError,
    UserAlreadyLinkedError,
)

LINK_CODE_TTL_MINUTES = 10


def create_link_code(db: Session, user_id: int) -> LinkCode:
    """Generate a short-lived, single-use code the user sends to the bot."""
    code = secrets.token_urlsafe(8)
    link_code = LinkCode(
        code=code,
        user_id=user_id,
        expires_at=datetime.now(UTC) + timedelta(minutes=LINK_CODE_TTL_MINUTES),
        used=False,
    )
    db.add(link_code)
    db.commit()
    db.refresh(link_code)
    return link_code


def link_chat(db: Session, code: str, chat_id: str) -> TelegramLink:
    """Consume a link code and bind the chat to its user."""
    row = db.execute(select(LinkCode).where(LinkCode.code == code)).scalar_one_or_none()
    if row is None or row.used:
        raise InvalidLinkCodeError("Invalid or already-used link code")
    if row.expires_at < datetime.now(UTC):
        raise LinkCodeExpiredError("Link code expired")

    existing = db.execute(
        select(TelegramLink).where(TelegramLink.chat_id == chat_id)
    ).scalar_one_or_none()
    if existing is not None:
        raise ChatAlreadyLinkedError("This chat is already linked")

    existing_user = db.execute(
        select(TelegramLink).where(TelegramLink.user_id == row.user_id)
    ).scalar_one_or_none()
    if existing_user is not None:
        raise UserAlreadyLinkedError("This user is already linked to another chat")

    row.used = True
    link = TelegramLink(chat_id=chat_id, user_id=row.user_id)
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


def unlink_chat(db: Session, chat_id: str) -> None:
    link = db.execute(
        select(TelegramLink).where(TelegramLink.chat_id == chat_id)
    ).scalar_one_or_none()
    if link is not None:
        db.delete(link)
        db.commit()


def get_user_by_chat(db: Session, chat_id: str) -> int | None:
    """Return the user_id bound to this chat, or None if not linked."""
    link = db.execute(
        select(TelegramLink).where(TelegramLink.chat_id == chat_id)
    ).scalar_one_or_none()
    if link is None:
        return None
    return link.user_id


def is_linked(db: Session, chat_id: str) -> bool:
    return get_user_by_chat(db, chat_id) is not None
