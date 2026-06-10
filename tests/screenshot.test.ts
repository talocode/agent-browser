import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { screenshotUrl } from "../src/tools/screenshot.js";
import { MockBrowserProvider } from "./mocks/mock-provider.js";

describe("screenshot overwrite protection", () => {
  let tempDir = "";

  afterEach(async () => {
    tempDir = "";
  });

  it("refuses overwrite without --force", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "agent-browser-"));
    const outPath = join(tempDir, "shot.png");
    await writeFile(outPath, "existing");

    const provider = new MockBrowserProvider();

    await expect(
      screenshotUrl(provider, "https://example.com", { out: outPath }),
    ).rejects.toThrow(/already exists/);
  });
});