import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BrowserProvider } from "../browser/provider.js";
import { consoleForUrl } from "../tools/console.js";
import { runSmokeCheck, type SmokeCheckResult } from "../tools/check.js";
import { navigateToUrl } from "../tools/navigate.js";
import { networkForUrl } from "../tools/network.js";
import { screenshotUrl } from "../tools/screenshot.js";
import { snapshotUrl } from "../tools/snapshot.js";
import { appendTraceStep, mapCheckStatusToTrace } from "./trace.js";
import {
  assertSafeFilename,
  ensureStorageDirs,
  getSessionScreenshotsDir,
  loadSessions,
  saveSessions,
} from "./store.js";
import type { AgentBrowserSession, AgentBrowserTraceStep } from "./types.js";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export class SessionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SessionError";
    this.code = code;
  }
}

export class SessionManager {
  constructor(private readonly root?: string) {}

  private async refreshExpiry(sessions: AgentBrowserSession[]): Promise<AgentBrowserSession[]> {
    const now = Date.now();
    let changed = false;

    const updated = sessions.map((session) => {
      if (session.status !== "active") {
        return session;
      }
      const age = now - new Date(session.updatedAt).getTime();
      if (age > SESSION_TTL_MS) {
        changed = true;
        return { ...session, status: "expired" as const, updatedAt: new Date().toISOString() };
      }
      return session;
    });

    if (changed) {
      await saveSessions(updated, this.root);
    }

    return updated;
  }

  async createSession(input: { name?: string; metadata?: Record<string, unknown> } = {}): Promise<AgentBrowserSession> {
    await ensureStorageDirs(this.root);
    const now = new Date().toISOString();
    const session: AgentBrowserSession = {
      id: randomUUID(),
      name: input.name,
      status: "active",
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata,
    };

    const sessions = await this.refreshExpiry(await loadSessions(this.root));
    sessions.push(session);
    await saveSessions(sessions, this.root);
    return session;
  }

  async listSessions(): Promise<AgentBrowserSession[]> {
    return this.refreshExpiry(await loadSessions(this.root));
  }

  async getSession(sessionId: string): Promise<AgentBrowserSession | undefined> {
    const sessions = await this.listSessions();
    return sessions.find((session) => session.id === sessionId);
  }

