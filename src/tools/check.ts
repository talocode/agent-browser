import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type {
  BrowserProvider,
  ConsoleMessage,
  NetworkRequest,
  SnapshotResult,
} from "../browser/provider.js";
import { assertSafeUrl } from "../browser/safety.js";
import {
  VisionModuleMissingError,
  type VisionInspectResult,
  visionInspect,
} from "../vision/python-bridge.js";

export const CHECK_PROTOCOL_VERSION = "1.0";

export type CheckStatus = "pass" | "warn" | "fail";

export interface CheckItem {
  id: string;
  status: CheckStatus;
  message: string;
}

export interface SmokeCheckResult {
  protocolVersion: string;
  url: string;
  status: CheckStatus;
  summary: string;
  checks: CheckItem[];
  snapshot: SnapshotResult;
  console: {
    total: number;
    errors: number;
    messages: ConsoleMessage[];
  };
  network: {
    total: number;
    failed: number;
    requests: NetworkRequest[];
  };
  screenshot: {
    requested: boolean;
    captured: boolean;
    path: string | null;
  };
  vision: {
    enabled: boolean;
    inspected: boolean;
    available: boolean;
    result: VisionInspectResult | null;
    warnings: string[];
  };
  timestamp: string;
}

export interface SmokeCheckOptions {
  screenshotOut?: string;
  force?: boolean;
  vision?: boolean;
  visionInspectFn?: typeof visionInspect;
}

function isConsoleError(message: ConsoleMessage): boolean {
  return message.type === "error";
}

function isFailedNetworkRequest(request: NetworkRequest): boolean {
  return request.status === null || request.status >= 400;
}

function overallStatus(checks: CheckItem[]): CheckStatus {
  if (checks.some((check) => check.status === "fail")) {
    return "fail";
  }
  if (checks.some((check) => check.status === "warn")) {
    return "warn";
  }
  return "pass";
}

function buildSummary(status: CheckStatus, checks: CheckItem[]): string {
  const warnings = checks.filter((check) => check.status === "warn");
  const failures = checks.filter((check) => check.status === "fail");

  if (status === "pass") {
    return "Smoke check passed.";
  }

  if (status === "fail") {
    const reasons = failures.map((check) => check.message).join("; ");
    return `Smoke check failed: ${reasons}`;
  }

  const reasons = warnings.map((check) => check.message).join("; ");
  return `Smoke check passed with warnings: ${reasons}`;
}

