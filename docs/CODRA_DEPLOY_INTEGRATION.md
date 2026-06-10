# Codra Deploy Integration

Codra Deploy can use Agent Browser as a post-deploy browser safety gate for frontend releases.

## Flow

1. Deploy the application to a public URL.
2. Capture the deployed URL from the deploy step output.
3. Run `talocode/agent-browser@v0` against that URL.
4. Fail the deploy workflow when console errors, network failures, or blank-page vision checks are detected.
5. Upload the screenshot and JSON report as workflow artifacts for agent inspection.

## Recommended checks

| Check | Default | Why |
| --- | --- | --- |
| Console errors | fail | catches broken client-side JavaScript |
| Network failures | fail | catches missing assets or API failures |
| Blank page (vision) | fail when `vision=true` | catches empty or broken renders |
| Screenshot artifact | upload | gives humans and agents visual evidence |
| JSON report | upload | gives structured pass/warn/fail details |

## Example workflow

```yaml
name: Codra Deploy with browser smoke check

on:
  workflow_dispatch:

jobs:
  deploy-and-verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy application
        id: deploy
        run: |
          echo "url=https://app.example.com" >> "$GITHUB_OUTPUT"
        shell: bash

      - name: Verify deployed frontend
        uses: talocode/agent-browser@v0
        with:
          url: ${{ steps.deploy.outputs.url }}
          screenshot-out: deploy-smoke.png
          vision: "true"
          fail-on-console-errors: "true"
          fail-on-network-errors: "true"
          fail-on-blank: "true"
          upload-artifact: "true"
```

## Inputs to use after deploy

| Input | Value |
| --- | --- |
| `url` | `${{ steps.deploy.outputs.url }}` or your deploy job output |
| `screenshot-out` | `deploy-smoke.png` |
| `vision` | `true` when visual blank-page detection is desired |
| `fail-on-console-errors` | `true` |
| `fail-on-network-errors` | `true` |
| `fail-on-blank` | `true` when `vision=true` |
| `upload-artifact` | `true` |

## Outputs to consume

| Output | Use |
| --- | --- |
| `status` | `pass`, `warn`, or `fail` |
| `summary` | short human-readable result |
| `report-path` | JSON report for agents |
| `screenshot-path` | screenshot file path |

## Vision in deploy checks

Vision is optional. Normal deploy smoke checks do not require Python or OpenCV.

When `vision=true`:

- install the Python vision module in a prior step if you want real visual inspection
- if vision is unavailable, Agent Browser warns instead of failing by itself
- set `fail-on-blank=true` to fail when a blank screenshot is detected

## Safety model

Agent Browser keeps deploy checks safe by default:

- only public `http://` and `https://` URLs
- no credential automation
- no CAPTCHA bypass
- no private-network scraping by default
- no secret logging in network output

## Codra CLI alias

Codra exposes the same smoke check through a developer-friendly alias:

```bash
codra browser check https://your-app.example.com
codra browser check https://your-app.example.com --screenshot-out check.png --vision
codra browser check https://your-app.example.com --json --allow-warnings
```

`codra browser check` shells out to `agent-browser --json check <url>` and maps pass/warn/fail to exit codes. It shares the same verifier as `codra deploy verify`, with Codra-specific presentation:

| Command | Use when |
| --- | --- |
| `codra browser check` | ad-hoc checks during development |
| `codra deploy verify` | post-deploy verification in deployment workflows |

Codra-only flags:

- `--allow-warnings` — exit 0 when Agent Browser reports `warn`
- `--agent-browser-bin <path>` — override the `agent-browser` binary path

Requires `agent-browser` on `PATH` (`npm install -g @talocode/agent-browser`). For CI without Codra CLI, use `talocode/agent-browser@v0`.

## Related docs

- [GITHUB_ACTION.md](GITHUB_ACTION.md)
- [CHECKS.md](CHECKS.md)
- [examples/github-action/codra-deploy-post-deploy.yml](../examples/github-action/codra-deploy-post-deploy.yml)