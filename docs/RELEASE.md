# Release Checklist

Use this checklist when publishing a new Agent Browser GitHub Action version.

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

## Not in scope yet

- npm package publishing
- automated GitHub Release creation
- OpenCV bundled into the action by default