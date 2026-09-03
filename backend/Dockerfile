# syntax=docker/dockerfile:1

# --- STAGE 1: frontend build -------------------------------------------------
# Node compiles the Vite app into static files (dist/). Node is a build-time
# tool only: the runtime image below serves the finished files as-is.
FROM node:22-alpine AS frontend-build

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# --- STAGE 2: backend dependencies ------------------------------------------
# uv installs the locked dependency set. Dev tools (ruff/mypy/pytest) are
# excluded so they never reach the runtime image.
FROM python:3.14-slim AS backend-deps

# The uv image has no Python-pinned tags; copy the binary into a pinned Python.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY backend/pynance ./pynance
COPY backend/alembic ./alembic
COPY backend/alembic.ini ./alembic.ini

# --- STAGE 3: runtime --------------------------------------------------------
FROM python:3.14-slim AS runtime

RUN useradd --create-home --uid 10001 appuser

WORKDIR /app

COPY --from=backend-deps --chown=appuser:appuser /app/.venv /app/.venv
COPY --from=backend-deps --chown=appuser:appuser /app/pynance /app/pynance
COPY --from=backend-deps --chown=appuser:appuser /app/alembic /app/alembic
COPY --from=backend-deps --chown=appuser:appuser /app/alembic.ini /app/alembic.ini
COPY --from=frontend-build --chown=appuser:appuser /frontend/dist /app/frontend-dist
COPY --chown=appuser:appuser backend/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1

USER appuser

EXPOSE 8000

CMD ["./entrypoint.sh"]