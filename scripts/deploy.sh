#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Pull latest code, rebuild and restart the stack (including the bot).
# Run from the server's repo directory: ./scripts/deploy.sh
git pull
docker compose --profile bot up -d --build

echo "deploy ok"