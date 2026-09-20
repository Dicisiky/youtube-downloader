#!/usr/bin/env bash
# Loads youtube.com in each persistent Chromium profile so the logged-in
# session used by --cookies-from-browser keeps refreshing on its own, instead
# of going stale from sitting unused between recordings. Intended to be run
# on a schedule from the HOST (not inside the container) via:
#   docker compose -f docker-compose.prod.yml exec -T backend /app/scripts/keepalive-cookies.sh
set -euo pipefail

# Skip this run if any yt-dlp process is currently active. It reads cookies
# from these same profile directories; launching a full Chromium instance
# against one concurrently risks that read landing mid-write. Missing one
# 6-hourly refresh is harmless -- the session cookies stay valid far longer
# than that on their own.
if pgrep -f 'yt-dlp' >/dev/null 2>&1; then
  exit 0
fi

CHROMIUM_BIN="${CHROMIUM_PATH:-/usr/bin/chromium}"

refresh_profile() {
  "$CHROMIUM_BIN" \
    --headless=new \
    --disable-gpu \
    --no-sandbox \
    --user-data-dir="$1" \
    --virtual-time-budget=8000 \
    https://www.youtube.com >/dev/null 2>&1 || true
}

# Multi-identity pool (see CookieIdentityPoolService) -- one subdirectory per
# logged-in account. Falls back to the single legacy profile dir when the
# pool isn't set up yet, so an un-migrated deployment behaves as before.
if [ -n "${YTDLP_BROWSER_PROFILES_DIR:-}" ] && [ -d "${YTDLP_BROWSER_PROFILES_DIR}" ]; then
  for profile_dir in "${YTDLP_BROWSER_PROFILES_DIR}"/*/; do
    [ -d "$profile_dir" ] && refresh_profile "${profile_dir%/}"
  done
else
  refresh_profile "${YTDLP_BROWSER_PROFILE_DIR:-/app/secrets/chrome-profile}"
fi
