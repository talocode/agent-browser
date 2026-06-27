# Agent Browser

Agent Browser is an open-source browser automation layer for AI agents. It gives coding agents, deploy agents, and research agents a safe way to inspect web pages, capture screenshots, read console and network signals, and validate web apps.

## Why it exists

Modern AI agents need a browser tool that is:

- safe by default
- easy to inspect
- usable from CLI and MCP
- suitable for testing, deploy validation, and page understanding

Agent Browser provides that foundation without credential automation, anti-detection tooling, or private-network scraping.

## Talocode ecosystem

Agent Browser fits into the Talocode stack:

- **Codra CLI** — the coding agent
- **Codra Action** — GitHub automation
- **Codra Deploy** — deployment and runtime validation
- **Agent Browser** — browser automation and web inspection

Typical uses:

- AI agents test web apps
- Codra checks frontend behavior
- Codra Deploy validates live deployments
- LaunchPix captures landing pages
- TeraAI reads and understands web pages
- Developers run browser automation through CLI and MCP

## Install

```bash
npm install -g @talocode/agent-browser
npx playwright install chromium
```

For local development from source:

```bash
npm install
npm run build
npx playwright install chromium
```

## Development

```bash
npm install
npm run dev -- --help
npm run typecheck
npm run test
npm run build
```

Local development against localhost:

```bash
export AGENT_BROWSER_ALLOW_LOCALHOST=1
```

## CLI

```bash
agent-browser --help
agent-browser check https://example.com
agent-browser check https://example.com --screenshot-out ./deploy.png --vision --json
agent-browser navigate https://example.com
agent-browser snapshot https://example.com
agent-browser screenshot https://example.com --out ./example.png
agent-browser console https://example.com
agent-browser network https://example.com
agent-browser session create --name "deploy-check"
agent-browser navigate https://example.com --session <sessionId>
agent-browser session report <sessionId> --format markdown
agent-browser mcp
```

Machine-readable output:

```bash
agent-browser --json snapshot https://example.com
```

Screenshot overwrite protection:

```bash
agent-browser screenshot https://example.com --out ./example.png --force
```

## MCP usage

Start the MCP server:

```bash
agent-browser mcp
```

Available tools:

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

Each tool validates URL safety and returns structured JSON results. Existing browser tools accept optional `sessionId` for multi-step trace recording.

See [docs/SESSIONS.md](docs/SESSIONS.md) for session lifecycle, trace format, and v0.2 limitations.

`browser_check` runs the deploy-friendly smoke check preset and returns a normalized pass/warn/fail protocol result. Optional `vision` uses the Python module when available.

## Safety model

Agent Browser blocks unsafe protocols and private network targets by default. Localhost is disabled unless `AGENT_BROWSER_ALLOW_LOCALHOST=1` is set for local development.

Sensitive query parameters are redacted from network output. The project does not store secrets, automate login, bypass CAPTCHAs, or provide anti-detection behavior.

See [docs/SAFETY.md](docs/SAFETY.md) for details.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Optional Vision Module

Agent Browser also includes an optional Python package for screenshot visual inspection. OpenCV is not required for normal TypeScript CLI or MCP usage.

```bash
cd python/agent-browser-vision
pip install -e ".[dev]"
agent-browser vision inspect ./screenshot.png --json
agent-browser vision diff ./before.png ./after.png --out ./diff.png --json
```

You can also call the Python CLI directly:

```bash
agent-browser-vision inspect ./screenshot.png --json
agent-browser-vision diff ./before.png ./after.png --out ./diff.png --json
```

The vision module can detect blank or blurry screenshots, compare before/after captures, save diff images, and flag major layout shifts.

See [docs/VISION.md](docs/VISION.md) for details.

## Smoke checks

Deploy-friendly preset for agents, Codra CLI, and Codra Deploy:

```bash
agent-browser check https://example.com
agent-browser check https://example.com --screenshot-out ./deploy.png --vision --json
codra browser check https://example.com
```

See [docs/CHECKS.md](docs/CHECKS.md) for the pass/warn/fail model.

## Use as GitHub Action

Run deploy-friendly smoke checks in any external repository:

```yaml
- uses: talocode/agent-browser@v0
  with:
    url: https://example.com
    screenshot-out: agent-browser-screenshot.png
    vision: "false"
    upload-artifact: "true"
```

Pin an immutable release when needed:

```yaml
- uses: talocode/agent-browser@v0.1.0
  with:
    url: https://example.com
```

External verification passed from [talocode/agent-browser-action-test](https://github.com/talocode/agent-browser-action-test/actions/runs/27259693056) using `talocode/agent-browser@v0`.

Copy a full external verification workflow from [docs/examples/external-verification.md](docs/examples/external-verification.md) or [examples/github-action/external-smoke.yml](examples/github-action/external-smoke.yml).

For Codra Deploy post-deploy checks, see [docs/CODRA_DEPLOY_INTEGRATION.md](docs/CODRA_DEPLOY_INTEGRATION.md).

See also [docs/GITHUB_ACTION.md](docs/GITHUB_ACTION.md), [docs/RELEASE.md](docs/RELEASE.md), and [examples/github-action/](examples/github-action/).

## Sessions & Trace (v0.2)

Persistent local sessions for multi-step agent workflows with step tracing and JSON/Markdown reports:

```bash
agent-browser session create --json
agent-browser check https://example.com --session <sessionId> --screenshot-out ./deploy.png --json
agent-browser session trace <sessionId> --json
agent-browser session report <sessionId> --format markdown
```

See [docs/SESSIONS.md](docs/SESSIONS.md).

## Roadmap

- Deeper Codra and Codra Deploy integrations
- True cross-process browser state reuse for sessions
- Accessibility-oriented snapshots
- CI-friendly smoke check presets
- Optional form inspection without credential automation

## License

MIT