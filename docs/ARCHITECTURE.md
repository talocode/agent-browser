# Architecture

Agent Browser is a TypeScript browser automation layer designed for AI agents, CLIs, and MCP clients.

## Provider abstraction

All browser behavior flows through the `BrowserProvider` interface:

- `startSession`
- `closeSession`
- `navigate`
- `snapshot`
- `screenshot`
- `getConsoleMessages`
- `getNetworkRequests`

The default implementation is `PlaywrightBrowserProvider`, which wraps Playwright behind the provider boundary. Application code, CLI commands, and MCP tools depend on the interface rather than Playwright APIs directly.

This keeps the project testable with mock providers and leaves room for alternate backends later.

## CLI

The `agent-browser` binary exposes one-shot commands:

- `navigate`
- `snapshot`
- `screenshot`
- `console`
- `network`
- `mcp`

Each single-URL command starts a browser provider session, performs one action, and closes the provider session. Commands validate URL safety before any browser work begins.

### Agent sessions (v0.2)

`src/sessions/` adds a separate **agent session** layer for multi-step workflows:

- `SessionManager` — create, list, close, and validate agent sessions
- local store — `.agent-browser/sessions.json`, `traces/`, `screenshots/`
- trace append — every session-aware action records a step
- reports — JSON and Markdown exports

CLI `--session` and MCP `sessionId` route actions through `SessionManager` while still using `BrowserProvider` for browser I/O.

v0.2 persists metadata and trace evidence. Live Playwright page state may not carry across separate CLI invocations; see [SESSIONS.md](SESSIONS.md).

## MCP server

`agent-browser mcp` starts a Model Context Protocol server over stdio.

Exposed tools:

- `browser_navigate`
- `browser_snapshot`
- `browser_screenshot`
- `browser_console`
- `browser_network`
- `browser_check`
- `browser_session_create`
- `browser_session_list`
- `browser_session_close`
- `browser_session_trace`
- `browser_session_report`

MCP tools reuse the same provider, session manager, and safety layers as the CLI.

### `browser_check`

Runs the smoke check preset and returns a normalized protocol result:

```json
{
  "url": "https://example.com",
  "screenshotOut": "optional/path.png",
  "vision": false,
  "json": true,
  "force": false
}
```

Vision is optional. If `vision` is `true` and the Python module is missing, the tool returns a warning in the check result rather than failing the MCP call.

## Hosted API (v0.1)

`src/api/` adds an optional HTTP server for builders who want managed browser validation infrastructure:

- `server.ts` — Node HTTP server lifecycle
- `routes.ts` — `/v1/*` endpoints
- `auth.ts` — `Authorization: Bearer` with `TALOCODE_API_KEY`
- `usage.ts` — local `.agent-browser/hosted-usage.json` log and optional Stacklane forwarding
- `config.ts` — env-based configuration

`agent-browser api` starts the server locally. Browser routes reuse `BrowserProvider`, `SessionManager`, `runSmokeCheck`, and the same safety layer as CLI/MCP. The open-source CLI and MCP do not require the hosted API.

See [HOSTED_API.md](HOSTED_API.md).

## Future integrations

Agent Browser is intended to integrate with the Talocode ecosystem:

- **Codra CLI**: `codra browser check` alias for frontend smoke checks during coding workflows
- **Codra Action**: automated browser checks in CI for pull requests
- **Codra Deploy**: post-deploy smoke checks against public deployment URLs
- **LaunchPix**: landing page capture and analysis
- **TeraAI**: structured page reading for research agents

The provider abstraction and safety model are the stable foundation those integrations can build on.