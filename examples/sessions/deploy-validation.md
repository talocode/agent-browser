# Deploy validation with sessions

Use a persistent session to validate a deployment across multiple steps and export a report for Codra Deploy or WorkLane review.

```bash
# 1. Create a session
agent-browser session create --name "prod-deploy" --json

# 2. Navigate and smoke check
agent-browser navigate https://app.example.com --session <sessionId>
agent-browser check https://app.example.com --session <sessionId> --screenshot-out ./deploy.png --json

# 3. Collect extra evidence
agent-browser console --session <sessionId>
agent-browser network --session <sessionId>

# 4. Export report
agent-browser session report <sessionId> --format markdown > deploy-report.md
agent-browser session close <sessionId>
```

Review the Markdown report for failed checks, console/network warnings, and the recommended next action.