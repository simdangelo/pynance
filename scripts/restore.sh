#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

[ -f .env ] && set -a && . ./.env && set +a

BACKUP_DIR="${BACKUP_DIR:-/opt/pynance/backups}"
FILE="${1:-}"

if [ -z "$FILE" ]; then
  echo "uso: $0 <backup.sql.gz>"
  exit 1
fi

gzip -dc "${BACKUP_DIR}/${FILE}" \
  | docker compose exec -T db psql -U "${POSTGRES_USER}" "${POSTGRES_DB}"

echo "restore ok: ${FILE}"