import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CHECK_PROTOCOL_VERSION } from "../src/tools/check.js";
import { handleBrowserCheck } from "../src/server/browser-check.js";
import { MCP_TOOL_NAMES } from "../src/server/mcp.js";
import { VisionModuleMissingError } from "../src/vision/python-bridge.js";
import { MockBrowserProvider } from "./mocks/mock-provider.js";

describe("MCP browser_check registration", () => {
  it("registers browser_check in the MCP tool list", () => {
    expect(MCP_TOOL_NAMES).toContain("browser_check");
    expect(MCP_TOOL_NAMES).toEqual([
      "browser_navigate",
      "browser_snapshot",
      "browser_screenshot",
      "browser_console",
      "browser_network",
      "browser_check",
      "browser_session_create",
      "browser_session_list",
      "browser_session_close",
      "browser_session_trace",
      "browser_session_report",
    ]);
  });
});

describe("MCP browser_check output shape", () => {
  it("returns normalized protocol result", async () => {
    const provider = new MockBrowserProvider();
    const response = await handleBrowserCheck(provider, {
      url: "https://example.com",
      vision: false,
      json: true,
    });

    expect(response.ok).toBe(true);
    expect(response.result.protocolVersion).toBe(CHECK_PROTOCOL_VERSION);
    expect(response.result.url).toBe("https://example.com");
    expect(response.result.status).toMatch(/pass|warn|fail/);
    expect(response.result.checks.length).toBeGreaterThan(0);
    expect(response.result.snapshot.title).toBeTruthy();
    expect(response.result.console).toMatchObject({
      total: expect.any(Number),
      errors: expect.any(Number),
      messages: expect.any(Array),
    });
    expect(response.result.network).toMatchObject({
      total: expect.any(Number),
      failed: expect.any(Number),
      requests: expect.any(Array),
    });
  });

  it("returns warn status when vision is enabled but unavailable", async () => {
    const provider = new MockBrowserProvider();
    const tempDir = await mkdtemp(join(tmpdir(), "agent-browser-mcp-check-"));
    const screenshotOut = join(tempDir, "deploy.png");
    const visionInspectFn = vi
      .fn()
      .mockRejectedValue(new VisionModuleMissingError("Optional vision module not found."));

    const response = await handleBrowserCheck(provider, {
      url: "https://example.com",
      screenshotOut,
      vision: true,
      force: true,
      visionInspectFn,
    });

    expect(response.result.vision.enabled).toBe(true);
    expect(response.result.checks.some((check) => check.id === "vision_available")).toBe(true);
    expect(response.result.status).toBe("warn");
  });

  it("rejects unsafe URLs", async () => {
    const provider = new MockBrowserProvider();

    await expect(
      handleBrowserCheck(provider, {
        url: "http://localhost:3000",
        vision: false,
      }),
    ).rejects.toThrow(/Localhost is disabled/);
  });
});