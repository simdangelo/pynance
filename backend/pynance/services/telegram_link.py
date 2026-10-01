import secrets
from datetime import UTC, datetime, timedelta
from typing import Any, cast

import httpx
from sqlalchemy import delete, select
from sqlalchemy.engine import CursorResult
from sqlalchemy.orm import Session

from pynance.config import settings
from pynance.models.telegram_link import LinkCode, TelegramLink
from pynance.services.exceptions import (
    ChatAlreadyLinkedError,
    InvalidLinkCodeError,
    LinkCodeExpiredError,
    UserAlreadyLinkedError,
)

LINK_CODE_TTL_MINUTES = 10

_bot_username_cache: str | None = None


def get_bot_username() -> str | None:
    """Ask Telegram who the configured bot is (cached). None if unknown."""
    global _bot_username_cache
    if _bot_username_cache is not None:
        return _bot_username_cache
    token = settings.telegram_bot_token.get_secret_value()
    if not token:
        return None
    try:
        response = httpx.get(f"https://api.telegram.org/bot{token}/getMe", timeout=3.0)
        response.raise_for_status()
        payload = response.json()
    except httpx.HTTPError:
        return None
    result = payload.get("result")
    if isinstance(result, dict):
        username = result.get("username")
        if isinstance(username, str) and username:
            _bot_username_cache = username
            return username
    return None


def create_link_code(db: Session, user_id: int) -> LinkCode:
    """Generate a short-lived, single-use code the user sends to the bot.

    Any previous unused code is invalidated: at most one pending code exists.
    """
    db.execute(delete(LinkCode).where(LinkCode.user_id == user_id, LinkCode.used.is_(False)))
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


def revoke_link_codes(db: Session, user_id: int) -> int:
    """Invalidate the user's still-unused codes. A linked chat stays linked."""
    result = cast(
        "CursorResult[Any]",
        db.execute(delete(LinkCode).where(LinkCode.user_id == user_id, LinkCode.used.is_(False))),
    )
    db.commit()
    return int(result.rowcount)


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
