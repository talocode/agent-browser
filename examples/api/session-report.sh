#!/usr/bin/env bash
set -euo pipefail

# Placeholder key — replace with your TALOCODE_API_KEY
export TALOCODE_API_KEY="${TALOCODE_API_KEY:-replace_me}"
API_HOST="${AGENT_BROWSER_API_HOST:-127.0.0.1}"
API_PORT="${AGENT_BROWSER_API_PORT:-7340}"
BASE="http://${API_HOST}:${API_PORT}"
AUTH="Authorization: Bearer ${TALOCODE_API_KEY}"

SESSION_ID=$(curl -s \
  -H "${AUTH}" \
  -H "Content-Type: application/json" \
  -d '{"name":"deploy-check"}' \
  "${BASE}/v1/browser/session" | jq -r '.data.session.id')

echo "Created session: ${SESSION_ID}"

curl -s \
  -H "${AUTH}" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"https://example.com\",\"sessionId\":\"${SESSION_ID}\"}" \
  "${BASE}/v1/browser/check" | jq '.data.result.status'

curl -s \
  -H "${AUTH}" \
  "${BASE}/v1/browser/session/${SESSION_ID}/report?format=markdown" | jq -r '.data.markdown'