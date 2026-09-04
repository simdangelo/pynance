from typing import Any

from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    ConversationHandler,
    MessageHandler,
    filters,
)

from pynance.bot.conversation import (
    CATEGORIA,
    CONFERMA,
    DESCRIZIONE,
    IMPORTO,
    amount_step,
    cancel,
    category_step,
    confirm_step,
    description_step,
    start_expense,
)
from pynance.bot.handlers import balance, link, start, unlink
from pynance.config import settings


def build_app() -> Application[Any, ContextTypes.DEFAULT_TYPE, Any, Any, Any, Any]:
    token = settings.telegram_bot_token.get_secret_value()
    if not token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is not set in the environment")

    app = Application.builder().token(token).build()

    expense_conv = ConversationHandler(
        entry_points=[
            MessageHandler(filters.Text(["➕ Nuova spesa"]) & ~filters.COMMAND, start_expense)
        ],
        states={
            CATEGORIA: [CallbackQueryHandler(category_step)],
            IMPORTO: [MessageHandler(filters.TEXT & ~filters.COMMAND, amount_step)],
            DESCRIZIONE: [MessageHandler(filters.TEXT & ~filters.COMMAND, description_step)],
            CONFERMA: [CallbackQueryHandler(confirm_step)],
        },
        fallbacks=[CommandHandler("cancel", cancel)],
        per_chat=True,
        conversation_timeout=300,
    )

    app.add_handler(expense_conv)
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("link", link))
    app.add_handler(CommandHandler("unlink", unlink))
    app.add_handler(CommandHandler("balance", balance))
    return app


if __name__ == "__main__":
    build_app().run_polling()
