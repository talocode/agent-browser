# Safety Model

Agent Browser is designed for safe, inspectable web automation by AI agents.

## URL safety

Only `http://` and `https://` URLs are allowed.

Blocked by default:

- `localhost`
- `127.0.0.0/8`
- `0.0.0.0`
- `10.0.0.0/8`
- `172.16.0.0/12`
- `192.168.0.0/16`
- `::1`
- Unique local and link-local IPv6 ranges
- `file:`, `data:`, `javascript:`, `chrome:`, and `about:`

Local development override:

```bash
AGENT_BROWSER_ALLOW_LOCALHOST=1
```

When set, `localhost` and `127.0.0.1` are allowed. Private network ranges remain blocked.

## No credential automation

Agent Browser does not implement:

- login automation
- credential storage
- password filling workflows
- OAuth/session hijacking helpers

## No anti-detection or abuse tooling

Agent Browser does not implement:

- stealth scraping
- CAPTCHA bypass
- bot evasion
- social media automation
- private/internal network scraping by default

## No secret logging

Network and console capture avoid sensitive data by default:

- request headers are not exported
- cookies are not exported
- authorization headers are not exported
- sensitive query parameters such as `token`, `key`, `secret`, and `password` are redacted

## Safe defaults

- localhost is disabled unless explicitly overridden
- screenshots only write to explicit output paths
- existing screenshot files are not overwritten without `--force`
- MCP screenshot responses avoid returning oversized base64 payloads

## Sessions and trace storage

Agent sessions (v0.2) store metadata and trace steps locally under `.agent-browser/`:

- session ids must be UUIDs; filenames are validated
- trace steps store counts and summaries, not full sensitive payloads
- network evidence in traces inherits URL redaction from the provider layer
- closed and expired sessions cannot be reused

Sessions do not add credential automation, CAPTCHA bypass, or anti-detection behavior. See [SESSIONS.md](SESSIONS.md).