async function ensureScreenshotOutputPath(out: string, force = false): Promise<void> {
  try {
    await access(out, constants.F_OK);
    if (!force) {
      throw new Error(`Output file already exists: ${out}. Pass --force to overwrite.`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("already exists")) {
      throw error;
    }
  }
}

export function evaluateSmokeChecks(input: {
  title: string;
  text: string;
  consoleMessages: ConsoleMessage[];
  networkRequests: NetworkRequest[];
  screenshotRequested: boolean;
  screenshotCaptured: boolean;
  screenshotPath: string | null;
  visionEnabled: boolean;
  visionAvailable: boolean;
  visionInspected: boolean;
  visionResult: VisionInspectResult | null;
  visionWarnings: string[];
}): CheckItem[] {
  const checks: CheckItem[] = [
    {
      id: "page_loaded",
      status: "pass",
      message: "Page loaded successfully.",
    },
    {
      id: "title_present",
      status: input.title.trim().length > 0 ? "pass" : "fail",
      message:
        input.title.trim().length > 0
          ? `Title present: ${input.title}`
          : "Page title is missing.",
    },
    {
      id: "visible_text",
      status: input.text.trim().length > 0 ? "pass" : "fail",
      message:
        input.text.trim().length > 0
          ? "Visible text is present."
          : "Visible text is empty.",
    },
    {
      id: "console_errors",
      status: "pass",
      message: "No console errors detected.",
    },
    {
      id: "network_failures",
      status: "pass",
      message: "No failed network requests detected.",
    },
    {
      id: "screenshot_captured",
      status: "pass",
      message: "Screenshot not requested.",
    },
  ];

  const consoleErrors = input.consoleMessages.filter(isConsoleError);
  if (consoleErrors.length > 0) {
    checks[3] = {
      id: "console_errors",
      status: "warn",
      message: `Console errors detected: ${consoleErrors.length}`,
    };
  }

  const failedRequests = input.networkRequests.filter(isFailedNetworkRequest);
  if (failedRequests.length > 0) {
    checks[4] = {
      id: "network_failures",
      status: "warn",
      message: `Failed network requests detected: ${failedRequests.length}`,
    };
  }

  if (input.screenshotRequested) {
    checks[5] = {
      id: "screenshot_captured",
      status: input.screenshotCaptured ? "pass" : "fail",
      message: input.screenshotCaptured
        ? `Screenshot captured at ${input.screenshotPath}`
        : "Screenshot was requested but not captured.",
    };
  }

  if (input.visionEnabled) {
    if (!input.visionAvailable) {
      checks.push({
        id: "vision_available",
        status: "warn",
        message: "Vision module is not available; skipped visual inspection.",
      });
    } else if (!input.visionInspected) {
      checks.push({
        id: "vision_inspected",
        status: "warn",
        message: "Vision was enabled but no screenshot was available to inspect.",
      });
    } else if (input.visionResult?.isLikelyBlank) {
      checks.push({
        id: "vision_blank",
        status: "warn",
        message: "Screenshot appears mostly blank or empty.",
      });
    } else if (input.visionResult?.isLikelyBlurry) {
      checks.push({
        id: "vision_blurry",
        status: "warn",
        message: "Screenshot appears blurry.",
      });
    } else {
      checks.push({
        id: "vision_inspected",
        status: "pass",
        message: "Screenshot passed visual inspection.",
      });
    }
  }

  return checks;
}

export function formatSmokeCheckHuman(result: SmokeCheckResult): string {
  const icon: Record<CheckStatus, string> = {
    pass: "PASS",
    warn: "WARN",
    fail: "FAIL",
  };

  const lines = [
    `Smoke check: ${icon[result.status]}`,
    `URL: ${result.url}`,
    "",
    ...result.checks.map((check) => {
      const marker = check.status === "pass" ? "[ok]" : check.status === "warn" ? "[warn]" : "[fail]";
      return `${marker} ${check.message}`;
    }),
    "",
    `Summary: ${result.summary}`,
  ];

  if (result.vision.enabled && result.vision.warnings.length > 0) {
    lines.push(`Vision warnings: ${result.vision.warnings.join("; ")}`);
  }

  return lines.join("\n");
}

export async function runSmokeCheck(
  provider: BrowserProvider,
  url: string,
  options: SmokeCheckOptions = {},
): Promise<SmokeCheckResult> {
  assertSafeUrl(url);

  if (options.screenshotOut) {
    await ensureScreenshotOutputPath(options.screenshotOut, options.force);
  }

  const session = await provider.startSession();
  let tempScreenshotPath: string | null = null;

  try {
    const navigation = await provider.navigate(session.sessionId, url);
    const snapshot = await provider.snapshot(session.sessionId);
    const consoleMessages = await provider.getConsoleMessages(session.sessionId);
    const networkRequests = await provider.getNetworkRequests(session.sessionId);

    let screenshotPath: string | null = null;
    let screenshotCaptured = false;
    const screenshotRequested = Boolean(options.screenshotOut) || Boolean(options.vision);

    if (screenshotRequested) {
      const screenshot = await provider.screenshot(session.sessionId, { type: "png" });
      if (screenshot.base64) {
        screenshotCaptured = true;
        if (options.screenshotOut) {
          await writeFile(options.screenshotOut, Buffer.from(screenshot.base64, "base64"));
          screenshotPath = options.screenshotOut;
        } else if (options.vision) {
          const tempDir = await mkdtemp(join(tmpdir(), "agent-browser-check-"));
          tempScreenshotPath = join(tempDir, "screenshot.png");
          await writeFile(tempScreenshotPath, Buffer.from(screenshot.base64, "base64"));
          screenshotPath = tempScreenshotPath;
        }
      }
    }

    const inspectFn = options.visionInspectFn ?? visionInspect;
    let visionAvailable = false;
    let visionInspected = false;
    let visionResult: VisionInspectResult | null = null;
    const visionWarnings: string[] = [];

    if (options.vision && screenshotPath) {
      try {
        visionResult = await inspectFn(screenshotPath, { json: true });
        visionAvailable = true;
        visionInspected = true;
        visionWarnings.push(...(visionResult.warnings ?? []));
      } catch (error) {
        if (error instanceof VisionModuleMissingError) {
          visionAvailable = false;
          visionWarnings.push(error.message);
        } else if (error instanceof Error) {
          visionAvailable = true;
          visionWarnings.push(error.message);
        }
      }
    } else if (options.vision && !screenshotPath) {
      visionWarnings.push("Vision enabled but screenshot capture failed.");
    }

    const checks = evaluateSmokeChecks({
      title: navigation.title || snapshot.title,
      text: snapshot.text,
      consoleMessages,
      networkRequests,
      screenshotRequested: Boolean(options.screenshotOut),
      screenshotCaptured: options.screenshotOut ? screenshotCaptured : false,
      screenshotPath: options.screenshotOut ? screenshotPath : null,
      visionEnabled: Boolean(options.vision),
      visionAvailable,
      visionInspected,
      visionResult,
      visionWarnings,
    });

    const status = overallStatus(checks);

    return {
      protocolVersion: CHECK_PROTOCOL_VERSION,
      url: navigation.url,
      status,
      summary: buildSummary(status, checks),
      checks,
      snapshot,
      console: {
        total: consoleMessages.length,
        errors: consoleMessages.filter(isConsoleError).length,
        messages: consoleMessages,
      },
      network: {
        total: networkRequests.length,
        failed: networkRequests.filter(isFailedNetworkRequest).length,
        requests: networkRequests,
      },
      screenshot: {
        requested: Boolean(options.screenshotOut),
        captured: options.screenshotOut ? screenshotCaptured : false,
        path: options.screenshotOut ? screenshotPath : null,
      },
      vision: {
        enabled: Boolean(options.vision),
        inspected: visionInspected,
        available: visionAvailable,
        result: visionResult,
        warnings: visionWarnings,
      },
      timestamp: new Date().toISOString(),
    };
  } finally {
    await provider.closeSession(session.sessionId);
    if (tempScreenshotPath) {
      await rm(dirname(tempScreenshotPath), { recursive: true, force: true }).catch(() => undefined);
    }
  }
}