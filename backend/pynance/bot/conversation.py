from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

from pynance.database import SessionLocal
from pynance.models.asset import Asset
from pynance.models.category import Category
from pynance.models.types import AssetType, TransactionType
from pynance.schemas.transaction import TransactionCreate
from pynance.services import category as category_service
from pynance.services import transaction as transaction_service
from pynance.services.exceptions import AssetNotFoundError, CategoryNotFoundError, NotLinkedError
from pynance.services.telegram_link import get_user_by_chat

CATEGORIES_PER_PAGE = 8

CATEGORIA, IMPORTO, DESCRIZIONE, CONFERMA = range(4)


def _data(context: ContextTypes.DEFAULT_TYPE) -> dict[str, Any]:
    """The per-chat conversation data, guaranteed non-None."""
    if context.user_data is None:
        context.user_data = {}
    return context.user_data


async def _reply(update: Update, text: str, keyboard: InlineKeyboardMarkup | None = None) -> None:
    if update.message is not None:
        await update.message.reply_text(text, reply_markup=keyboard)


def _user_id_for_chat(chat_id: int) -> int | None:
    with SessionLocal() as session:
        return get_user_by_chat(session, str(chat_id))


def _require_user(chat_id: int) -> int:
    user_id = _user_id_for_chat(chat_id)
    if user_id is None:
        raise NotLinkedError(
            "Il tuo account non è collegato. "
            "Apri l'app, ottieni un codice di collegamento e invialo con /link <codice>."
        )
    return user_id


def _build_category_keyboard(user_id: int, page: int) -> InlineKeyboardMarkup:
    with SessionLocal() as session:
        categories = category_service.list_categories(session, user_id)
    expense_categories = [c for c in categories if c.transaction_type == TransactionType.EXPENSE]
    expense_categories.sort(key=lambda c: c.name)
    total_pages = max(1, (len(expense_categories) + CATEGORIES_PER_PAGE - 1) // CATEGORIES_PER_PAGE)
    page = max(0, min(page, total_pages - 1))
    start = page * CATEGORIES_PER_PAGE
    slice_ = expense_categories[start : start + CATEGORIES_PER_PAGE]

    rows: list[list[InlineKeyboardButton]] = []
    for category in slice_:
        rows.append([InlineKeyboardButton(category.name, callback_data=f"cat:{category.id}")])
    nav: list[InlineKeyboardButton] = []
    if page > 0:
        nav.append(InlineKeyboardButton("◀️", callback_data=f"page:{page - 1}"))
    if page < total_pages - 1:
        nav.append(InlineKeyboardButton("▶️", callback_data=f"page:{page + 1}"))
    if nav:
        rows.append(nav)
    rows.append([InlineKeyboardButton("✗ Annulla", callback_data="cancel")])
    return InlineKeyboardMarkup(rows)


async def category_step(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    if query is None:
        return CATEGORIA
    await query.answer()
    data = query.data or ""

    if data == "cancel":
        await query.edit_message_text("Registrazione annullata.")
        return -1

    user_id = _user_id_for_chat(update.effective_chat.id if update.effective_chat else 0)
    if user_id is None:
        await query.edit_message_text(
            "Il tuo account non è collegato. Usa /link <codice> per collegarlo."
        )
        return -1

    if data.startswith("page:"):
        page = int(data.split(":")[1])
        await query.edit_message_text(
            "Scegli la categoria:", reply_markup=_build_category_keyboard(user_id, page)
        )
        return CATEGORIA

    if data.startswith("cat:"):
        category_id = int(data.split(":")[1])
        _data(context)["category_id"] = category_id
        await query.edit_message_text("Quanto è stato l'importo? (es. 12.50)")
        return IMPORTO

    return CATEGORIA


async def amount_step(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = (update.message.text if update.message else None) or ""
    try:
        amount = Decimal(text.replace(",", ".")).quantize(Decimal("0.01"))
        if amount <= 0:
            raise ValueError
    except InvalidOperation, ValueError:
        await _reply(update, "Importo non valido. Inserisci un numero positivo (es. 12.50).")
        return IMPORTO
    _data(context)["amount"] = amount
    await _reply(update, "Descrizione?")
    return DESCRIZIONE


async def description_step(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = (update.message.text if update.message else None) or ""
    if not text:
        await _reply(update, "Descrizione obbligatoria. Scrivi una breve descrizione.")
        return DESCRIZIONE
    if text.startswith("/"):
        await _reply(update, "Descrizione obbligatoria. Scrivi una breve descrizione.")
        return DESCRIZIONE
    _data(context)["description"] = text
    amount: Decimal = _data(context)["amount"]
    category_name = _category_name(_data(context)["category_id"])
    summary = f"Registro: Spesa {amount}€ in '{category_name}' — '{text}'. Confermi?"
    keyboard = InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton("✓ Conferma", callback_data="confirm"),
                InlineKeyboardButton("✗ Annulla", callback_data="cancel"),
            ]
        ]
    )
    await _reply(update, summary, keyboard=keyboard)
    return CONFERMA


def _category_name(category_id: int) -> str:
    with SessionLocal() as session:
        category = session.execute(
            select(Category).where(Category.id == category_id)
        ).scalar_one_or_none()
    return category.name if category is not None else str(category_id)


async def confirm_step(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    if query is None:
        return CONFERMA
    await query.answer()
    data = query.data or ""

    if data == "cancel":
        await query.edit_message_text("Registrazione annullata.")
        return -1

    chat_id = update.effective_chat.id if update.effective_chat else 0
    user_id = _user_id_for_chat(chat_id)
    if user_id is None:
        await query.edit_message_text("Account non collegato. Usa /link <codice>.")
        return -1

    amount: Decimal = _data(context)["amount"]
    category_id: int = _data(context)["category_id"]
    description: str = _data(context)["description"]

    try:
        with SessionLocal() as session:
            asset_id = _default_asset_id(session, user_id)
            transaction_service.create_transaction(
                session,
                user_id,
                TransactionCreate(
                    amount=amount,
                    category_id=category_id,
                    asset_id=asset_id,
                    description=description,
                    occurred_on=date.today(),
                ),
            )
    except CategoryNotFoundError, AssetNotFoundError:
        await query.edit_message_text(
            "Qualcosa è andato storto (categoria o asset non trovato). Riprova."
        )
        return -1
    await query.edit_message_text(f"✓ Spesa registrata: {amount}€ in '{description}'")
    _data(context).clear()
    return -1


def _default_asset_id(session: Session, user_id: int) -> int:
    liquid = (
        session.execute(
            select(Asset)
            .where(Asset.asset_type == AssetType.LIQUID, Asset.user_id == user_id)
            .order_by(Asset.id)
        )
        .scalars()
        .first()
    )
    if liquid is None:
        raise AssetNotFoundError("No Liquid asset exists")
    return liquid.id


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    if update.message is not None:
        await update.message.reply_text("Registrazione annullata.")
    return -1


async def start_expense(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    chat_id = update.effective_chat.id if update.effective_chat else 0
    if _user_id_for_chat(chat_id) is None:
        await _reply(
            update,
            "Il tuo account non è collegato. "
            "Apri l'app, ottieni un codice di collegamento e invialo con /link <codice>.",
        )
        return -1
    user_id = _require_user(chat_id)
    await _reply(update, "Scegli la categoria:", keyboard=_build_category_keyboard(user_id, 0))
    return CATEGORIA
