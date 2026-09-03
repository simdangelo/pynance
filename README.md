# Pynance

A personal budget tracker. You can record income and expenses, manage your assets (bank,
savings, ETFs), create recurring templates, move money between assets, and see your net worth
over time.

## Stack

- **Backend**: Python 3.14, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL. Managed with `uv`.
- **Frontend**: React 18 + TypeScript, Vite, Tailwind CSS, TanStack Query, React Router. Managed
  with `npm`.

## Requirements

- [Docker](https://docs.docker.com/get-docker/) (PostgreSQL always runs in Docker — don't install
  it on your machine)
- [uv](https://docs.astral.sh/uv/)
- Node.js and npm

## Run it locally

1. Clone the repo and go into the project folder.

2. Create your environment file and fill in the PostgreSQL values:

   ```bash
   cp .env.example .env
   ```

3. Start the database:

   ```bash
   docker compose up -d db
   ```

4. Set up and run the backend (port 8000):

   ```bash
   cd backend
   uv sync
   uv run alembic upgrade head
   uv run uvicorn pynance.api.main:app --reload
   ```

5. In another terminal, run the frontend (port 5173):

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

6. Open http://localhost:5173 in your browser.

## Production (PaaS)

The backend image (`backend/Dockerfile`) is multi-stage and serves both the
API and the built frontend (single origin). Deploy it to a PaaS like
Railway: set `DATABASE_URL`, `SECURE_COOKIES=true` and `ALLOWED_HOSTS`
(the platform domain) as environment variables. See
`docs/wiki/10-deploy-paas-railway.md` for the step-by-step guide.

## Backend checks

```bash
cd backend
uv run pytest
uv run ruff check .
uv run mypy .
```
