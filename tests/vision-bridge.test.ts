import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  VisionModuleMissingError,
  assertVisionModuleAvailable,
  buildVisionCommand,
  ensureVisionOutputPath,
  findRepoRoot,
  getVisionPackageDir,
  isVisionPackagePresent,
} from "../src/vision/python-bridge.js";

describe("vision bridge command construction", () => {
  it("builds inspect command args", () => {
    const repoRoot = findRepoRoot();
    expect(repoRoot).not.toBeNull();

    const runner = buildVisionCommand(["inspect", "/tmp/example.png"], {
      repoRoot: repoRoot!,
    });

    expect(runner.args).toEqual(expect.arrayContaining(["inspect", "/tmp/example.png"]));
    expect(runner.cwd).toBe(getVisionPackageDir(repoRoot!));
    expect(runner.env.PYTHONPATH).toBe(getVisionPackageDir(repoRoot!));
  });

  it("builds diff command args with output path", () => {
    const repoRoot = findRepoRoot();
    expect(repoRoot).not.toBeNull();

    const runner = buildVisionCommand(
      ["diff", "/tmp/before.png", "/tmp/after.png", "--out", "/tmp/diff.png"],
      { repoRoot: repoRoot! },
    );

    expect(runner.args).toEqual(
      expect.arrayContaining([
        "diff",
        "/tmp/before.png",
        "/tmp/after.png",
        "--out",
        "/tmp/diff.png",
      ]),
    );
  });
});

describe("missing vision module handling", () => {
  it("reports missing package with install guidance", async () => {
    const missingRoot = await mkdtemp(join(tmpdir(), "agent-browser-missing-"));

    await expect(assertVisionModuleAvailable(missingRoot)).rejects.toMatchObject({
      name: "VisionModuleMissingError",
      code: "vision_module_missing",
    });

    await expect(assertVisionModuleAvailable(missingRoot)).rejects.toThrow(
      /pip install -e "\.\[dev\]"/,
    );
  });

  it("returns false when package directory is absent", async () => {
    const missingRoot = await mkdtemp(join(tmpdir(), "agent-browser-absent-"));
    await expect(isVisionPackagePresent(missingRoot)).resolves.toBe(false);
  });

  it("throws VisionModuleMissingError type for missing module", async () => {
    const missingRoot = await mkdtemp(join(tmpdir(), "agent-browser-type-"));

    await expect(assertVisionModuleAvailable(missingRoot)).rejects.toBeInstanceOf(
      VisionModuleMissingError,
    );
  });
});

describe("vision diff overwrite protection", () => {
  it("refuses overwrite without --force", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "agent-browser-vision-diff-"));
    const outPath = join(tempDir, "diff.png");
    await writeFile(outPath, "existing");

    await expect(ensureVisionOutputPath(outPath)).rejects.toThrow(/already exists/);
    await expect(ensureVisionOutputPath(outPath, true)).resolves.toBeUndefined();
  });
});