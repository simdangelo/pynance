from typing import Any

from telegram.ext import Application, CommandHandler, ContextTypes

from pynance.bot.handlers import balance, expense, income, start
from pynance.config import settings


def build_app() -> Application[Any, ContextTypes.DEFAULT_TYPE, Any, Any, Any, Any]:
    token = settings.telegram_bot_token.get_secret_value()
    if not token:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is not set in the environment")

    app = Application.builder().token(token).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("expense", expense))
    app.add_handler(CommandHandler("income", income))
    app.add_handler(CommandHandler("balance", balance))
    return app


if __name__ == "__main__":
    build_app().run_polling()
