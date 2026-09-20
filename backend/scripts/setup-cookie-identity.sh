#!/usr/bin/env bash
# Run this ON THE VPS (as the ubuntu user, from the repo root or anywhere --
# paths below are resolved relative to this script's own location) once per
# Google account you want to add to the cookie identity pool used by
# CookieIdentityPoolService. It briefly opens a REAL, visible Chromium window
# on the server so you can log into that account by hand from an ordinary
# browser tab (via noVNC over an SSH tunnel) -- yt-dlp only ever needs the
# resulting profile directory afterward, headless.
#
# Usage:
#   ./setup-cookie-identity.sh <name>
#   e.g. ./setup-cookie-identity.sh 3
#
# Creates/reuses secrets/chrome-profiles/<name> as that identity's profile
# directory. Once several identities exist under secrets/chrome-profiles/,
# set YTDLP_BROWSER_PROFILES_DIR=/app/secrets/chrome-profiles (already the
# default in docker-compose.prod.yml) and restart the backend to pick them up
# -- no code change needed to add more later, just repeat this script.
set -euo pipefail

NAME="${1:?Usage: $0 <identity-name>, e.g. $0 3}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROFILE_DIR="$REPO_ROOT/secrets/chrome-profiles/$NAME"
CHROMIUM_BIN="${CHROMIUM_PATH:-/snap/bin/chromium}"
DISPLAY_NUM=":90"
VNC_PORT=5900
NOVNC_PORT=6080
NOVNC_WEB_ROOT="${NOVNC_WEB_ROOT:-/usr/share/novnc}"

mkdir -p "$PROFILE_DIR"

echo "Starting Xvfb on display $DISPLAY_NUM..."
Xvfb "$DISPLAY_NUM" -screen 0 1280x800x24 &
XVFB_PID=$!
sleep 1

echo "Starting Chromium on profile $PROFILE_DIR..."
DISPLAY="$DISPLAY_NUM" "$CHROMIUM_BIN" \
  --no-sandbox \
  --user-data-dir="$PROFILE_DIR" \
  --window-size=1280,800 \
  --no-first-run \
  "https://accounts.google.com/signin" &
CHROMIUM_PID=$!

echo "Starting x11vnc on port $VNC_PORT (bound to localhost only)..."
x11vnc -display "$DISPLAY_NUM" -rfbport "$VNC_PORT" -localhost -nopw -forever -quiet &
VNC_PID=$!

echo "Starting websockify+noVNC on port $NOVNC_PORT (bound to localhost only -- reach it via an SSH tunnel, never expose this port directly)..."
websockify --web="$NOVNC_WEB_ROOT" --heartbeat=30 "localhost:${NOVNC_PORT}" "localhost:${VNC_PORT}" >/dev/null 2>&1 &
NOVNC_PID=$!

cleanup() {
  kill "$NOVNC_PID" "$VNC_PID" "$CHROMIUM_PID" "$XVFB_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo ""
echo "================================================================"
echo "Ready. From YOUR OWN machine (not the VPS), open a new terminal and run:"
echo "  ssh -L ${NOVNC_PORT}:localhost:${NOVNC_PORT} ubuntu@<this-vps-ip>"
echo "Leave that running, then open this in an ORDINARY BROWSER TAB on your machine:"
echo "  http://localhost:${NOVNC_PORT}/vnc.html?host=localhost&port=${NOVNC_PORT}&autoconnect=true"
echo "(no VNC password -- it's only reachable through the SSH tunnel above)"
echo ""
echo "In the Chromium window that appears in that tab, log into the Google"
echo "account you want to use for identity '$NAME'. Once you're fully logged"
echo "in and see your account's YouTube/Google page loading normally,"
echo "close the browser tab (or press Ctrl+C here) to end this session"
echo "cleanly -- the login is already saved to disk as you go."
echo "================================================================"
echo ""

wait "$CHROMIUM_PID" 2>/dev/null || true
