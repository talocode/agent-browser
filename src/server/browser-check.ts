import type { BrowserProvider } from "../browser/provider.js";
import { type SmokeCheckResult, runSmokeCheck } from "../tools/check.js";
import type { visionInspect } from "../vision/python-bridge.js";

export interface BrowserCheckToolInput {
  url: string;
  screenshotOut?: string;
  vision?: boolean;
  json?: boolean;
  force?: boolean;
  visionInspectFn?: typeof visionInspect;
}

export async function handleBrowserCheck(
  provider: BrowserProvider,
  input: BrowserCheckToolInput,
): Promise<{ ok: true; result: SmokeCheckResult }> {
  const result = await runSmokeCheck(provider, input.url, {
    screenshotOut: input.screenshotOut,
    vision: input.vision ?? false,
    force: input.force,
    visionInspectFn: input.visionInspectFn,
  });

  return { ok: true, result };
}