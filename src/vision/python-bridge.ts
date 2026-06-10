import { spawn } from "node:child_process";
import { constants, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const VISION_INSTALL_GUIDANCE =
  'cd python/agent-browser-vision && pip install -e ".[dev]"';

export class VisionModuleMissingError extends Error {
  readonly code = "vision_module_missing";

  constructor(message: string) {
    super(message);
    this.name = "VisionModuleMissingError";
  }
}

export interface VisionRunner {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export interface VisionInspectResult {
  width: number;
  height: number;
  blankScore: number;
  blurScore: number;
  isLikelyBlank: boolean;
  isLikelyBlurry: boolean;
  dominantColors?: Array<{ rgb: number[]; hex: string; ratio: number }>;
  warnings: string[];
}

export interface VisionDiffResult {
  diffScore: number;
  changedPixelsPercent: number;
  beforeSize: { width: number; height: number };
  afterSize: { width: number; height: number };
  dimensionsMatch: boolean;
  layoutShiftScore?: number;
  majorLayoutShift?: boolean;
  outputPath: string | null;
  warnings: string[];
}

export interface VisionBridgeOptions {
  repoRoot?: string;
  json?: boolean;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function findRepoRoot(startPaths: string[] = [process.cwd()]): string | null {
  const seen = new Set<string>();
  const modulePath = fileURLToPath(import.meta.url);
  const roots = [
    ...startPaths.map((value) => resolve(value)),
    resolve(dirname(modulePath), "..", ".."),
    resolve(dirname(modulePath), "..", "..", ".."),
  ];

  for (const start of roots) {
    let current = start;
    for (let depth = 0; depth < 10; depth += 1) {
      if (seen.has(current)) {
        break;
      }
      seen.add(current);

      const packageJson = join(current, "package.json");
      const visionDir = join(current, "python", "agent-browser-vision");
      if (existsSync(packageJson) && existsSync(join(visionDir, "pyproject.toml"))) {
        return current;
      }

      const parent = dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }

  return null;
}

export function getVisionPackageDir(repoRoot: string): string {
  return join(repoRoot, "python", "agent-browser-vision");
}

export async function isVisionPackagePresent(repoRoot?: string): Promise<boolean> {
  const root = repoRoot ?? findRepoRoot();
  if (!root) {
    return false;
  }

  const packageDir = getVisionPackageDir(root);
  return (
    (await pathExists(join(packageDir, "pyproject.toml"))) &&
    (await pathExists(join(packageDir, "agent_browser_vision", "cli.py")))
  );
}

function resolvePythonRunner(packageDir: string): { command: string; baseArgs: string[] } {
  const venvCli = join(packageDir, ".venv", "bin", "agent-browser-vision");
  if (existsSync(venvCli)) {
    return { command: venvCli, baseArgs: [] };
  }

  const venvPython = join(packageDir, ".venv", "bin", "python");
  if (existsSync(venvPython)) {
    return { command: venvPython, baseArgs: ["-m", "agent_browser_vision.cli"] };
  }

  return { command: "python3", baseArgs: ["-m", "agent_browser_vision.cli"] };
}

export function buildVisionCommand(
  visionArgs: string[],
  options: { repoRoot?: string } = {},
): VisionRunner {
  const repoRoot = options.repoRoot ?? findRepoRoot() ?? process.cwd();
  const packageDir = getVisionPackageDir(repoRoot);
  const runner = resolvePythonRunner(packageDir);

  return {
    command: runner.command,
    args: [...runner.baseArgs, ...visionArgs],
    cwd: packageDir,
    env: {
      ...process.env,
      PYTHONPATH: packageDir,
    },
  };
}

function runProcess(
  runner: VisionRunner,
  timeoutMs = 30_000,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(runner.command, runner.args, {
      cwd: runner.cwd,
      env: runner.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      rejectPromise(new Error("Vision command timed out"));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      rejectPromise(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ code, stdout, stderr });
    });
  });
}

export async function isVisionModuleRunnable(repoRoot?: string): Promise<boolean> {
  if (!(await isVisionPackagePresent(repoRoot))) {
    return false;
  }

  try {
    const runner = buildVisionCommand(["--help"], { repoRoot });
    const result = await runProcess(runner, 10_000);
    return result.code === 0;
  } catch {
    return false;
  }
}

export async function assertVisionModuleAvailable(repoRoot?: string): Promise<void> {
  const root = repoRoot ?? findRepoRoot();

  if (!(await isVisionPackagePresent(root ?? undefined))) {
    throw new VisionModuleMissingError(
      `Optional vision module not found. Install it with:\n  ${VISION_INSTALL_GUIDANCE}`,
    );
  }

  if (!(await isVisionModuleRunnable(root ?? undefined))) {
    throw new VisionModuleMissingError(
      `Optional vision module is present but not runnable. Install dependencies with:\n  ${VISION_INSTALL_GUIDANCE}`,
    );
  }
}

function parseVisionOutput(stdout: string, asJson: boolean): unknown {
  const trimmed = stdout.trim();
  if (!asJson) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return trimmed;
    }
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error(`Vision module returned invalid JSON: ${trimmed.slice(0, 200)}`);
  }
}

