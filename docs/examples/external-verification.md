# External Action Verification

Use this workflow in any external repository to verify that Agent Browser resolves and runs from the published `v0` tag.

Copy the workflow below into `.github/workflows/agent-browser-smoke.yml` in your repo, then run it manually with **workflow_dispatch**.

```yaml
name: Agent Browser Smoke Check

on:
  workflow_dispatch:

jobs:
  browser-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Agent Browser smoke check
        uses: talocode/agent-browser@v0
        with:
          url: https://example.com
          screenshot-out: agent-browser-screenshot.png
          vision: "false"
          upload-artifact: "true"
```

## What this verifies

- `talocode/agent-browser@v0` resolves from GitHub
- the composite action installs dependencies and Chromium
- the smoke check runs against a public URL
- screenshot and JSON report artifacts are uploaded

## Expected result

- job status: success
- action output `status`: `pass`
- artifacts: `agent-browser-screenshot.png` and `agent-browser-check-report.json`

## Notes

- Vision is disabled (`vision: "false"`), so Python/OpenCV is not required.
- Only public `http://` or `https://` URLs are allowed. Private network and localhost URLs are blocked by default.
- For pinned CI usage, replace `@v0` with an immutable tag such as `@v0.1.0`.

See also:

- [GITHUB_ACTION.md](../GITHUB_ACTION.md)
- [examples/github-action/external-smoke.yml](../../examples/github-action/external-smoke.yml)