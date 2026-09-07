# Pynance

A personal budget tracker for people who want to know where their money
actually goes. Record income and expenses, manage assets, and see your net
worth over time, all in a self-hostable app you control.

## Stack

- **Backend**: Python 3.14, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL,
  managed with `uv`.
- **Frontend**: React + TypeScript, Vite, Tailwind CSS, TanStack Query,
  React Router.
- **Infra**: PostgreSQL in Docker; optional GitHub Actions CI; deployable
  to any PaaS (Render) or a VPS.

## Requirements

- [Docker](https://docs.docker.com/get-docker/): PostgreSQL always runs in
  Docker; don't install it on your machine.
- [uv](https://docs.astral.sh/uv/): Python package manager.
- Node.js 20+ and npm for the frontend.

## Quick start

```bash
# 1. Environment (fill in the values)
cp .env.example .env

# 2. Start the database
docker compose up -d db

# 3. Backend (http://localhost:8000)
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn pynance.api.main:app --reload

# 4. Frontend (http://localhost:5173)
cd ../frontend
npm install
npm run dev
```

Open http://localhost:5173, register an account, and start recording.

## Configuration

All configuration is via environment variables (see `.env.example`):

| Variable | Description |
|---|---|
| `POSTGRES_*` | Database connection parts for local development |
| `DATABASE_URL` | Single connection string; wins over `POSTGRES_*` when set (used in production) |
| `SECURE_COOKIES` | `true` in production (HTTPS) so the session cookie is `Secure` |
| `ALLOWED_HOSTS` | JSON list of accepted Host headers (TrustedHostMiddleware) |
| `TELEGRAM_BOT_TOKEN` | Token of the optional Telegram bot |

## Tests & checks

```bash
cd backend
uv run pytest        # tests against a real Postgres test database
uv run ruff check .  # lint
uv run mypy .        # type check
```

The CI workflow (`.github/workflows/ci.yml`) runs all three on every push
and pull request.

## Telegram bot

The bot lets you log an expense from your phone without opening the app.
It runs as a separate long-polling process; start it from `backend/`:

```bash
uv run python -m pynance.bot.main
```

### First-time setup: link your chat to your account

The bot doesn't know who you are until you link it. This is a **one-time**
step:

1. Open the web app (http://localhost:5173) and log in.
2. In the browser console (`F12`), request a link code:
   ```js
   fetch('/api/telegram/link-code', { method: 'POST' }).then(r => r.json()).then(d => prompt('Codice:', d.code))
   ```
3. Send the code to the bot: `/link <code>`.
4. The bot replies `✓ Account collegato`.

**About the code:** it's single-use and expires after ~10 minutes. Every
time you request one you get a *different* code — that's normal. But the
code only matters for the one-time linking; once the chat is linked, it
stays linked forever (until you `/unlink`). New codes after linking are
irrelevant.

### Recording an expense

1. Tap the **`➕ Nuova spesa`** button in the chat.
2. Pick a category (tap one of the buttons).
3. Enter the amount (e.g. `12.50`).
4. Enter a description (required).
5. Confirm the summary with **✓ Conferma**.

### Commands

| Command | What it does |
|---|---|
| `/link <code>` | Link this chat to your account (once) |
| `/unlink` | Unlink this chat |
| `/balance` | Show your total balance |
| `/start` | Show the welcome message and the `➕` button |

## Deployment

The backend image is multi-stage and serves both the API and the built
frontend (single origin). Deploy it to any PaaS:

1. Build the image: `docker build -f backend/Dockerfile .`
2. Set `DATABASE_URL`, `SECURE_COOKIES=true`, and `ALLOWED_HOSTS` (your
   domain) as environment variables.
3. Push to your platform of choice. HTTPS is handled by the platform.

The app runs migrations automatically on startup (`alembic upgrade head`),
so a fresh database is set up without extra steps.

## Deploy completo su VPS

Lo stack di produzione gira su un VPS (Oracle Cloud ARM, free tier) con
Docker Compose e Caddy: un solo compose orchestra database, backend (che
serve anche il frontend), bot Telegram e reverse proxy.

```bash
# Sul server, nella directory del repo con il .env configurato:
docker compose --profile bot up -d --build
```

- Il database non espone porte all'esterno (rete privata di compose).
- Caddy emette e rinnova i certificati Let's Encrypt per `DOMAIN`.
- Il bot è opzionale (`--profile bot`): si aggiunge/toglie senza toccare il resto.
- Backup giornaliero: cron sul host che lancia `scripts/backup.sh`
  (pg_dump → gzip → rotazione ultime 7). Ripristino: `scripts/restore.sh <file>`.

## License

Not yet licensed.