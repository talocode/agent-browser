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

Each single-URL command starts a session, performs one action, and closes the session. Commands validate URL safety before any browser work begins.

## MCP server

`agent-browser mcp` starts a Model Context Protocol server over stdio.

Exposed tools:

- `browser_navigate`
- `browser_snapshot`
- `browser_screenshot`
- `browser_console`
- `browser_network`
- `browser_check`

MCP tools reuse the same provider and safety layers as the CLI.

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

## Future integrations

Agent Browser is intended to integrate with the Talocode ecosystem:

- **Codra CLI**: frontend checks, page inspection, and regression validation during coding workflows
- **Codra Action**: automated browser checks in CI for pull requests
- **Codra Deploy**: post-deploy smoke checks against public deployment URLs
- **LaunchPix**: landing page capture and analysis
- **TeraAI**: structured page reading for research agents

The provider abstraction and safety model are the stable foundation those integrations can build on.