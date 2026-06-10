import { describe, expect, it } from "vitest";
import { CHECK_PROTOCOL_VERSION } from "../src/tools/check.js";
import { evaluateActionDecision } from "../src/action/decisions.js";
import {
  DEFAULT_REPORT_NAME,
  DEFAULT_SCREENSHOT_OUT,
  parseActionInputs,
  resolveActionPaths,
} from "../src/action.js";
import type { SmokeCheckResult } from "../src/tools/check.js";

function baseResult(overrides: Partial<SmokeCheckResult> = {}): SmokeCheckResult {
  return {
    protocolVersion: CHECK_PROTOCOL_VERSION,
    url: "https://example.com",
    status: "pass",
    summary: "Smoke check passed.",
    checks: [],
    snapshot: {
      url: "https://example.com",
      title: "Example",
      text: "Example text",
      links: [],
      headings: [],
      buttons: [],
      inputsCount: 0,
      timestamp: new Date().toISOString(),
    },
    console: { total: 0, errors: 0, messages: [] },
    network: { total: 1, failed: 0, requests: [] },
    screenshot: { requested: true, captured: true, path: DEFAULT_SCREENSHOT_OUT },
    vision: {
      enabled: false,
      inspected: false,
      available: false,
      result: null,
      warnings: [],
    },
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("evaluateActionDecision", () => {
  it("passes a healthy result", () => {
    const decision = evaluateActionDecision(baseResult(), {
      failOnConsoleErrors: true,
      failOnNetworkErrors: true,
      failOnBlank: true,
      vision: false,
    });

    expect(decision.shouldFail).toBe(false);
  });

  it("fails on console errors when configured", () => {
    const decision = evaluateActionDecision(
      baseResult({
        status: "warn",
        console: { total: 1, errors: 1, messages: [] },
      }),
      {
        failOnConsoleErrors: true,
        failOnNetworkErrors: true,
        failOnBlank: true,
        vision: false,
      },
    );

    expect(decision.shouldFail).toBe(true);
    expect(decision.reasons.join(" ")).toMatch(/Console errors/);
  });

  it("fails on network errors when configured", () => {
    const decision = evaluateActionDecision(
      baseResult({
        status: "warn",
        network: { total: 2, failed: 1, requests: [] },
      }),
      {
        failOnConsoleErrors: true,
        failOnNetworkErrors: true,
        failOnBlank: true,
        vision: false,
      },
    );

    expect(decision.shouldFail).toBe(true);
    expect(decision.reasons.join(" ")).toMatch(/Failed network requests/);
  });

  it("warns when vision is enabled but unavailable", () => {
    const decision = evaluateActionDecision(
      baseResult({
        vision: {
          enabled: true,
          inspected: false,
          available: false,
          result: null,
          warnings: ["Vision module is not available"],
        },
      }),
      {
        failOnConsoleErrors: true,
        failOnNetworkErrors: true,
        failOnBlank: true,
        vision: true,
      },
    );

    expect(decision.shouldFail).toBe(false);
    expect(decision.warnings.join(" ")).toMatch(/Vision module is not available/);
  });

  it("fails on blank screenshot only when vision and fail-on-blank are enabled", () => {
    const decision = evaluateActionDecision(
      baseResult({
        vision: {
          enabled: true,
          inspected: true,
          available: true,
          result: {
            width: 100,
            height: 80,
            blankScore: 0.95,
            blurScore: 0.1,
            isLikelyBlank: true,
            isLikelyBlurry: false,
            warnings: [],
          },
          warnings: [],
        },
      }),
      {
        failOnConsoleErrors: true,
        failOnNetworkErrors: true,
        failOnBlank: true,
        vision: true,
      },
    );

    expect(decision.shouldFail).toBe(true);
    expect(decision.reasons.join(" ")).toMatch(/blank/i);
  });
});

describe("action input parsing", () => {
  it("parses defaults", () => {
    const inputs = parseActionInputs({
      INPUT_URL: "https://example.com",
    });

    expect(inputs).toEqual({
      url: "https://example.com",
      screenshotOut: DEFAULT_SCREENSHOT_OUT,
      vision: false,
      failOnConsoleErrors: true,
      failOnNetworkErrors: true,
      failOnBlank: true,
      uploadArtifact: true,
    });
  });

  it("resolves workspace paths", () => {
    const paths = resolveActionPaths("artifacts/shot.png", "/tmp/workspace");
    expect(paths.screenshotPath).toBe("/tmp/workspace/artifacts/shot.png");
    expect(paths.reportPath).toBe(`/tmp/workspace/${DEFAULT_REPORT_NAME}`);
  });
});