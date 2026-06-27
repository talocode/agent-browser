# Release Checklist

Use this checklist when publishing a new Agent Browser version (npm and/or GitHub Action).

## Pre-release validation

```bash
npm run typecheck
npm run test
npm run build
```

Confirm:

- no `.env` or generated screenshots committed
- URL safety defaults unchanged
- vision remains optional (`vision=false` by default)
- local action smoke workflow passes on `main`
- hosted API tests pass (`tests/api.test.ts`) when shipping API changes

## Merge and tag

1. Merge the release PR to `main`.
2. Create an immutable semantic tag on the release commit:

```bash
git tag v0.1.0 <commit-sha>
git push origin v0.1.0
```

3. Move the moving `v0` tag to the same commit for early adopters:

```bash
git tag -f v0 <commit-sha>
git push origin v0 --force
```

## Post-release verification

External verification **passed** on 2026-06-10:

- Repo: [talocode/agent-browser-action-test](https://github.com/talocode/agent-browser-action-test)
- Workflow run: [actions/runs/27259693056](https://github.com/talocode/agent-browser-action-test/actions/runs/27259693056)
- Action: `talocode/agent-browser@v0`
- Artifacts: screenshot + JSON report uploaded

Verify the external usage snippet works from another repo or a scratch workflow:

```yaml
- uses: talocode/agent-browser@v0
  with:
    url: https://example.com
```

Optional pinned usage:

```yaml
- uses: talocode/agent-browser@v0.1.0
  with:
    url: https://example.com
```

## Versioning policy

- `v0` — moving tag for early action adopters; may change without notice
- `v0.1.0`, `v0.2.0`, ... — immutable semantic tags for pinned CI usage
- `main` — development only; not recommended for external production workflows

## Maintainer notes for `v0`

When shipping a compatible action update:

1. Run the checklist above.
2. Tag `v0.x.y` on the release commit.
3. Force-move `v0` to that same commit.
4. Update `docs/GITHUB_ACTION.md` and examples if inputs or behavior changed.

Do not move `v0` for breaking changes without documenting them in the release PR.

## npm package (v0.2.0+)

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm pack --dry-run
npm whoami
npm publish --access public
```

After publish:

```bash
npm view @talocode/agent-browser version
git tag -a v0.2.0 -m "Agent Browser v0.2.0"
git push origin v0.2.0
gh release create v0.2.0 --title "Agent Browser v0.2.0 — Persistent Sessions & Trace Reports" --notes-file docs/release/v0.2.0-release-notes.md
```

Demo materials for releases live in `docs/release/`. Terminal recording helper: `scripts/demo-v020.sh`.

## Not in scope yet

- OpenCV bundled into the action by default
- In-repo MP4 video rendering (use demo script + external recorder)