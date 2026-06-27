import { mkdtemp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const tsxPath = require.resolve("tsx/cli");

function runCli(args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [tsxPath, "src/cli.ts", ...args], {
      cwd: process.cwd(),
      env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

describe("CLI session commands", () => {
  let storageRoot: string;
  let env: NodeJS.ProcessEnv;
  let previousStorageRoot: string | undefined;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), "agent-browser-cli-sessions-"));
    previousStorageRoot = process.env.AGENT_BROWSER_STORAGE_ROOT;
    env = {
      ...process.env,
      AGENT_BROWSER_STORAGE_ROOT: storageRoot,
    };
  });

  afterEach(() => {
    if (previousStorageRoot === undefined) {
      delete process.env.AGENT_BROWSER_STORAGE_ROOT;
    } else {
      process.env.AGENT_BROWSER_STORAGE_ROOT = previousStorageRoot;
    }
  });

  it("parses session create/list/trace/report commands", async () => {
    const create = await runCli(["--json", "session", "create", "--name", "deploy"], env);
    expect(create.code).toBe(0);
    const created = JSON.parse(create.stdout) as { ok: boolean; session: { id: string } };
    expect(created.ok).toBe(true);
    expect(created.session.id).toMatch(/^[a-f0-9-]{36}$/i);

    const list = await runCli(["--json", "session", "list"], env);
    expect(list.code).toBe(0);
    const listed = JSON.parse(list.stdout) as { ok: boolean; sessions: Array<{ id: string }> };
    expect(listed.sessions.some((session) => session.id === created.session.id)).toBe(true);

    const reportBeforeClose = await runCli(
      ["session", "report", created.session.id, "--format", "json"],
      env,
    );
    expect(reportBeforeClose.code).toBe(0);
    const reportedBefore = JSON.parse(reportBeforeClose.stdout) as {
      sessionId: string;
      recommendedNextAction: string;
    };
    expect(reportedBefore.sessionId).toBe(created.session.id);
    expect(reportedBefore.recommendedNextAction).toBeTruthy();

    const close = await runCli(["--json", "session", "close", created.session.id], env);
    expect(close.code).toBe(0);

    const trace = await runCli(["--json", "session", "trace", created.session.id], env);
    expect(trace.code).toBe(0);
    const traced = JSON.parse(trace.stdout) as { ok: boolean; steps: Array<{ action: string }> };
    expect(traced.steps.some((step) => step.action === "close")).toBe(true);

    const report = await runCli(["session", "report", created.session.id, "--format", "json"], env);
    expect(report.code).toBe(0);
    const reported = JSON.parse(report.stdout) as {
      sessionId: string;
      steps: unknown[];
      recommendedNextAction: string;
    };
    expect(reported.sessionId).toBe(created.session.id);
    expect(reported.steps.length).toBeGreaterThan(0);
    expect(reported.recommendedNextAction).toBeTruthy();

    const reuse = await runCli(["snapshot", "--session", created.session.id], env);
    expect(reuse.code).toBe(1);
    expect(`${reuse.stdout}${reuse.stderr}`).toMatch(/closed|cannot be reused/i);
  }, 120_000);
});