import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SessionManager,
  buildSessionReport,
  formatReportJson,
  formatReportMarkdown,
  getTraceSteps,
  mapCheckStatusToTrace,
} from "../src/sessions/index.js";
import { MockBrowserProvider } from "./mocks/mock-provider.js";

describe("session lifecycle", () => {
  let storageRoot: string;
  let previousStorageRoot: string | undefined;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), "agent-browser-sessions-"));
    previousStorageRoot = process.env.AGENT_BROWSER_STORAGE_ROOT;
    process.env.AGENT_BROWSER_STORAGE_ROOT = storageRoot;
  });

  afterEach(() => {
    if (previousStorageRoot === undefined) {
      delete process.env.AGENT_BROWSER_STORAGE_ROOT;
    } else {
      process.env.AGENT_BROWSER_STORAGE_ROOT = previousStorageRoot;
    }
  });

  it("creates, lists, and closes sessions", async () => {
    const manager = new SessionManager(storageRoot);
    const created = await manager.createSession({ name: "deploy-check" });
    expect(created.status).toBe("active");
    expect(created.name).toBe("deploy-check");

    const sessions = await manager.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.id).toBe(created.id);

    const closed = await manager.closeSession(created.id);
    expect(closed.status).toBe("closed");

    const steps = await getTraceSteps(created.id, storageRoot);
    expect(steps.some((step) => step.action === "close")).toBe(true);
  });

  it("rejects reuse of closed sessions", async () => {
    const manager = new SessionManager(storageRoot);
    const created = await manager.createSession();
    await manager.closeSession(created.id);

    await expect(manager.requireActiveSession(created.id)).rejects.toThrow(/closed/);
  });

  it("appends trace steps for session-aware actions", async () => {
    const manager = new SessionManager(storageRoot);
    const provider = new MockBrowserProvider();
    const session = await manager.createSession();

    await manager.navigate(provider, session.id, "https://example.com");
    await manager.console(provider, session.id);
    await manager.network(provider, session.id);

    const steps = await getTraceSteps(session.id, storageRoot);
    expect(steps.map((step) => step.action)).toEqual(["navigate", "console", "network"]);
    expect(steps[0]?.url).toBe("https://example.com");
    expect(steps[1]?.consoleCount).toBeGreaterThan(0);
    expect(steps[2]?.networkCount).toBeGreaterThan(0);
  });

  it("generates JSON and Markdown reports with required fields", async () => {
    const manager = new SessionManager(storageRoot);
    const provider = new MockBrowserProvider();
    const session = await manager.createSession({ name: "report-test" });

    await manager.navigate(provider, session.id, "https://example.com");
    await manager.check(provider, session.id, "https://example.com");

    const current = (await manager.listSessions()).find((entry) => entry.id === session.id);
    expect(current).toBeTruthy();

    const report = await buildSessionReport(current!, storageRoot);
    expect(report.sessionId).toBe(session.id);
    expect(report.startedAt).toBeTruthy();
    expect(report.endedAt).toBeTruthy();
    expect(report.steps.length).toBeGreaterThanOrEqual(2);
    expect(report.recommendedNextAction).toBeTruthy();

    const json = formatReportJson(report);
    const parsed = JSON.parse(json) as { sessionId: string; steps: unknown[]; finalStatus: string };
    expect(parsed.sessionId).toBe(session.id);
    expect(parsed.steps.length).toBeGreaterThan(0);
    expect(parsed.finalStatus).toMatch(/passed|warn|failed/);

    const markdown = formatReportMarkdown(report);
    expect(markdown).toContain("# Agent Browser Session Report");
    expect(markdown).toContain(session.id);
    expect(markdown).toContain("Recommended next action");
  });

  it("maps check status to trace status", () => {
    expect(mapCheckStatusToTrace("pass")).toBe("passed");
    expect(mapCheckStatusToTrace("warn")).toBe("warn");
    expect(mapCheckStatusToTrace("fail")).toBe("failed");
  });

  it("persists sessions under .agent-browser/sessions.json", async () => {
    const manager = new SessionManager(storageRoot);
    const session = await manager.createSession();
    const raw = await readFile(join(storageRoot, ".agent-browser", "sessions.json"), "utf8");
    const parsed = JSON.parse(raw) as { sessions: Array<{ id: string }> };
    expect(parsed.sessions.some((entry) => entry.id === session.id)).toBe(true);
  });
});