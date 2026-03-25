#!/usr/bin/env bash
set -euo pipefail

STATE_FILE="$HOME/.ngrok_public_url"
API="http://127.0.0.1:4040/api/tunnels"

# read current url
NEW_URL="$(curl -s "$API" | grep -oP '"public_url":"\Khttps:[^"]+' | head -n1 || true)"

if [[ -z "${NEW_URL}" ]]; then
  echo "[ngrok-watch] No public_url found. Is ngrok running? ($(date))"
  exit 0
fi

OLD_URL=""
if [[ -f "$STATE_FILE" ]]; then
  OLD_URL="$(cat "$STATE_FILE")"
fi

if [[ "$NEW_URL" != "$OLD_URL" ]]; then
  echo "$NEW_URL" > "$STATE_FILE"
  echo "[ngrok-watch] CHANGED: $OLD_URL -> $NEW_URL ($(date))"
  echo "[ngrok-watch] Your webhook should be: $NEW_URL/webhook"
else
  echo "[ngrok-watch] OK: $NEW_URL ($(date))"
fi
