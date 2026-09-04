from telegram import ReplyKeyboardMarkup, Update
from telegram.ext import ContextTypes

from pynance.database import SessionLocal
from pynance.services import asset as asset_service
from pynance.services import telegram_link as telegram_link_service
from pynance.services.exceptions import (
    ChatAlreadyLinkedError,
    InvalidLinkCodeError,
    LinkCodeExpiredError,
    UserAlreadyLinkedError,
)

MAIN_KEYBOARD = ReplyKeyboardMarkup([["➕ Nuova spesa"]], resize_keyboard=True)


async def _reply(update: Update, text: str) -> None:
    if update.message is not None:
        await update.message.reply_text(text, reply_markup=MAIN_KEYBOARD)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id if update.effective_chat else 0
    with SessionLocal() as session:
        user_id = telegram_link_service.get_user_by_chat(session, str(chat_id))
    if user_id is None:
        await _reply(
            update,
            "Pynance bot.\n\n"
            "Per collegare il tuo account: apri l'app, ottieni un codice e invialo "
            "con /link <codice>.\n\n"
            "Comandi:\n"
            "/link <codice> — collega questa chat al tuo account\n"
            "/unlink — scollega questa chat\n"
            "/balance — saldo totale\n"
            "/start — questo messaggio",
        )
    else:
        await _reply(
            update,
            "Pynance bot — account collegato.\n\n"
            "Tocca '➕ Nuova spesa' per registrare una spesa.\n"
            "/balance — saldo totale\n"
            "/unlink — scollega questa chat",
        )


async def link(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id if update.effective_chat else 0
    args = context.args or []
    if len(args) != 1:
        await _reply(update, "Uso: /link <codice>")
        return
    code = args[0]
    try:
        with SessionLocal() as session:
            telegram_link_service.link_chat(session, code, str(chat_id))
    except InvalidLinkCodeError:
        await _reply(update, "Codice non valido o già usato.")
    except LinkCodeExpiredError:
        await _reply(update, "Codice scaduto. Ottienine uno nuovo dall'app.")
    except ChatAlreadyLinkedError:
        await _reply(update, "Questa chat è già collegata a un account.")
    except UserAlreadyLinkedError:
        await _reply(update, "Questo account è già collegato a un'altra chat.")
    else:
        await _reply(update, "✓ Account collegato! Tocca '➕ Nuova spesa' per iniziare.")


async def unlink(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id if update.effective_chat else 0
    with SessionLocal() as session:
        telegram_link_service.unlink_chat(session, str(chat_id))
    await _reply(update, "Chat scollegata. Per ri-collegarla, usa /link <codice>.")


async def balance(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id if update.effective_chat else 0
    with SessionLocal() as session:
        user_id = telegram_link_service.get_user_by_chat(session, str(chat_id))
        if user_id is None:
            await _reply(update, "Account non collegato. Usa /link <codice> per collegarlo.")
            return
        balances = asset_service.get_asset_balances(session, user_id)
    if not balances:
        await _reply(update, "Nessun asset disponibile.")
    else:
        total = sum(balances.values())
        await _reply(update, f"Saldo totale: {total}€")
