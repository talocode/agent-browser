# GitHub Action

Agent Browser ships a composite GitHub Action for deploy-friendly smoke checks in CI.

## Usage

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
      - uses: talocode/agent-browser@main
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

To enable vision in CI:

```yaml
- uses: talocode/agent-browser@main
  with:
    url: https://example.com
    vision: "true"
```

Install the Python vision module in a prior workflow step if you want visual inspection to run instead of warn.