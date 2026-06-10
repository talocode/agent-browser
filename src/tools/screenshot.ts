import { access, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import type { BrowserProvider, ScreenshotResult } from "../browser/provider.js";
import { assertSafeUrl } from "../browser/safety.js";

export interface ScreenshotToolOptions {
  out?: string;
  force?: boolean;
  fullPage?: boolean;
  type?: "png" | "jpeg";
}

export async function screenshotUrl(
  provider: BrowserProvider,
  url: string,
  options: ScreenshotToolOptions = {},
): Promise<ScreenshotResult> {
  assertSafeUrl(url);

  if (options.out) {
    try {
      await access(options.out, constants.F_OK);
      if (!options.force) {
        throw new Error(`Output file already exists: ${options.out}. Pass --force to overwrite.`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("already exists")) {
        throw error;
      }
    }
  }

  const session = await provider.startSession();
  try {
    await provider.navigate(session.sessionId, url);
    const result = await provider.screenshot(session.sessionId, {
      fullPage: options.fullPage,
      type: options.type,
    });

    if (options.out && result.base64) {
      await writeFile(options.out, Buffer.from(result.base64, "base64"));
      return {
        path: options.out,
        mimeType: result.mimeType,
      };
    }

    return result;
  } finally {
    await provider.closeSession(session.sessionId);
  }
}