export async function runVisionCli(
  visionArgs: string[],
  options: VisionBridgeOptions = {},
): Promise<unknown> {
  await assertVisionModuleAvailable(options.repoRoot);

  const args = options.json
    ? visionArgs.includes("--json")
      ? visionArgs
      : [...visionArgs, "--json"]
    : visionArgs;

  const runner = buildVisionCommand(args, { repoRoot: options.repoRoot });
  const result = await runProcess(runner);

  if (result.code !== 0) {
    const message = result.stderr.trim() || result.stdout.trim() || "Vision command failed";
    throw new Error(message);
  }

  return parseVisionOutput(result.stdout, Boolean(options.json));
}

export function formatVisionInspectHuman(result: VisionInspectResult): string {
  const lines = [
    `Dimensions: ${result.width}x${result.height}`,
    `Blank score: ${result.blankScore} (likely blank: ${result.isLikelyBlank})`,
    `Blur score: ${result.blurScore} (likely blurry: ${result.isLikelyBlurry})`,
  ];

  if (result.dominantColors?.length) {
    const colors = result.dominantColors
      .map((color) => `${color.hex} (${Math.round(color.ratio * 100)}%)`)
      .join(", ");
    lines.push(`Dominant colors: ${colors}`);
  }

  if (result.warnings.length > 0) {
    lines.push(`Warnings: ${result.warnings.join("; ")}`);
  }

  return lines.join("\n");
}

export function formatVisionDiffHuman(result: VisionDiffResult): string {
  const lines = [
    `Diff score: ${result.diffScore}`,
    `Changed pixels: ${result.changedPixelsPercent}%`,
    `Before: ${result.beforeSize.width}x${result.beforeSize.height}`,
    `After: ${result.afterSize.width}x${result.afterSize.height}`,
    `Dimensions match: ${result.dimensionsMatch}`,
  ];

  if (typeof result.layoutShiftScore === "number") {
    lines.push(`Layout shift score: ${result.layoutShiftScore} (major: ${result.majorLayoutShift})`);
  }

  if (result.outputPath) {
    lines.push(`Diff image: ${result.outputPath}`);
  }

  if (result.warnings.length > 0) {
    lines.push(`Warnings: ${result.warnings.join("; ")}`);
  }

  return lines.join("\n");
}

export async function visionInspect(
  image: string,
  options: VisionBridgeOptions = {},
): Promise<VisionInspectResult> {
  const result = await runVisionCli(["inspect", image], options);
  return result as VisionInspectResult;
}

export async function ensureVisionOutputPath(out: string, force = false): Promise<void> {
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

export async function visionDiff(
  before: string,
  after: string,
  options: VisionBridgeOptions & { out?: string; force?: boolean } = {},
): Promise<VisionDiffResult> {
  if (options.out) {
    await ensureVisionOutputPath(options.out, options.force);
  }

  const args = ["diff", before, after];
  if (options.out) {
    args.push("--out", options.out);
  }

  const result = await runVisionCli(args, options);
  return result as VisionDiffResult;
}