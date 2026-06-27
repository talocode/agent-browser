import type { SmokeCheckResult } from "../tools/check.js";
import type { AgentBrowserSession, SessionReport } from "../sessions/index.js";
import type { BrowserProvider, ScreenshotResult } from "../browser/provider.js";

export interface ApiConfig {
  host: string;
  port: number;
  mode: "local" | "production";
  talocodeApiKey: string | undefined;
  authDisabled: boolean;
  stacklaneBaseUrl: string | undefined;
  stacklaneApiKey: string | undefined;
  version: string;
}

export interface ApiServerOptions {
  config?: Partial<ApiConfig>;
  createProvider?: () => BrowserProvider;
  storageRoot?: string;
}

export type HostedUsageAction =
  | "agent_browser.check"
  | "agent_browser.screenshot"
  | "agent_browser.session.create"
  | "agent_browser.session.report"
  | "agent_browser.session.close";

export interface HostedUsageEvent {
  product: "agent_browser";
  action: HostedUsageAction;
  units: number;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface CheckRequestBody {
  url: string;
  screenshot?: boolean;
  vision?: boolean;
  sessionId?: string;
}

export interface ScreenshotRequestBody {
  url: string;
  sessionId?: string;
}

export interface SessionCreateRequestBody {
  name?: string;
}

export interface ApiSuccessResponse<T> {
  ok: true;
  data: T;
}

export interface ApiErrorResponse {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export interface HealthResponse {
  ok: true;
  version: string;
  mode: string;
}

export interface ConfigStatusResponse {
  ok: true;
  talocodeApiKey: "present" | "missing";
  stacklane: {
    baseUrl: "present" | "missing";
    apiKey: "present" | "missing";
  };
  authDisabled: boolean;
}

export interface CheckResponseData {
  result: SmokeCheckResult;
  sessionId?: string;
  traceStepId?: string;
}

export interface ScreenshotResponseData {
  result: ScreenshotResult;
  sessionId?: string;
  traceStepId?: string;
}

export interface SessionResponseData {
  session: AgentBrowserSession;
}

export interface SessionReportResponseData {
  report: SessionReport;
  format: "json" | "markdown";
  markdown?: string;
}

export interface RouteContext {
  config: ApiConfig;
  createProvider: () => BrowserProvider;
  storageRoot?: string;
}