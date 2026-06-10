import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ConsoleMessage, NetworkRequest } from "../src/browser/provider.js";
import {
  CHECK_PROTOCOL_VERSION,
  evaluateSmokeChecks,
  formatSmokeCheckHuman,
  runSmokeCheck,
} from "../src/tools/check.js";
import { MockBrowserProvider } from "./mocks/mock-provider.js";

describe("evaluateSmokeChecks", () => {
  it("passes a healthy page", () => {
    const checks = evaluateSmokeChecks({
      title: "Example Domain",
      text: "Example text content",
      consoleMessages: [{ type: "log", text: "ready", timestamp: new Date().toISOString() }],
      networkRequests: [
        {
          method: "GET",
          url: "https://example.com",
          status: 200,
          resourceType: "document",
          timestamp: new Date().toISOString(),
        },
      ],
      screenshotRequested: false,
      screenshotCaptured: false,
      screenshotPath: null,
      visionEnabled: false,
      visionAvailable: false,
      visionInspected: false,
      visionResult: null,
      visionWarnings: [],
    });

    expect(checks.every((check) => check.status === "pass")).toBe(true);
  });

  it("warns on console errors and failed network requests", () => {
    const checks = evaluateSmokeChecks({
      title: "Example",
      text: "Content",
      consoleMessages: [
        { type: "error", text: "boom", timestamp: new Date().toISOString() },
      ] satisfies ConsoleMessage[],
      networkRequests: [
        {
          method: "GET",
          url: "https://example.com/missing",
          status: 404,
          resourceType: "xhr",
          timestamp: new Date().toISOString(),
        },
      ] satisfies NetworkRequest[],
      screenshotRequested: false,
      screenshotCaptured: false,
      screenshotPath: null,
      visionEnabled: false,
      visionAvailable: false,
      visionInspected: false,
      visionResult: null,
      visionWarnings: [],
    });

    expect(checks.find((check) => check.id === "console_errors")?.status).toBe("warn");
    expect(checks.find((check) => check.id === "network_failures")?.status).toBe("warn");
  });

  it("warns when vision detects a blank screenshot", () => {
    const checks = evaluateSmokeChecks({
      title: "Example",
      text: "Content",
      consoleMessages: [],
      networkRequests: [],
      screenshotRequested: true,
      screenshotCaptured: true,
      screenshotPath: "/tmp/out.png",
      visionEnabled: true,
      visionAvailable: true,
      visionInspected: true,
      visionResult: {
        width: 100,
        height: 80,
        blankScore: 0.95,
        blurScore: 0.1,
        isLikelyBlank: true,
        isLikelyBlurry: false,
        warnings: ["Screenshot appears mostly blank or empty."],
      },
      visionWarnings: ["Screenshot appears mostly blank or empty."],
    });

    expect(checks.find((check) => check.id === "vision_blank")?.status).toBe("warn");
  });
});

describe("runSmokeCheck", () => {
  it("returns normalized JSON protocol fields", async () => {
    const provider = new MockBrowserProvider();
    const result = await runSmokeCheck(provider, "https://example.com");

    expect(result.protocolVersion).toBe(CHECK_PROTOCOL_VERSION);
    expect(result.url).toBe("https://example.com");
    expect(result.status).toBe("pass");
    expect(result.snapshot.title).toBe("Example Domain");
    expect(result.console.total).toBeGreaterThan(0);
    expect(result.network.total).toBeGreaterThan(0);
  });

  it("does not require vision when --vision is disabled", async () => {
    const provider = new MockBrowserProvider();
    const visionInspectFn = vi.fn();

    const result = await runSmokeCheck(provider, "https://example.com", {
      visionInspectFn,
    });

    expect(result.vision.enabled).toBe(false);
    expect(visionInspectFn).not.toHaveBeenCalled();
  });

  it("runs vision inspect when enabled and screenshot output is provided", async () => {
    const provider = new MockBrowserProvider();
    const tempDir = await mkdtemp(join(tmpdir(), "agent-browser-check-"));
    const screenshotOut = join(tempDir, "deploy.png");
    const visionInspectFn = vi.fn().mockResolvedValue({
      width: 100,
      height: 80,
      blankScore: 0.1,
      blurScore: 0.1,
      isLikelyBlank: false,
      isLikelyBlurry: false,
      warnings: [],
    });

    const result = await runSmokeCheck(provider, "https://example.com", {
      screenshotOut,
      vision: true,
      force: true,
      visionInspectFn,
    });

    expect(visionInspectFn).toHaveBeenCalledWith(screenshotOut, { json: true });
    expect(result.vision.enabled).toBe(true);
    expect(result.vision.inspected).toBe(true);
  });
});

describe("formatSmokeCheckHuman", () => {
  it("renders a readable summary", () => {
    const output = formatSmokeCheckHuman({
      protocolVersion: CHECK_PROTOCOL_VERSION,
      url: "https://example.com",
      status: "warn",
      summary: "Smoke check passed with warnings: Console errors detected: 1",
      checks: [
        { id: "page_loaded", status: "pass", message: "Page loaded successfully." },
        { id: "console_errors", status: "warn", message: "Console errors detected: 1" },
      ],
      snapshot: {
        url: "https://example.com",
        title: "Example",
        text: "Example",
        links: [],
        headings: [],
        buttons: [],
        inputsCount: 0,
        timestamp: new Date().toISOString(),
      },
      console: { total: 1, errors: 1, messages: [] },
      network: { total: 0, failed: 0, requests: [] },
      screenshot: { requested: false, captured: false, path: null },
      vision: { enabled: false, inspected: false, available: false, result: null, warnings: [] },
      timestamp: new Date().toISOString(),
    });

    expect(output).toContain("Smoke check: WARN");
    expect(output).toContain("https://example.com");
    expect(output).toContain("Console errors detected: 1");
  });
});