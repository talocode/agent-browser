# Smoke Checks

Agent Browser includes a deploy-friendly smoke check preset for agents and Codra Deploy.

## Command

```bash
agent-browser check https://example.com
agent-browser check https://example.com --json
agent-browser check https://example.com --screenshot-out ./deploy.png
agent-browser check https://example.com --screenshot-out ./deploy.png --vision --json
```

## What it checks

- page loaded
- title present
- visible text not empty
- console error count
- failed network request count
- screenshot captured when `--screenshot-out` is provided
- optional vision blank/blur warnings when `--vision` is enabled

## Status model

- `pass`: all required checks passed
- `warn`: page loaded but non-critical issues were detected
- `fail`: required checks failed, such as missing title, empty visible text, or missing requested screenshot

## JSON output

`--json` returns a normalized payload:

```json
{
  "ok": true,
  "result": {
    "protocolVersion": "1.0",
    "url": "https://example.com",
    "status": "warn",
    "summary": "Smoke check passed with warnings: Console errors detected: 1",
    "checks": [],
    "snapshot": {},
    "console": {},
    "network": {},
    "screenshot": {},
    "vision": {},
    "timestamp": "2026-06-10T00:00:00.000Z"
  }
}
```

## Vision integration

`--vision` is optional. Normal `check` does not require Python or OpenCV.

When `--vision` is enabled:

- a screenshot must be available
- if `--screenshot-out` is provided, that file is inspected
- otherwise a temporary screenshot is captured for inspection and cleaned up afterward
- if the Python vision module is missing, the smoke check continues with a warning

## Codra Deploy use case

Codra Deploy can run:

```bash
agent-browser check https://deployed-app.example --screenshot-out ./deploy.png --vision --json
```

That gives deploy agents a single pass/warn/fail result with page content, console/network signals, and optional visual inspection.

## MCP tool

The same smoke check is exposed as `browser_check` through `agent-browser mcp`.

Input:

```json
{
  "url": "https://example.com",
  "screenshotOut": "optional/path.png",
  "vision": false,
  "json": true,
  "force": false
}
```

Output:

```json
{
  "ok": true,
  "result": {
    "protocolVersion": "1.0",
    "status": "pass",
    "summary": "Smoke check passed.",
    "checks": []
  }
}
```

Vision is optional for MCP as well. Missing Python/OpenCV produces a warning check item, not a fatal MCP error.