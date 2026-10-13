#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

# A database backup runs before every deploy, so migrations (and a possible
# rollback) always have a restore point. The deploy fails closed if the backup
# fails; set SKIP_BACKUP=1 to bypass it in an emergency. On the very first
# deploy the db container is not running yet, so there is nothing to back up.
if [ "${SKIP_BACKUP:-}" != "1" ]; then
  if docker compose ps --services 2>/dev/null | grep -qx db; then
    ./scripts/backup.sh
  else
    echo "db container not running: skipping backup"
  fi
fi

# Pull latest code, rebuild and restart the stack (including the bot).
git pull
docker compose --profile bot up -d --build

echo "deploy ok"