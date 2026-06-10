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
npm install
npm run build
```

Playwright requires a Chromium binary for live browsing:

```bash
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
agent-browser navigate https://example.com
agent-browser snapshot https://example.com
agent-browser screenshot https://example.com --out ./example.png
agent-browser console https://example.com
agent-browser network https://example.com
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

Each tool validates URL safety and returns structured JSON results.

## Safety model

Agent Browser blocks unsafe protocols and private network targets by default. Localhost is disabled unless `AGENT_BROWSER_ALLOW_LOCALHOST=1` is set for local development.

Sensitive query parameters are redacted from network output. The project does not store secrets, automate login, bypass CAPTCHAs, or provide anti-detection behavior.

See [docs/SAFETY.md](docs/SAFETY.md) for details.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Roadmap

- Deeper Codra and Codra Deploy integrations
- Persistent sessions for multi-step agent workflows
- Accessibility-oriented snapshots
- CI-friendly smoke check presets
- Optional form inspection without credential automation

## License

MIT