# Agent Browser

An experimental browser core written in Rust for software agents.

This is not a Chromium wrapper. The first milestone is a small, inspectable browser stack:

- fetch `http://` pages and local files
- parse enough HTML to expose title, visible text, and links
- return deterministic snapshots suitable for agents
- navigate through links by stable IDs inside a session

## Run

```powershell
cargo run -p agent_browser -- open http://example.com/
```

Local files work too:

```powershell
cargo run -p agent_browser -- snapshot .\fixtures\example.html
```

Machine-readable one-shot snapshots:

```powershell
cargo run -p agent_browser -- --json snapshot .\fixtures\example.html
```

## Agent Protocol

Start a persistent browser session over JSON Lines on stdio:

```powershell
cargo run -p agent_browser -- serve
```

Each input line is one command. Each output line is one response with the same `id`.

```json
{"id":"1","method":"open","params":{"url":"fixtures/example.html"}}
{"id":"2","method":"snapshot"}
{"id":"3","method":"click","params":{"link_id":0}}
{"id":"4","method":"back"}
{"id":"5","method":"forward"}
{"id":"6","method":"reload"}
{"id":"7","method":"history"}
{"id":"8","method":"shutdown"}
```

Successful responses use this shape:

```json
{"id":"1","ok":true,"result":{}}
```

Errors use this shape:

```json
{"id":"1","ok":false,"error":{"code":"link_not_found","message":"link not found: 7"}}
```

## Current Limits

- `https://` is intentionally not implemented yet
- no CSS layout, JavaScript, cookies, forms, or rendering
- HTML parsing is forgiving but minimal

## Direction

The next useful milestones are:

1. Add `https://` with `rustls`.
2. Replace the flat text scanner with a real DOM tree.
3. Add forms, inputs, and semantic accessibility snapshots.
4. Add a deterministic action model: type, select, submit.
