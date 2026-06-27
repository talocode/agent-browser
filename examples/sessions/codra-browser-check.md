# Codra browser check with sessions

Codra agents can create a session, run checks, and hand the trace report to a human or deploy workflow.

```bash
export AGENT_BROWSER_ALLOW_LOCALHOST=1   # only for local dev targets

SESSION=$(agent-browser session create --name "codra-check" --json | jq -r '.session.id')

agent-browser check https://staging.example.com --session "$SESSION" --screenshot-out ./staging.png --json
agent-browser session trace "$SESSION" --json
agent-browser session report "$SESSION" --format json > codra-session-report.json
agent-browser session close "$SESSION"
```

Use `codra browser check` for one-shot checks; use sessions when you need multi-step evidence in one report.