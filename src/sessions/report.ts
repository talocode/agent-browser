import type { AgentBrowserSession, AgentBrowserTraceStep, SessionReport } from "./types.js";
import { getTraceSteps, worstTraceStatus } from "./trace.js";

function summarizeConsoleWarnings(steps: AgentBrowserTraceStep[]): string {
  const consoleSteps = steps.filter((step) => step.action === "console" || step.action === "check");
  const total = consoleSteps.reduce((sum, step) => sum + (step.consoleCount ?? 0), 0);
  const warned = consoleSteps.filter((step) => step.warnings.length > 0).length;
  if (total === 0) return "No console evidence collected.";
  if (warned === 0) return `Console messages observed (${total}); no warnings recorded.`;
  return `Console warnings in ${warned} step(s); ${total} message(s) total.`;
}

function summarizeNetworkWarnings(steps: AgentBrowserTraceStep[]): string {
  const networkSteps = steps.filter((step) => step.action === "network" || step.action === "check");
  const total = networkSteps.reduce((sum, step) => sum + (step.networkCount ?? 0), 0);
  const warned = networkSteps.filter((step) => step.warnings.length > 0).length;
  if (total === 0) return "No network evidence collected.";
  if (warned === 0) return `Network requests observed (${total}); no warnings recorded.`;
  return `Network warnings in ${warned} step(s); ${total} request(s) total.`;
}

function collectFailedChecks(steps: AgentBrowserTraceStep[]): string[] {
  return steps
    .filter((step) => step.action === "check" && step.status === "failed")
    .flatMap((step) => (step.errors.length > 0 ? step.errors : ["Smoke check failed"]));
}

function recommendNextAction(session: AgentBrowserSession, steps: AgentBrowserTraceStep[]): string {
  if (session.status === "active") {
    const last = steps.at(-1);
    if (!last) return "Run navigate or check against the target URL to begin evidence collection.";
    if (last.status === "failed") return "Inspect the failed step errors, fix the deployment, then rerun check.";
    if (last.status === "warn") return "Review warnings and rerun check or capture screenshot for review.";
    return "Continue with snapshot, console, network, or check to gather more evidence.";
  }
  if (steps.some((step) => step.status === "failed")) {
    return "Review the trace report, address failures, then start a new session for validation.";
  }
  return "Session closed. Archive the report or start a new session for further validation.";
}

export async function buildSessionReport(
  session: AgentBrowserSession,
  root?: string,
): Promise<SessionReport> {
  const steps = await getTraceSteps(session.id, root);
  const screenshots = steps
    .map((step) => step.screenshotPath)
    .filter((path): path is string => Boolean(path));
  const finalStatus = worstTraceStatus(steps.map((step) => step.status));

  return {
    sessionId: session.id,
    name: session.name,
    status: session.status,
    startedAt: session.createdAt,
    endedAt: session.updatedAt,
    finalStatus,
    steps,
    screenshots,
    consoleWarningSummary: summarizeConsoleWarnings(steps),
    networkWarningSummary: summarizeNetworkWarnings(steps),
    failedChecks: collectFailedChecks(steps),
    recommendedNextAction: recommendNextAction(session, steps),
  };
}

export function formatReportJson(report: SessionReport): string {
  return JSON.stringify(report, null, 2);
}

export function formatReportMarkdown(report: SessionReport): string {
  const lines = [
    `# Agent Browser Session Report`,
    ``,
    `**Session ID:** ${report.sessionId}`,
    report.name ? `**Name:** ${report.name}` : undefined,
    `**Status:** ${report.status}`,
    `**Started:** ${report.startedAt}`,
    `**Ended:** ${report.endedAt}`,
    `**Final status:** ${report.finalStatus}`,
    ``,
    `## Summary`,
    ``,
    `- Console: ${report.consoleWarningSummary}`,
    `- Network: ${report.networkWarningSummary}`,
    ``,
  ].filter((line): line is string => line !== undefined);

  if (report.failedChecks.length > 0) {
    lines.push(`## Failed checks`, ``);
    for (const failure of report.failedChecks) {
      lines.push(`- ${failure}`);
    }
    lines.push(``);
  }

  if (report.screenshots.length > 0) {
    lines.push(`## Screenshots`, ``);
    for (const screenshot of report.screenshots) {
      lines.push(`- ${screenshot}`);
    }
    lines.push(``);
  }

  lines.push(`## Steps`, ``);
  if (report.steps.length === 0) {
    lines.push(`No trace steps recorded.`);
  } else {
    for (const step of report.steps) {
      const stepLines = [
        `### ${step.action} (${step.status})`,
        ``,
        `- Time: ${step.createdAt}`,
        step.url ? `- URL: ${step.url}` : null,
        step.screenshotPath ? `- Screenshot: ${step.screenshotPath}` : null,
        step.consoleCount !== undefined ? `- Console messages: ${step.consoleCount}` : null,
        step.networkCount !== undefined ? `- Network requests: ${step.networkCount}` : null,
      ].filter((line): line is string => line !== null);
      lines.push(...stepLines);
      if (step.warnings.length > 0) {
        lines.push(`- Warnings: ${step.warnings.join("; ")}`);
      }
      if (step.errors.length > 0) {
        lines.push(`- Errors: ${step.errors.join("; ")}`);
      }
      lines.push(``);
    }
  }

  lines.push(`## Recommended next action`, ``, report.recommendedNextAction);
  return lines.filter((line): line is string => line !== undefined).join("\n");
}