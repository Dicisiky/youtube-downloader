#!/usr/bin/env bash
# Loads youtube.com in the persistent Chromium profile so the logged-in
# session used by --cookies-from-browser keeps refreshing on its own, instead
# of going stale from sitting unused between recordings. Intended to be run
# on a schedule from the HOST (not inside the container) via:
#   docker compose -f docker-compose.prod.yml exec -T backend /app/scripts/keepalive-cookies.sh
set -euo pipefail

PROFILE_DIR="${YTDLP_BROWSER_PROFILE_DIR:-/app/secrets/chrome-profile}"
CHROMIUM_BIN="${CHROMIUM_PATH:-/usr/bin/chromium}"

"$CHROMIUM_BIN" \
  --headless=new \
  --disable-gpu \
  --no-sandbox \
  --user-data-dir="$PROFILE_DIR" \
  --virtual-time-budget=8000 \
  https://www.youtube.com >/dev/null 2>&1 || true
