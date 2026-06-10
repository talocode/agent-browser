import { appendFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "@actions/core";
import { PlaywrightBrowserProvider } from "./browser/playwright-provider.js";
import { type SmokeCheckResult, runSmokeCheck } from "./tools/check.js";
import {
  type ActionDecision,
  type ActionDecisionOptions,
  evaluateActionDecision,
} from "./action/decisions.js";

export const DEFAULT_SCREENSHOT_OUT = "agent-browser-screenshot.png";
export const DEFAULT_REPORT_NAME = "agent-browser-check-report.json";

export interface ActionInputs {
  url: string;
  screenshotOut: string;
  vision: boolean;
  failOnConsoleErrors: boolean;
  failOnNetworkErrors: boolean;
  failOnBlank: boolean;
  uploadArtifact: boolean;
}

export interface ActionReport {
  ok: boolean;
  result: SmokeCheckResult;
  decision: ActionDecision;
  artifacts: {
    screenshotPath: string | null;
    reportPath: string;
  };
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === "") {
    return defaultValue;
  }
  return value.toLowerCase() === "true";
}

function readInput(name: string, envName: string, defaultValue = ""): string {
  const envValue = process.env[envName];
  if (envValue !== undefined && envValue !== "") {
    return envValue;
  }

  try {
    return core.getInput(name) || defaultValue;
  } catch {
    return defaultValue;
  }
}

export function parseActionInputs(
  source: Record<string, string | undefined> = {},
): ActionInputs {
  const get = (name: string, envName: string, fallback = "") =>
    source[envName] ?? source[name] ?? readInput(name, envName, fallback);

  return {
    url: get("url", "INPUT_URL"),
    screenshotOut: get("screenshot-out", "INPUT_SCREENSHOT_OUT", DEFAULT_SCREENSHOT_OUT),
    vision: parseBoolean(get("vision", "INPUT_VISION", "false"), false),
    failOnConsoleErrors: parseBoolean(
      get("fail-on-console-errors", "INPUT_FAIL_ON_CONSOLE_ERRORS", "true"),
      true,
    ),
    failOnNetworkErrors: parseBoolean(
      get("fail-on-network-errors", "INPUT_FAIL_ON_NETWORK_ERRORS", "true"),
      true,
    ),
    failOnBlank: parseBoolean(get("fail-on-blank", "INPUT_FAIL_ON_BLANK", "true"), true),
    uploadArtifact: parseBoolean(get("upload-artifact", "INPUT_UPLOAD_ARTIFACT", "true"), true),
  };
}

export function resolveActionPaths(
  screenshotOut: string,
  workspace = process.env.GITHUB_WORKSPACE ?? process.cwd(),
): { screenshotPath: string; reportPath: string; workspace: string } {
  const resolvedWorkspace = resolve(workspace);
  return {
    workspace: resolvedWorkspace,
    screenshotPath: resolve(resolvedWorkspace, screenshotOut),
    reportPath: resolve(resolvedWorkspace, DEFAULT_REPORT_NAME),
  };
}

function setOutput(name: string, value: string): void {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    appendFileSync(outputFile, `${name}=${value}${process.env.GITHUB_OUTPUT_EOL ?? "\n"}`);
    return;
  }

  core.setOutput(name, value);
}

export async function runBrowserCheckAction(
  inputs: ActionInputs,
  options: {
    workspace?: string;
    runCheck?: typeof runSmokeCheck;
  } = {},
): Promise<ActionReport> {
  if (!inputs.url) {
    throw new Error("Input 'url' is required.");
  }

  const paths = resolveActionPaths(inputs.screenshotOut, options.workspace);
  await mkdir(dirname(paths.screenshotPath), { recursive: true });

  const runCheck = options.runCheck ?? runSmokeCheck;
  const provider = new PlaywrightBrowserProvider();

  try {
    const result = await runCheck(provider, inputs.url, {
      screenshotOut: paths.screenshotPath,
      vision: inputs.vision,
      force: true,
    });

    const decision = evaluateActionDecision(result, {
      failOnConsoleErrors: inputs.failOnConsoleErrors,
      failOnNetworkErrors: inputs.failOnNetworkErrors,
      failOnBlank: inputs.failOnBlank,
      vision: inputs.vision,
    } satisfies ActionDecisionOptions);

    const report: ActionReport = {
      ok: !decision.shouldFail,
      result,
      decision,
      artifacts: {
        screenshotPath: result.screenshot.captured ? paths.screenshotPath : null,
        reportPath: paths.reportPath,
      },
    };

    await writeFile(paths.reportPath, JSON.stringify(report, null, 2));

    setOutput("status", result.status);
    setOutput("summary", result.summary);
    setOutput("report-path", paths.reportPath);
    setOutput("screenshot-path", report.artifacts.screenshotPath ?? "");

    if (inputs.uploadArtifact && process.env.GITHUB_ACTIONS === "true") {
      core.info("Artifacts ready for upload via actions/upload-artifact.");
      core.info(`Report: ${paths.reportPath}`);
      if (report.artifacts.screenshotPath) {
        core.info(`Screenshot: ${report.artifacts.screenshotPath}`);
      }
    }

    return report;
  } finally {
    await provider.dispose();
  }
}

async function main(): Promise<void> {
  const inputs = parseActionInputs();

  core.info(`Running Agent Browser smoke check for ${inputs.url}`);
  const report = await runBrowserCheckAction(inputs);

  if (report.decision.warnings.length > 0) {
    core.warning(report.decision.warnings.join(" "));
  }

  if (report.decision.shouldFail) {
    core.setFailed(report.decision.reasons.join(" "));
  } else {
    core.info(report.result.summary);
  }
}

const actionEntryPath = fileURLToPath(import.meta.url);
const invokedEntryPath = process.argv[1] ? resolve(process.argv[1]) : "";

if (invokedEntryPath === actionEntryPath) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "Agent Browser action failed";
    core.setFailed(message);
  });
}