  async requireActiveSession(sessionId: string): Promise<AgentBrowserSession> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new SessionError("session_not_found", `Session not found: ${sessionId}`);
    }
    if (session.status === "closed") {
      throw new SessionError("session_closed", `Session is closed and cannot be reused: ${sessionId}`);
    }
    if (session.status === "expired") {
      throw new SessionError("session_expired", `Session has expired and cannot be reused: ${sessionId}`);
    }
    return session;
  }

  private async updateSession(session: AgentBrowserSession, patch: Partial<AgentBrowserSession>): Promise<AgentBrowserSession> {
    const sessions = await loadSessions(this.root);
    const index = sessions.findIndex((entry) => entry.id === session.id);
    if (index < 0) {
      throw new SessionError("session_not_found", `Session not found: ${session.id}`);
    }

    const updated: AgentBrowserSession = {
      ...sessions[index],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    sessions[index] = updated;
    await saveSessions(sessions, this.root);
    return updated;
  }

  private resolveUrl(session: AgentBrowserSession, url?: string): string {
    const target = url ?? session.lastUrl;
    if (!target) {
      throw new SessionError("missing_url", "URL is required when the session has no lastUrl.");
    }
    return target;
  }

  private async saveSessionScreenshot(
    sessionId: string,
    stepId: string,
    base64: string,
  ): Promise<string> {
    const filename = `${stepId}.png`;
    assertSafeFilename(filename);
    const dir = getSessionScreenshotsDir(sessionId, this.root);
    await ensureStorageDirs(this.root);
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dir, { recursive: true });
    const path = join(dir, filename);
    await writeFile(path, Buffer.from(base64, "base64"));
    return path;
  }

  async closeSession(sessionId: string): Promise<AgentBrowserSession> {
    const session = await this.requireActiveSession(sessionId);
    await appendTraceStep(
      {
        sessionId,
        action: "close",
        status: "passed",
      },
      this.root,
    );
    return this.updateSession(session, { status: "closed" });
  }

  async navigate(
    provider: BrowserProvider,
    sessionId: string,
    url: string,
  ): Promise<{ result: Awaited<ReturnType<typeof navigateToUrl>>; step: AgentBrowserTraceStep }> {
    const session = await this.requireActiveSession(sessionId);
    try {
      const result = await navigateToUrl(provider, url);
      const step = await appendTraceStep(
        {
          sessionId,
          action: "navigate",
          url: result.url,
          status: "passed",
        },
        this.root,
      );
      await this.updateSession(session, { lastUrl: result.url });
      return { result, step };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Navigation failed";
      const step = await appendTraceStep(
        {
          sessionId,
          action: "navigate",
          url,
          status: "failed",
          errors: [message],
        },
        this.root,
      );
      throw Object.assign(error instanceof Error ? error : new Error(message), { traceStep: step });
    }
  }

  async snapshot(
    provider: BrowserProvider,
    sessionId: string,
    url?: string,
    options: { maxTextChars?: number } = {},
  ) {
    const session = await this.requireActiveSession(sessionId);
    const targetUrl = this.resolveUrl(session, url);
    try {
      const result = await snapshotUrl(provider, targetUrl, options);
      const step = await appendTraceStep(
        {
          sessionId,
          action: "snapshot",
          url: result.url,
          status: "passed",
        },
        this.root,
      );
      await this.updateSession(session, { lastUrl: result.url });
      return { result, step };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Snapshot failed";
      await appendTraceStep(
        {
          sessionId,
          action: "snapshot",
          url: targetUrl,
          status: "failed",
          errors: [message],
        },
        this.root,
      );
      throw error;
    }
  }

  async screenshot(
    provider: BrowserProvider,
    sessionId: string,
    url?: string,
    options: { out?: string; force?: boolean; fullPage?: boolean } = {},
  ) {
    const session = await this.requireActiveSession(sessionId);
    const targetUrl = this.resolveUrl(session, url);
    try {
      const result = await screenshotUrl(provider, targetUrl, options);
      let screenshotPath = result.path;
      if (!screenshotPath && result.base64) {
        const pendingStepId = randomUUID();
        screenshotPath = await this.saveSessionScreenshot(sessionId, pendingStepId, result.base64);
      }
      const step = await appendTraceStep(
        {
          sessionId,
          action: "screenshot",
          url: targetUrl,
          status: "passed",
          screenshotPath,
        },
        this.root,
      );
      await this.updateSession(session, { lastUrl: targetUrl });
      return { result: { ...result, path: screenshotPath ?? result.path }, step };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Screenshot failed";
      await appendTraceStep(
        {
          sessionId,
          action: "screenshot",
          url: targetUrl,
          status: "failed",
          errors: [message],
        },
        this.root,
      );
      throw error;
    }
  }

  async console(provider: BrowserProvider, sessionId: string, url?: string) {
    const session = await this.requireActiveSession(sessionId);
    const targetUrl = this.resolveUrl(session, url);
    try {
      const messages = await consoleForUrl(provider, targetUrl);
      const errors = messages.filter((message) => message.type === "error");
      const step = await appendTraceStep(
        {
          sessionId,
          action: "console",
          url: targetUrl,
          status: errors.length > 0 ? "warn" : "passed",
          consoleCount: messages.length,
          warnings: errors.length > 0 ? [`Console errors detected: ${errors.length}`] : [],
        },
        this.root,
      );
      await this.updateSession(session, { lastUrl: targetUrl });
      return { result: messages, step };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Console capture failed";
      await appendTraceStep(
        {
          sessionId,
          action: "console",
          url: targetUrl,
          status: "failed",
          errors: [message],
        },
        this.root,
      );
      throw error;
    }
  }

  async network(provider: BrowserProvider, sessionId: string, url?: string) {
    const session = await this.requireActiveSession(sessionId);
    const targetUrl = this.resolveUrl(session, url);
    try {
      const requests = await networkForUrl(provider, targetUrl);
      const failed = requests.filter((request) => request.status === null || request.status >= 400);
      const step = await appendTraceStep(
        {
          sessionId,
          action: "network",
          url: targetUrl,
          status: failed.length > 0 ? "warn" : "passed",
          networkCount: requests.length,
          warnings: failed.length > 0 ? [`Failed network requests detected: ${failed.length}`] : [],
        },
        this.root,
      );
      await this.updateSession(session, { lastUrl: targetUrl });
      return { result: requests, step };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Network capture failed";
      await appendTraceStep(
        {
          sessionId,
          action: "network",
          url: targetUrl,
          status: "failed",
          errors: [message],
        },
        this.root,
      );
      throw error;
    }
  }

  async check(
    provider: BrowserProvider,
    sessionId: string,
    url: string,
    options: { screenshotOut?: string; force?: boolean; vision?: boolean } = {},
  ): Promise<{ result: SmokeCheckResult; step: AgentBrowserTraceStep }> {
    const session = await this.requireActiveSession(sessionId);
    try {
      const result = await runSmokeCheck(provider, url, options);
      const traceStatus = mapCheckStatusToTrace(result.status);
      const step = await appendTraceStep(
        {
          sessionId,
          action: "check",
          url: result.url,
          status: traceStatus,
          screenshotPath: result.screenshot.path ?? undefined,
          consoleCount: result.console.total,
          networkCount: result.network.total,
          warnings:
            traceStatus === "warn"
              ? result.checks.filter((check) => check.status === "warn").map((check) => check.message)
              : [],
          errors:
            traceStatus === "failed"
              ? result.checks.filter((check) => check.status === "fail").map((check) => check.message)
              : [],
        },
        this.root,
      );
      await this.updateSession(session, { lastUrl: result.url });
      return { result, step };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Smoke check failed";
      await appendTraceStep(
        {
          sessionId,
          action: "check",
          url,
          status: "failed",
          errors: [message],
        },
        this.root,
      );
      throw error;
    }
  }
}