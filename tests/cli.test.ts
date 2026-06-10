import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const tsxPath = require.resolve("tsx/cli");

function runCli(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [tsxPath, "src/cli.ts", ...args], {
      cwd: process.cwd(),
      env: process.env,
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

describe("CLI unsafe URL failure", () => {
  it(
    "fails clearly on unsafe URLs",
    async () => {
      const result = await runCli(["navigate", "http://localhost:3000"]);
      expect(result.code).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toMatch(/Localhost is disabled|Error:/);
    },
    25_000,
  );
});