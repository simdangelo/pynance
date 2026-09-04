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
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_ALLOWED_CHAT_ID` | Optional Telegram bot |

## Tests & checks

```bash
cd backend
uv run pytest        # tests against a real Postgres test database
uv run ruff check .  # lint
uv run mypy .        # type check
```

The CI workflow (`.github/workflows/ci.yml`) runs all three on every push
and pull request.

## Deployment

The backend image is multi-stage and serves both the API and the built
frontend (single origin). Deploy it to any PaaS:

1. Build the image: `docker build -f backend/Dockerfile .`
2. Set `DATABASE_URL`, `SECURE_COOKIES=true`, and `ALLOWED_HOSTS` (your
   domain) as environment variables.
3. Push to your platform of choice. HTTPS is handled by the platform.

The app runs migrations automatically on startup (`alembic upgrade head`),
so a fresh database is set up without extra steps.

## License

Not yet licensed.