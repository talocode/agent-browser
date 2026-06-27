# Changelog

## 0.2.0 — 2026-06-27

### Added

- Persistent logical browser sessions with local storage under `.agent-browser/`
- Session trace steps for navigate, snapshot, screenshot, console, network, check, and close actions
- Markdown and JSON session reports with recommended next actions
- CLI session commands: `session create`, `list`, `close`, `trace`, `report`
- MCP session tools: `browser_session_create`, `browser_session_list`, `browser_session_close`, `browser_session_trace`, `browser_session_report`
- Optional `--session` / `sessionId` on all browser commands and MCP tools

### Safety

- Existing safety model preserved: unsafe protocols blocked, private networks blocked by default, localhost requires `AGENT_BROWSER_ALLOW_LOCALHOST=1`, sensitive query params redacted
- No credential automation, CAPTCHA bypass, or anti-detection behavior

### Limitation

- v0.2 persists logical session metadata and trace evidence only. Live Playwright page state (cookies, DOM, in-page navigation) does not carry across separate CLI process invocations.

## 0.1.0 — 2026-06-10

- Initial release: CLI, MCP server, navigation, snapshots, screenshots, console/network inspection, smoke checks, optional vision module, GitHub Action