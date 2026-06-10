# Vision Module

Agent Browser includes an optional Python vision module for screenshot visual inspection.

## Optional by design

The core Agent Browser experience remains TypeScript:

- CLI commands
- MCP tools
- Playwright provider
- URL safety model

OpenCV lives in a separate Python package at `python/agent-browser-vision/`. Normal `npm install` does not install OpenCV or Python dependencies.

This keeps the default install lightweight while still giving teams a visual inspection path when they need it.

## Why OpenCV is separate

Screenshot comparison and blur/blank detection are useful, but they are not required for every agent workflow. Keeping vision in Python also makes it easy to:

- install only when needed
- run in deploy validation jobs
- evolve visual heuristics without changing the core browser API

## Commands

```bash
agent-browser-vision inspect ./screenshot.png --json
agent-browser-vision diff ./before.png ./after.png --out ./diff.png --json
```

## Codra Deploy use case

Codra Deploy can capture a post-deploy screenshot with Agent Browser, then pass it to the vision module to detect:

- blank or mostly empty pages
- blurry renders
- major visual regressions against a known-good screenshot

That gives deploy agents a simple visual safety check without adding credential automation or private-network scraping.

## LaunchPix use case

LaunchPix can use the same module to inspect landing page captures:

- confirm the page rendered with meaningful content
- compare before/after design changes
- flag likely broken or low-quality screenshots before analysis

## Safety notes

The vision module only inspects local image files provided by the caller. It does not change Agent Browser URL safety, browser automation behavior, or secret handling in the TypeScript layer.