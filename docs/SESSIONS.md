# Sessions & Trace (v0.2)

Agent Browser Sessions let agents run multi-step browser workflows locally, record evidence for each step, and export structured trace reports.

## Lifecycle

1. **Create** a session (`active`)
2. Run session-aware commands with `--session <sessionId>` or MCP `sessionId`
3. Each action appends a trace step with status, warnings, and evidence counts
4. **Close** the session when finished (`closed`)
5. Generate a **report** in JSON or Markdown

Closed and expired sessions cannot be reused.

## Storage

Local-first artifacts are written under:

- `.agent-browser/sessions.json` — session metadata
- `.agent-browser/traces/<sessionId>.json` — ordered trace steps
- `.agent-browser/screenshots/<sessionId>/` — session screenshots

Set `AGENT_BROWSER_STORAGE_ROOT` to override the storage root (useful for tests).

## CLI

```bash
agent-browser session create --name "deploy-validation"
agent-browser session list --json
agent-browser navigate https://example.com --session <sessionId>
agent-browser snapshot --session <sessionId>
agent-browser screenshot --session <sessionId> --out ./shot.png
agent-browser console --session <sessionId>
agent-browser network --session <sessionId>
agent-browser check https://example.com --session <sessionId> --screenshot-out ./deploy.png
agent-browser session trace <sessionId> --json
agent-browser session report <sessionId> --format markdown
agent-browser session close <sessionId>
```

When `--session` is set, `snapshot`, `screenshot`, `console`, and `network` may omit the URL if the session already has `lastUrl` from a prior `navigate` or `check`.

## MCP tools

- `browser_session_create`
- `browser_session_list`
- `browser_session_close`
- `browser_session_trace`
- `browser_session_report`

Existing browser tools accept optional `sessionId` and return structured JSON with `status` when session-aware.

## Trace step format

```json
{
  "id": "uuid",
  "sessionId": "uuid",
  "action": "navigate",
  "url": "https://example.com",
  "status": "passed",
  "screenshotPath": ".agent-browser/screenshots/<sessionId>/<stepId>.png",
  "consoleCount": 2,
  "networkCount": 14,
  "warnings": [],
  "errors": [],
  "createdAt": "2026-06-27T12:00:00.000Z"
}
```

Statuses: `passed`, `warn`, `failed`.

## Report format

Reports include:

- session id and optional name
- start/end timestamps
- final status across steps
- ordered steps
- screenshot paths
- console/network warning summaries
- failed checks
- recommended next action

## Safety

Sessions follow the same safety model as one-shot commands:

- unsafe protocols blocked
- private network targets blocked by default
- localhost only with `AGENT_BROWSER_ALLOW_LOCALHOST=1`
- sensitive query params redacted in network evidence

No credential automation, CAPTCHA bypass, or anti-detection behavior is added.

## v0.2 limitation

Session persistence in v0.2 tracks **metadata and trace evidence**, not live Playwright page state across separate CLI process invocations. Each command may launch a fresh browser while still recording steps against the same logical session.

Do not assume cookies, DOM state, or in-page navigation carry over between CLI calls unless you stay within a single long-running MCP server process.

## Examples

- [Deploy validation walkthrough](../examples/sessions/deploy-validation.md)
- [Codra browser check flow](../examples/sessions/codra-browser-check.md)
- [MCP session config](../examples/sessions/mcp-session-config.json)