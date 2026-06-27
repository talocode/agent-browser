export type AgentBrowserSessionStatus = "active" | "closed" | "expired";

export type AgentBrowserTraceAction =
  | "navigate"
  | "snapshot"
  | "screenshot"
  | "console"
  | "network"
  | "check"
  | "close";

export type AgentBrowserTraceStatus = "passed" | "warn" | "failed";

export interface AgentBrowserSession {
  id: string;
  name?: string;
  status: AgentBrowserSessionStatus;
  createdAt: string;
  updatedAt: string;
  lastUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentBrowserTraceStep {
  id: string;
  sessionId: string;
  action: AgentBrowserTraceAction;
  url?: string;
  status: AgentBrowserTraceStatus;
  screenshotPath?: string;
  consoleCount?: number;
  networkCount?: number;
  warnings: string[];
  errors: string[];
  createdAt: string;
}

export interface SessionStoreData {
  sessions: AgentBrowserSession[];
}

export interface TraceStoreData {
  steps: AgentBrowserTraceStep[];
}

export type ReportFormat = "json" | "markdown";

export interface SessionReport {
  sessionId: string;
  name?: string;
  status: AgentBrowserSessionStatus;
  startedAt: string;
  endedAt: string;
  finalStatus: AgentBrowserTraceStatus;
  steps: AgentBrowserTraceStep[];
  screenshots: string[];
  consoleWarningSummary: string;
  networkWarningSummary: string;
  failedChecks: string[];
  recommendedNextAction: string;
}