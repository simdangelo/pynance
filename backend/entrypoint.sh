#!/bin/sh
set -e

# Apply pending migrations, then start the API. On a PaaS the platform
# injects the port to listen on via $PORT; locally it falls back to 8000.
# In production the reverse proxy (Caddy) has a fixed IP on the compose
# network; --forwarded-allow-ips trusts only it for X-Forwarded-For.
alembic upgrade head

exec uvicorn pynance.api.main:app \
    --host 0.0.0.0 \
    --port "${PORT:-8000}" \
    --proxy-headers \
    --forwarded-allow-ips="${FORWARDED_ALLOW_IPS:-172.20.0.5}"