#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

[ -f .env ] && set -a && . ./.env && set +a

BACKUP_DIR="${BACKUP_DIR:-/opt/pynance/backups}"
KEEP="${KEEP:-7}"
# Date and time: deploys can run more than once a day and each pre-deploy
# backup must survive the next one.
STAMP="$(date +%F_%H%M%S)"

mkdir -p "$BACKUP_DIR"

docker compose exec -T db pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" \
  | gzip > "${BACKUP_DIR}/pynance-${STAMP}.sql.gz"

find "${BACKUP_DIR}" -name 'pynance-*.sql.gz' -mtime +"${KEEP}" -delete

echo "backup ok: ${BACKUP_DIR}/pynance-${STAMP}.sql.gz"