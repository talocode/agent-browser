# Hosted API (v0.1)

Agent Browser Hosted API v0.1 exposes browser validation over HTTP for builders who want managed browser infrastructure without operating Playwright, Chromium, screenshots, traces, and runtime reliability themselves.

**The open-source CLI and MCP remain local-first.** You do not need the hosted API for local development, CI scripts, or MCP usage.

**Production cloud is not deployed yet.** v0.1 ships the server module and `agent-browser api` for local/self-hosted operation. Talocode will offer a managed endpoint later with `TALOCODE_API_KEY` billing.

## Quick start (local)

```bash
export TALOCODE_API_KEY=replace_me
export AGENT_BROWSER_API_HOST=127.0.0.1
export AGENT_BROWSER_API_PORT=7340

agent-browser api --host 127.0.0.1 --port 7340
```

Health check (no auth required):

```bash
curl -s http://127.0.0.1:7340/v1/health
```

Authenticated request:

```bash
curl -s \
  -H "Authorization: Bearer replace_me" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","screenshot":true}' \
  http://127.0.0.1:7340/v1/browser/check
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TALOCODE_API_KEY` | — | API key for `Authorization: Bearer` auth |
| `AGENT_BROWSER_API_HOST` | `127.0.0.1` | Bind host |
| `AGENT_BROWSER_API_PORT` | `7340` | Bind port |
| `AGENT_BROWSER_API_MODE` | `local` | `local` or `production` |
| `AGENT_BROWSER_API_AUTH_DISABLED` | — | Set to `1` to disable auth in development/test only |
| `STACKLANE_BASE_URL` | — | Optional Stacklane base URL for usage forwarding |
| `STACKLANE_API_KEY` | — | Optional Stacklane API key for usage forwarding |
| `AGENT_BROWSER_ALLOW_LOCALHOST` | — | Allow localhost targets (same as CLI) |
| `AGENT_BROWSER_STORAGE_ROOT` | cwd | Root for `.agent-browser/` session and usage data |

## Authentication

All endpoints except `GET /v1/health` require:

```
Authorization: Bearer <TALOCODE_API_KEY>
```

- Missing token → `401` with `{ "ok": false, "error": { "code": "auth_missing", ... } }`
- Invalid token → `401` with `auth_invalid`
- Server key not configured → `503` with `auth_not_configured`

`GET /v1/config/status` reports whether keys are **present** or **missing** — never the actual values.

### Development auth bypass

```bash
export AGENT_BROWSER_API_AUTH_DISABLED=1
export AGENT_BROWSER_API_MODE=local   # or NODE_ENV=test|development
```

A startup warning is printed when auth is disabled. This must not be used in production.

## Endpoints

### `GET /v1/health`

Returns service health and version. No authentication required.

```json
{ "ok": true, "version": "0.2.0", "mode": "local" }
```

### `GET /v1/config/status`

Returns configuration presence (auth required).

### `POST /v1/browser/check`

Smoke-check a URL.

```json
{
  "url": "https://example.com",
  "screenshot": true,
  "vision": false,
  "sessionId": "optional-uuid"
}
```

Returns normalized check result with `pass` / `warn` / `fail` status, screenshot metadata, and optional session trace step.

### `POST /v1/browser/screenshot`

Capture a screenshot.

```json
{
  "url": "https://example.com",
  "sessionId": "optional-uuid"
}
```

Returns screenshot artifact metadata (path or mime type). No raw file dump in the response.

### `POST /v1/browser/session`

Create a persistent logical session.

```json
{ "name": "deploy-check" }
```

### `GET /v1/browser/session/:id`

Returns session metadata and trace steps.

### `GET /v1/browser/session/:id/report`

Query `?format=json` (default) or `?format=markdown`.

### `POST /v1/browser/session/:id/close`

Close an active session.

## Error envelope

All errors are JSON:

```json
{
  "ok": false,
  "error": {
    "code": "unsafe_url",
    "message": "Blocked protocol: file:"
  }
}
```

No HTML, stack traces, or secrets in responses.

## Usage tracking

Every mutating endpoint records a usage event via `recordHostedUsageEvent`:

| Action | Trigger |
|--------|---------|
| `agent_browser.check` | `POST /v1/browser/check` |
| `agent_browser.screenshot` | `POST /v1/browser/screenshot` |
| `agent_browser.session.create` | `POST /v1/browser/session` |
| `agent_browser.session.report` | `GET .../report` |
| `agent_browser.session.close` | `POST .../close` |

Events append to `.agent-browser/hosted-usage.json` under the storage root.

When `STACKLANE_BASE_URL` and `STACKLANE_API_KEY` are set, events are best-effort forwarded to `POST /api/v1/usage/events`. Forwarding failures do not fail browser API requests. Usage metadata never contains raw API keys or sensitive request bodies.

## Safety

The hosted API uses the same safety layer as the CLI and MCP:

- Only `http://` and `https://`
- Private/loopback addresses blocked by default
- `AGENT_BROWSER_ALLOW_LOCALHOST=1` for local development
- Sensitive query params redacted
- No credential automation, CAPTCHA bypass, or anti-detection

See [SAFETY.md](SAFETY.md).

## Limitations (v0.1)

- No billing or payment integration
- No managed Talocode cloud endpoint yet (run locally with `agent-browser api`)
- Live browser operations require Playwright/Chromium when not using mocks
- Session page state may not persist across separate browser invocations (same as CLI v0.2)

## Examples

See `examples/api/`:

- `check.sh` — smoke check via curl
- `session-report.sh` — session workflow
- `node-client.mjs` — minimal Node client