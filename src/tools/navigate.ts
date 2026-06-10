import type { BrowserProvider, NavigateResult } from "../browser/provider.js";
import { assertSafeUrl } from "../browser/safety.js";

export async function navigateToUrl(
  provider: BrowserProvider,
  url: string,
): Promise<NavigateResult> {
  assertSafeUrl(url);
  const session = await provider.startSession();
  try {
    return await provider.navigate(session.sessionId, url);
  } finally {
    await provider.closeSession(session.sessionId);
  }
}