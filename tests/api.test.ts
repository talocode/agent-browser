import { mkdtemp, readFile, rm } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApiServer } from "../src/api/server.js";
import type { StartedApiServer } from "../src/api/server.js";
import { getUsageLogPath } from "../src/api/usage.js";
import { MockBrowserProvider } from "./mocks/mock-provider.js";

const TEST_API_KEY = "test_key_for_ci";

interface HttpResult {
  status: number;
  body: string;
  headers: Record<string, string | string[] | undefined>;
}

function request(
  port: number,
  method: string,
  path: string,
  options: { headers?: Record<string, string>; body?: string } = {},
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          ...(options.body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(options.body) } : {}),
          ...options.headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            headers: res.headers,
          });
        });
      },
    );

    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

describe("hosted API", () => {
  let storageRoot: string;
  let server: StartedApiServer;
  let port: number;
  let previousEnv: Record<string, string | undefined>;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), "agent-browser-api-"));
    port = 18000 + Math.floor(Math.random() * 1000);

    previousEnv = {
      NODE_ENV: process.env.NODE_ENV,
      TALOCODE_API_KEY: process.env.TALOCODE_API_KEY,
      AGENT_BROWSER_API_AUTH_DISABLED: process.env.AGENT_BROWSER_API_AUTH_DISABLED,
      AGENT_BROWSER_API_MODE: process.env.AGENT_BROWSER_API_MODE,
      STACKLANE_BASE_URL: process.env.STACKLANE_BASE_URL,
      STACKLANE_API_KEY: process.env.STACKLANE_API_KEY,
      AGENT_BROWSER_STORAGE_ROOT: process.env.AGENT_BROWSER_STORAGE_ROOT,
    };

    process.env.NODE_ENV = "test";
    process.env.TALOCODE_API_KEY = TEST_API_KEY;
    delete process.env.AGENT_BROWSER_API_AUTH_DISABLED;
    process.env.AGENT_BROWSER_API_MODE = "local";
    delete process.env.STACKLANE_BASE_URL;
    delete process.env.STACKLANE_API_KEY;
    process.env.AGENT_BROWSER_STORAGE_ROOT = storageRoot;

    server = createApiServer({
      config: { host: "127.0.0.1", port, talocodeApiKey: TEST_API_KEY, authDisabled: false },
      createProvider: () => new MockBrowserProvider(),
      storageRoot,
    });

    await new Promise<void>((resolve, reject) => {
      server.server.once("error", reject);
      server.server.listen(port, "127.0.0.1", () => resolve());
    });
  });

  afterEach(async () => {
    await server.close();
    await rm(storageRoot, { recursive: true, force: true });

    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("health returns JSON with ok and version", async () => {
    const res = await request(port, "GET", "/v1/health");
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    const json = JSON.parse(res.body) as { ok: boolean; version: string };
    expect(json.ok).toBe(true);
    expect(json.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(res.body).not.toContain(TEST_API_KEY);
  });

  it("config status does not expose API key", async () => {
    const res = await request(port, "GET", "/v1/config/status", {
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
    });
    const json = JSON.parse(res.body) as {
      ok: boolean;
      talocodeApiKey: string;
      stacklane: { baseUrl: string; apiKey: string };
    };
    expect(json.ok).toBe(true);
    expect(json.talocodeApiKey).toBe("present");
    expect(json.stacklane.baseUrl).toBe("missing");
    expect(json.stacklane.apiKey).toBe("missing");
    expect(res.body).not.toContain(TEST_API_KEY);
  });

  it("rejects missing auth with JSON error envelope", async () => {
    const res = await request(port, "GET", "/v1/config/status");
    expect(res.status).toBe(401);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    const json = JSON.parse(res.body) as { ok: boolean; error: { code: string; message: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("auth_missing");
    expect(res.body).not.toMatch(/stack|trace/i);
  });

  it("rejects invalid auth with JSON error envelope", async () => {
    const res = await request(port, "GET", "/v1/config/status", {
      headers: { Authorization: "Bearer wrong_key" },
    });
    expect(res.status).toBe(401);
    const json = JSON.parse(res.body) as { ok: boolean; error: { code: string; message: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("auth_invalid");
  });

  it("accepts valid TALOCODE_API_KEY", async () => {
    const res = await request(port, "POST", "/v1/browser/session", {
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      body: JSON.stringify({ name: "deploy-check" }),
    });
    expect(res.status).toBe(201);
    const json = JSON.parse(res.body) as { ok: boolean; data: { session: { name: string } } };
    expect(json.ok).toBe(true);
    expect(json.data.session.name).toBe("deploy-check");
  });



  it("validates URL on browser check endpoint", async () => {
    const res = await request(port, "POST", "/v1/browser/check", {
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      body: JSON.stringify({ url: "" }),
    });
    expect(res.status).toBe(400);
    const json = JSON.parse(res.body) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("validation_error");
  });

  it("blocks unsafe and private URLs", async () => {
    const unsafe = await request(port, "POST", "/v1/browser/check", {
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      body: JSON.stringify({ url: "file:///etc/passwd" }),
    });
    expect(unsafe.status).toBe(400);
    const unsafeJson = JSON.parse(unsafe.body) as { ok: boolean; error: { code: string } };
    expect(unsafeJson.error.code).toBe("unsafe_url");

    const privateNet = await request(port, "POST", "/v1/browser/check", {
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      body: JSON.stringify({ url: "http://192.168.1.1" }),
    });
    expect(privateNet.status).toBe(400);
    const privateJson = JSON.parse(privateNet.body) as { ok: boolean; error: { code: string } };
    expect(privateJson.error.code).toBe("unsafe_url");
  });

  it("runs browser check against safe URL with mock provider", async () => {
    const res = await request(port, "POST", "/v1/browser/check", {
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      body: JSON.stringify({ url: "https://example.com", screenshot: true }),
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body) as {
      ok: boolean;
      data: { result: { status: string; screenshot: { captured: boolean } } };
    };
    expect(json.ok).toBe(true);
    expect(json.data.result.status).toMatch(/pass|warn|fail/);
    expect(json.data.result.screenshot.captured).toBe(true);
    expect(res.body).not.toContain(TEST_API_KEY);
  });

  it("creates sessions and returns reports in json and markdown", async () => {
    const createRes = await request(port, "POST", "/v1/browser/session", {
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      body: JSON.stringify({ name: "report-flow" }),
    });
    const created = JSON.parse(createRes.body) as { data: { session: { id: string } } };
    const sessionId = created.data.session.id;

    const checkRes = await request(port, "POST", "/v1/browser/check", {
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      body: JSON.stringify({ url: "https://example.com", sessionId }),
    });
    expect(checkRes.status).toBe(200);

    const jsonReport = await request(port, "GET", `/v1/browser/session/${sessionId}/report?format=json`, {
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
    });
    expect(jsonReport.status).toBe(200);
    const jsonBody = JSON.parse(jsonReport.body) as { data: { format: string; report: { sessionId: string } } };
    expect(jsonBody.data.format).toBe("json");
    expect(jsonBody.data.report.sessionId).toBe(sessionId);

    const mdReport = await request(port, "GET", `/v1/browser/session/${sessionId}/report?format=markdown`, {
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
    });
    expect(mdReport.status).toBe(200);
    const mdBody = JSON.parse(mdReport.body) as { data: { format: string; markdown: string } };
    expect(mdBody.data.format).toBe("markdown");
    expect(mdBody.data.markdown).toContain("# Agent Browser Session Report");
  });

  it("writes usage events locally", async () => {
    await request(port, "POST", "/v1/browser/check", {
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      body: JSON.stringify({ url: "https://example.com" }),
    });

    const logPath = getUsageLogPath(storageRoot);
    const raw = await readFile(logPath, "utf8");
    const events = JSON.parse(raw) as Array<{ action: string; product: string }>;
    expect(events.some((event) => event.action === "agent_browser.check")).toBe(true);
    expect(events.every((event) => event.product === "agent_browser")).toBe(true);
    expect(raw).not.toContain(TEST_API_KEY);
  });

  it("does not fail browser requests when Stacklane config is missing", async () => {
    delete process.env.STACKLANE_BASE_URL;
    delete process.env.STACKLANE_API_KEY;

    const res = await request(port, "POST", "/v1/browser/screenshot", {
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      body: JSON.stringify({ url: "https://example.com" }),
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body) as { ok: boolean };
    expect(json.ok).toBe(true);
  });

  it("returns JSON-only errors without secrets", async () => {
    const res = await request(port, "GET", "/v1/browser/session/00000000-0000-0000-0000-000000000099/report", {
      headers: { Authorization: `Bearer ${TEST_API_KEY}` },
    });
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).not.toMatch(/text\/html/i);
    expect(res.body).not.toContain(TEST_API_KEY);
    const json = JSON.parse(res.body) as { ok: boolean; error: { code: string; message: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("session_not_found");
  });
});

describe("hosted API auth-disabled mode", () => {
  let storageRoot: string;
  let previousEnv: Record<string, string | undefined>;

  async function listen(server: StartedApiServer, listenPort: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      server.server.once("error", reject);
      server.server.listen(listenPort, "127.0.0.1", () => resolve());
    });
  }

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), "agent-browser-api-auth-"));
    previousEnv = {
      NODE_ENV: process.env.NODE_ENV,
      TALOCODE_API_KEY: process.env.TALOCODE_API_KEY,
      AGENT_BROWSER_API_AUTH_DISABLED: process.env.AGENT_BROWSER_API_AUTH_DISABLED,
      AGENT_BROWSER_API_MODE: process.env.AGENT_BROWSER_API_MODE,
    };
    process.env.TALOCODE_API_KEY = TEST_API_KEY;
  });

  afterEach(async () => {
    await rm(storageRoot, { recursive: true, force: true });
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("ignores auth-disabled flag in production mode", async () => {
    process.env.AGENT_BROWSER_API_AUTH_DISABLED = "1";
    process.env.AGENT_BROWSER_API_MODE = "production";
    process.env.NODE_ENV = "production";

    const authPort = 19000 + Math.floor(Math.random() * 1000);
    const prodServer = createApiServer({
      config: {
        host: "127.0.0.1",
        port: authPort,
        talocodeApiKey: TEST_API_KEY,
        mode: "production",
        authDisabled: false,
      },
      createProvider: () => new MockBrowserProvider(),
      storageRoot,
    });

    await listen(prodServer, authPort);
    const res = await request(authPort, "GET", "/v1/config/status");
    expect(res.status).toBe(401);
    await prodServer.close();
  });

  it("allows auth-disabled in test/dev mode", async () => {
    delete process.env.AGENT_BROWSER_API_AUTH_DISABLED;
    process.env.AGENT_BROWSER_API_MODE = "local";
    process.env.NODE_ENV = "test";

    const authPort = 20000 + Math.floor(Math.random() * 1000);
    const devServer = createApiServer({
      config: {
        host: "127.0.0.1",
        port: authPort,
        talocodeApiKey: TEST_API_KEY,
        authDisabled: true,
      },
      createProvider: () => new MockBrowserProvider(),
      storageRoot,
    });

    await listen(devServer, authPort);
    const res = await request(authPort, "GET", "/v1/config/status");
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body) as { authDisabled: boolean };
    expect(json.authDisabled).toBe(true);
    await devServer.close();
  });
});