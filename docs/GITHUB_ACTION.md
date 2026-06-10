# GitHub Action

Agent Browser ships a composite GitHub Action for deploy-friendly smoke checks in CI.

## Recommended usage

For external repos, pin the moving early-adopter tag:

```yaml
- uses: talocode/agent-browser@v0
  with:
    url: https://example.com
```

For production CI that should not move unexpectedly, pin an immutable semantic tag:

```yaml
- uses: talocode/agent-browser@v0.1.0
  with:
    url: https://example.com
```

## Versioning

| Tag | Type | Use when |
| --- | --- | --- |
| `v0` | moving | early adopters who want the latest action behavior |
| `v0.1.0`, `v0.2.0` | immutable | production workflows that need a pinned action version |
| `main` | development | Agent Browser contributors only |

### Updating the `v0` moving tag

Maintainers update `v0` after a validated release:

```bash
git tag -f v0 <release-commit>
git push origin v0 --force
```

`v0` should always point to the latest compatible early-action release commit, usually the same commit as the newest `v0.x.y` tag.

See [RELEASE.md](RELEASE.md) for the full release checklist.

## Basic workflow

```yaml
name: Browser smoke check

on:
  push:
    branches: [main]
  pull_request:

jobs:
  browser-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: talocode/agent-browser@v0
        with:
          url: https://example.com
```

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `url` | yes | — | Public URL to smoke check |
| `screenshot-out` | no | `agent-browser-screenshot.png` | Screenshot path relative to the workspace |
| `vision` | no | `false` | Enable optional Python/OpenCV vision inspect |
| `fail-on-console-errors` | no | `true` | Fail CI when console errors are present |
| `fail-on-network-errors` | no | `true` | Fail CI when failed network requests are present |
| `fail-on-blank` | no | `true` | Fail when vision detects a blank screenshot |
| `upload-artifact` | no | `true` | Upload screenshot and JSON report artifacts |

## Outputs

| Output | Description |
| --- | --- |
| `status` | `pass`, `warn`, or `fail` |
| `summary` | Human-readable smoke check summary |
| `report-path` | Path to `agent-browser-check-report.json` |
| `screenshot-path` | Path to the saved screenshot |

## CI fail behavior

The action reuses `agent-browser check` logic and then applies CI policy:

- always fails when core smoke checks fail (missing title, empty visible text, missing screenshot)
- fails on console errors when `fail-on-console-errors=true`
- fails on failed network requests when `fail-on-network-errors=true`
- fails on blank screenshots only when `vision=true` and `fail-on-blank=true`
- missing Python/OpenCV when `vision=true` produces a warning, not a failure by itself

## Artifacts

When `upload-artifact=true`, the action uploads:

- the screenshot file
- `agent-browser-check-report.json`

The JSON report contains the normalized smoke check result plus CI decision metadata.

## Vision in CI

Vision is optional. Normal browser checks do not require Python or OpenCV.

```yaml
- uses: talocode/agent-browser@v0
  with:
    url: https://example.com
    vision: "true"
```

Install the Python vision module in a prior workflow step if you want visual inspection to run instead of warn. See [VISION.md](VISION.md).

## Codra Deploy usage

After a deployment completes, run Agent Browser against the deployed public URL to catch broken frontend releases early.

Typical post-deploy flow:

1. Codra Deploy finishes a release to a public URL.
2. A workflow step runs `talocode/agent-browser@v0` against that URL.
3. The action fails on console errors, failed network requests, or blank pages when vision is enabled.
4. Screenshots and JSON reports are uploaded for agent inspection.

Example:

```yaml
- name: Verify deployed frontend
  uses: talocode/agent-browser@v0
  with:
    url: https://app.example.com
    screenshot-out: deploy-smoke.png
    fail-on-console-errors: "true"
    fail-on-network-errors: "true"
    fail-on-blank: "true"
    vision: "true"
    upload-artifact: "true"
```

This gives Codra Deploy a simple browser-based safety gate without credential automation or private-network scraping.

## Examples

- [basic.yml](../examples/github-action/basic.yml)
- [with-screenshot.yml](../examples/github-action/with-screenshot.yml)
- [with-vision.yml](../examples/github-action/with-vision.yml)
- [codra-deploy-smoke.yml](../examples/github-action/codra-deploy-smoke.yml)