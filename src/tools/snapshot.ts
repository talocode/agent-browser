import type { BrowserProvider, SnapshotResult } from "../browser/provider.js";
import { assertSafeUrl } from "../browser/safety.js";

export interface SnapshotToolOptions {
  maxTextChars?: number;
}

export async function snapshotUrl(
  provider: BrowserProvider,
  url: string,
  options: SnapshotToolOptions = {},
): Promise<SnapshotResult> {
  assertSafeUrl(url);
  const session = await provider.startSession();
  try {
    await provider.navigate(session.sessionId, url);
    return await provider.snapshot(session.sessionId, {
      maxTextChars: options.maxTextChars,
    });
  } finally {
    await provider.closeSession(session.sessionId);
  }
}