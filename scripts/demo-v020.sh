#!/usr/bin/env bash
# Agent Browser v0.2.0 terminal demo helper
# Prints a safe command sequence for screen recording. Does not embed secrets.

set -euo pipefail

URL="${AGENT_BROWSER_DEMO_URL:-https://example.com}"
SCREENSHOT_OUT="${AGENT_BROWSER_DEMO_SCREENSHOT:-./deploy.png}"

echo "=== Agent Browser v0.2.0 Demo Sequence ==="
echo ""
echo "Target URL: $URL"
echo "Screenshot: $SCREENSHOT_OUT"
echo ""

if ! command -v agent-browser >/dev/null 2>&1; then
  echo "Note: agent-browser not on PATH. Use: npx @talocode/agent-browser@0.2.0"
  CLI="npx @talocode/agent-browser@0.2.0"
else
  CLI="agent-browser"
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "Warning: npx not found; install Node.js 20+"
else
  if ! npx playwright install --dry-run chromium >/dev/null 2>&1; then
    echo "Note: Playwright Chromium may not be installed."
    echo "Run: npx playwright install chromium"
    echo "Live browser commands will fail until Chromium is available."
    echo ""
  fi
fi

cat <<EOF
Run these commands in order (replace <sessionId> with the id from step 1):

1. Create session
   $CLI session create --name deploy-check --json

2. Smoke check with screenshot
   $CLI check $URL --session <sessionId> --screenshot-out $SCREENSHOT_OUT --json

3. Console evidence
   $CLI console --session <sessionId>

4. Network evidence
   $CLI network --session <sessionId>

5. Markdown report
   $CLI session report <sessionId> --format markdown

6. Close session
   $CLI session close <sessionId>

Safety: only public URLs like example.com. No login. No private networks.
Limitation: v0.2 persists logical sessions and traces, not live page state across CLI restarts.
EOF