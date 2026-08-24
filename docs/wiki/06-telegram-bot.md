# Module 6 — Telegram bot: a second client

The third *presentation layer* of Pynance (after the web frontend and the
REST API itself). It solves a practical problem: recording a transaction
requires opening the PC, so small purchases get forgotten. A Telegram bot
lets you register a transaction from your phone in seconds.

This module is a great architectural lesson: **the service layer is
framework-free, so it can serve any number of clients — not just HTTP.** The
bot is proof that the layered architecture pays off. It's also a chance to
meet **asyncio** and an external service integration.

This file is self-contained: read it, then do the exercise at the bottom.

---

## The concept: a bot is just another client

You already have one client — the web frontend, which talks to the backend
over HTTP (JSON REST). The Telegram bot is a *different* client: instead of
HTTP, it talks to **Telegram's Bot API** (a web service run by Telegram), and
instead of a browser it's a phone conversation.

But the business logic — creating a transaction, finding a category, summing
a balance — is **identical**. So the bot must reuse the existing service
layer, not re-implement it. That's the whole point:

```
User (phone) → Telegram servers → our bot process → service layer → DB
User (browser) → our FastAPI server → service layer → DB
```

Two entry points, one brain.

## Telegram Bot API basics

- **Create a bot** via BotFather: you get a **token** (a secret, like a
  password). Never commit it.
- **Long-polling** vs **webhooks**:
  - **Long-polling**: our process asks Telegram "any new messages?" on a loop.
    Simple, works from anywhere, no public URL needed. Right for a
    single-user dev tool.
  - **Webhooks**: Telegram calls *our* URL when a message arrives. Needs a
    public HTTPS endpoint. Right for production scale.
- **Update**: a message (or callback) Telegram delivers to us. Each has an
  `update_id`, `message`, `chat.id`, `text`, etc.
- **chat_id**: Telegram's id for the conversation. For a personal bot, you
  restrict to your own chat_id so strangers can't use it.

## The library: python-telegram-bot

`python-telegram-bot` (PTB) is the mainstream library. It's built on
**asyncio** — handlers are async functions. Install it with `uv add
python-telegram-bot`.

Core pieces:

```python
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text("Hello!")

app = Application.builder().token(TOKEN).build()
app.add_handler(CommandHandler("start", start))
app.run_polling()
```

- `CommandHandler("expense", ...)` — matches `/expense ...`.
- `update.message.text` — the full message text; `.args` gives the words
  after the command (PTB already splits them for you).

## Why asyncio matters (and the pitfall)

PTB is async: your handlers run on an event loop. **The rule to remember:
don't block the loop with sync I/O.** Our DB access is *synchronous*
(SQLAlchemy, ADR 0002). If you call it directly inside an async handler, the
whole bot freezes while the DB query runs.

The clean fix: **run the sync DB work in a worker thread** so the event loop
stays responsive, using `asyncio.to_thread`:

```python
async def expense(update, context):
    result = await asyncio.to_thread(create_transaction, session, data)
```

This is the same idea as FastAPI's `run_in_threadpool` (which the API uses
for sync endpoints). The bot needs the same treatment because it's async.

## Reusing the service layer

The bot needs a `Session` and the same service functions. Two things to get
right:

1. **One session per update** — create a `SessionLocal()` for the handler,
   close it after, like `get_db` does for the API. Don't share one session
   across messages.

2. **Call the service, not the model** — the bot uses
   `services/transaction.create_transaction` (which validates the category,
   commits, refreshes). It must *not* construct `Transaction(...)` itself —
   that would bypass the rules. This is the architecture boundary: the bot
   is presentation, services are business logic.

## The message-parsing design

Structured commands make parsing explicit:

```
/expense 5.50 groceries      → amount=5.50, category="groceries"
/income 100 salary           → amount=100, category="salary"
/balance                     → reply with current balance
```

Parsing in Python:

```python
parts = context.args           # ["5.50", "groceries"]
amount = Decimal(parts[0])     # parse carefully (see ADR 0001: never float)
category_name = " ".join(parts[1:])
```

Then resolve `category_name` to a `category_id` (case-insensitive match), and
`asset_id` to the default Liquid asset (the user's single Liquid asset, or
the first liquid one).

## Pitfalls

- **Committing the token** — `.env` is gitignored; never hardcode the token
  in code.
- **Blocking the event loop** — async handler + sync DB = frozen bot. Use
  `asyncio.to_thread`.
- **`Decimal(amount)` from a float or imprecise string** — parse from the
  raw string, and reuse the same money-handling rule as ADR 0001. A user can
  type `5.5` — handle it.
- **Unknown category** — reply with a helpful error ("Unknown category;
  available: ...") instead of crashing.
- **Unhandled errors** — wrap the handler body; always reply with *something*
  so the user isn't left wondering if it worked.
- **Foreign chat_id** — check `update.effective_chat.id` against your
  allowed id and ignore others.

---

## What to do on your own (the exercise)

1. **Dependency** — `uv add python-telegram-bot`.
2. **Settings** — add `telegram_bot_token` (SecretStr) and
   `telegram_allowed_chat_id` to `Settings`.
3. **Bot package** — `pynance/bot/` (facade `__init__` per convention). A
   handler module and an entry point module (`main`).
4. **Handlers** — `/start`, `/expense`, `/income`, `/balance`. Each creates
   its own `SessionLocal`, runs the sync service call via `asyncio.to_thread`,
   and replies success/failure. Enforce the allowed-chat check.
5. **Balance handler** — reuse `services/asset.get_asset_balance` (or sum
   balances) and reply the number.
6. **Run it** — a small `if __name__ == "__main__":` that builds the
   `Application`, adds handlers, and calls `run_polling()`.

Send me your code when done. To try it: run the bot process alongside the
web app, and message your bot `/expense 5.50 groceries` from Telegram.