# Agent Browser Vision

Optional Python module for screenshot visual inspection in Agent Browser.

This package is separate from the TypeScript CLI and MCP server. OpenCV is not required for normal `agent-browser` usage.

## Install

```bash
cd python/agent-browser-vision
pip install -e ".[dev]"
```

## CLI

```bash
agent-browser-vision inspect ./screenshot.png
agent-browser-vision inspect ./screenshot.png --json
agent-browser-vision diff ./before.png ./after.png --out ./diff.png --json
```

## Features

- blank or mostly-empty screenshot detection
- blur detection
- screenshot diff score and changed pixel percentage
- diff image output
- major layout shift detection during comparisons

## Development

```bash
python -m pytest tests
python -m py_compile agent_browser_vision/*.py
```