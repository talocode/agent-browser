#!/usr/bin/env bash
set -euo pipefail

# Placeholder key — replace with your TALOCODE_API_KEY
export TALOCODE_API_KEY="${TALOCODE_API_KEY:-replace_me}"
API_HOST="${AGENT_BROWSER_API_HOST:-127.0.0.1}"
API_PORT="${AGENT_BROWSER_API_PORT:-7340}"

curl -s \
  -H "Authorization: Bearer ${TALOCODE_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","screenshot":true,"vision":false}' \
  "http://${API_HOST}:${API_PORT}/v1/browser/check" | jq .