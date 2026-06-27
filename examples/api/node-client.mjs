#!/usr/bin/env node

const API_KEY = process.env.TALOCODE_API_KEY ?? "replace_me";
const host = process.env.AGENT_BROWSER_API_HOST ?? "127.0.0.1";
const port = process.env.AGENT_BROWSER_API_PORT ?? "7340";
const baseUrl = `http://${host}:${port}`;

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  const body = await response.json();
  if (!response.ok || body.ok === false) {
    throw new Error(body.error?.message ?? `Request failed: ${response.status}`);
  }
  return body;
}

const health = await fetch(`${baseUrl}/v1/health`).then((r) => r.json());
console.log("Health:", health);

const check = await api("/v1/browser/check", {
  method: "POST",
  body: JSON.stringify({ url: "https://example.com", screenshot: true }),
});
console.log("Check status:", check.data?.result?.status ?? check.result?.status);