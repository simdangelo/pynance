# ADR 0008 — Telegram bot: per-user linking via one-time link codes

## Status
Accepted

## Context
The Telegram bot (journal 06) was built as a **single-user** tool: the
`TELEGRAM_ALLOWED_CHAT_ID` setting allowed exactly one chat, and every
command resolved to the first user in the database. That was the right call
while the app had no auth and one owner.

Two things changed since:

- **The app now has real user accounts** (Module 5, ADR 0005). Every entity
  is scoped by `user_id`, and the app may host more than one person.
- **The bot is wanted in production** (deployed on Render alongside the web
  service). In prod, a single-user bot is a contradiction: if there is more
  than one account, the bot has no way to know *whose* transaction to
  record.

The bot therefore needs a **per-user identity**: a way to know, for any
incoming message, which account the chat belongs to. This is the "linking"
problem — two identities (the internal app account, the external Telegram
`chat_id`) that must be bridged.

Two design decisions had to be made: how the link is **established**, and
how long it **lasts**.

## Decision
- **A persistent link table** (`telegram_links`) maps `chat_id → user_id`,
  with both columns UNIQUE. One chat can belong to one user, and one user to
  one chat. The bot resolves the user from the chat on every command; no
  more `_default_user_id`, no more `TELEGRAM_ALLOWED_CHAT_ID` gate.
- **The link is established via a one-time link code.** An authenticated
  user requests a short-lived code from the web API (`link_codes` table,
  expires after a few minutes); they send it to the bot as `/link <code>`;
  the bot looks it up, consumes it (single use), and creates the
  `telegram_links` row. The code proves possession of the account (only a
  logged-in user can obtain it) without ever sending credentials over
  Telegram.
- **The link is permanent until explicitly unlinked.** The code expires in
  minutes, but the link it creates never does: the user authenticates once
  and the bot keeps working indefinitely, until they run `/unlink` (or
  disconnect from the web app). This matches the real use case — a personal
  bot you set up once and use forever, from the phone, without the computer.
  (Alternative considered and rejected: auto-linking the first chat to the
  sole user at startup. It removes all setup friction but is unsafe the
  moment a second account exists, and it couples bot identity to "who
  happened to be first". The link code scales and is safe.)
- **`/unlink` exists.** The user can revoke the link from Telegram (or from
  the web app), so a mistaken or unwanted link is never a dead end.
- **No session expiry on the link.** Unlike the web session cookie (ADR
  0005), the bot link has no TTL: it lives until revoked. This is a
  deliberate divergence — a bot has no browser, no logout UI, and the
  permanent-but-revocable model is what the user wants.
- **Unlinked chats are ignored** (no crash, no default user); the bot tells
  the user to link their account first.

## Alternatives considered
- **Single-user shortcut** (keep `TELEGRAM_ALLOWED_CHAT_ID`) — rejected:
  breaks as soon as a second account exists, and in prod that day may come.
- **Auto-link first chat to sole user** — rejected (above): convenient now,
  unsafe and surprising later.
- **Link by entering the password in Telegram** — rejected: never send
  credentials over a third-party channel; the link code proves possession
  without exposing secrets.
- **Webhook instead of long-polling** — out of scope here: the bot keeps
  long-polling (ADR/journ 06), deployed as a background worker on Render;
  this ADR is about identity, not transport.

## Consequences
- New tables `telegram_links` and `link_codes` (Alembic migration).
- New API endpoint to request a link code (authenticated).
- New bot commands `/link <code>` and `/unlink`.
- The bot's command handlers change from "first user" to "resolve user by
  chat" — the core of the work.
- `TELEGRAM_ALLOWED_CHAT_ID` becomes obsolete; the `.env`/config field can
  be removed (or left inert).
- The bot is deployed as a second Render service (background worker) with
  the same image and the same `DATABASE_URL`.
- The concept is documented in `docs/wiki/linking-external-account.md`;
  the story in `docs/journal/06-telegram-bot.md` (or a new journal entry).

## References
- Wiki: `docs/wiki/linking-external-account.md`
- Journal: `docs/journal/06-telegram-bot.md`
- Builds on ADR 0005 (user accounts) and the bot design in journal 06.