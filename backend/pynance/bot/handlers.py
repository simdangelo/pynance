import asyncio
from datetime import date
from decimal import Decimal, InvalidOperation

from sqlalchemy import select
from sqlalchemy.orm import Session
from telegram import Update
from telegram.ext import ContextTypes

from pynance.config import settings
from pynance.database import SessionLocal
from pynance.models.asset import Asset
from pynance.models.types import AssetType, TransactionType
from pynance.schemas.transaction import TransactionCreate
from pynance.services import asset as asset_service
from pynance.services import category as category_service
from pynance.services import transaction as transaction_service
from pynance.services.exceptions import (
    AssetNotFoundError,
    CategoryNotFoundError,
)


def _is_allowed(update: Update) -> bool:
    chat_id = update.effective_chat.id if update.effective_chat else None
    return chat_id == settings.telegram_allowed_chat_id


def _default_asset_id(session: Session) -> int:
    """Return the single Liquid asset's id, or the first liquid asset."""
    liquid = (
        session.execute(
            select(Asset).where(Asset.asset_type == AssetType.LIQUID).order_by(Asset.id)
        )
        .scalars()
        .first()
    )
    if liquid is None:
        raise AssetNotFoundError("No Liquid asset exists")
    return liquid.id


def _resolve_category(session: Session, name: str) -> int:
    """Match a category by exact name, then case-insensitive."""
    categories = category_service.list_categories(session)
    exact = next((c for c in categories if c.name == name), None)
    if exact is not None:
        return exact.id
    lowered = next((c for c in categories if c.name.lower() == name.lower()), None)
    if lowered is not None:
        return lowered.id
    names = ", ".join(sorted(c.name for c in categories))
    raise CategoryNotFoundError(f"Unknown category '{name}'. Available: {names}")


def _parse_amount(raw: str) -> Decimal:
    return Decimal(raw.replace(",", ".")).quantize(Decimal("0.01"))


def _log_transaction(session: Session, transaction_type: TransactionType, parts: list[str]) -> str:
    if not parts:
        raise ValueError("Usage: /<command> <amount> <category> [description]")
    amount = _parse_amount(parts[0])
    if amount <= 0:
        raise ValueError("Amount must be positive")
    if len(parts) < 2:
        raise ValueError("Missing category")
    category_id = _resolve_category(session, parts[1])
    description = " ".join(parts[2:]) if len(parts) > 2 else parts[1]

    transaction_service.create_transaction(
        session,
        TransactionCreate(
            amount=amount,
            category_id=category_id,
            asset_id=_default_asset_id(session),
            description=description,
            occurred_on=date.today(),
        ),
    )
    return f"✓ Logged {transaction_type.value} {amount} in '{description}'"


async def _reply(update: Update, text: str) -> None:
    message = update.message
    if message is not None:
        await message.reply_text(text)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_allowed(update):
        return
    await _reply(
        update,
        "Pynance bot — quick transaction logging.\n\n"
        "Commands:\n"
        "/expense <amount> <category> [description]\n"
        "/income <amount> <category> [description]\n"
        "/balance",
    )


async def expense(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_allowed(update):
        return
    try:
        with SessionLocal() as session:
            reply = await asyncio.to_thread(
                _log_transaction, session, TransactionType.EXPENSE, context.args or []
            )
    except (ValueError, CategoryNotFoundError, AssetNotFoundError, InvalidOperation) as e:
        reply = str(e)
    await _reply(update, reply)


async def income(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_allowed(update):
        return
    try:
        with SessionLocal() as session:
            reply = await asyncio.to_thread(
                _log_transaction, session, TransactionType.INCOME, context.args or []
            )
    except (ValueError, CategoryNotFoundError, AssetNotFoundError, InvalidOperation) as e:
        reply = str(e)
    await _reply(update, reply)


async def balance(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _is_allowed(update):
        return
    try:
        with SessionLocal() as session:
            balances = await asyncio.to_thread(asset_service.get_asset_balances, session)
        if not balances:
            reply = "No assets yet."
        else:
            total = sum(balances.values())
            reply = f"Total balance: {total}"
    except Exception as e:
        reply = str(e)
    await _reply(update, reply)
