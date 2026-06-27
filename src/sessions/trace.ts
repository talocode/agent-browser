import { randomUUID } from "node:crypto";
import type { CheckStatus } from "../tools/check.js";
import { loadTraceSteps, saveTraceSteps } from "./store.js";
import type {
  AgentBrowserTraceAction,
  AgentBrowserTraceStatus,
  AgentBrowserTraceStep,
} from "./types.js";

export function mapCheckStatusToTrace(status: CheckStatus): AgentBrowserTraceStatus {
  if (status === "pass") return "passed";
  if (status === "warn") return "warn";
  return "failed";
}

export function worstTraceStatus(statuses: AgentBrowserTraceStatus[]): AgentBrowserTraceStatus {
  if (statuses.some((status) => status === "failed")) return "failed";
  if (statuses.some((status) => status === "warn")) return "warn";
  return "passed";
}

export interface AppendTraceStepInput {
  sessionId: string;
  action: AgentBrowserTraceAction;
  url?: string;
  status: AgentBrowserTraceStatus;
  screenshotPath?: string;
  consoleCount?: number;
  networkCount?: number;
  warnings?: string[];
  errors?: string[];
}

export async function appendTraceStep(
  input: AppendTraceStepInput,
  root?: string,
): Promise<AgentBrowserTraceStep> {
  const step: AgentBrowserTraceStep = {
    id: randomUUID(),
    sessionId: input.sessionId,
    action: input.action,
    url: input.url,
    status: input.status,
    screenshotPath: input.screenshotPath,
    consoleCount: input.consoleCount,
    networkCount: input.networkCount,
    warnings: input.warnings ?? [],
    errors: input.errors ?? [],
    createdAt: new Date().toISOString(),
  };

  const data = await loadTraceSteps(input.sessionId, root);
  data.steps.push(step);
  await saveTraceSteps(input.sessionId, data, root);
  return step;
}

export async function getTraceSteps(sessionId: string, root?: string): Promise<AgentBrowserTraceStep[]> {
  const data = await loadTraceSteps(sessionId, root);
  return data.steps;
}