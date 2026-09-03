#!/bin/sh
set -e

# Apply pending migrations, then start the API. On a PaaS the platform
# injects the port to listen on via $PORT; locally it falls back to 8000.
alembic upgrade head

exec uvicorn pynance.api.main:app \
    --host 0.0.0.0 \
    --port "${PORT:-8000}" \
    --proxy-headers