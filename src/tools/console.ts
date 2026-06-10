import type { BrowserProvider, ConsoleMessage } from "../browser/provider.js";
import { assertSafeUrl } from "../browser/safety.js";

export async function consoleForUrl(
  provider: BrowserProvider,
  url: string,
): Promise<ConsoleMessage[]> {
  assertSafeUrl(url);
  const session = await provider.startSession();
  try {
    await provider.navigate(session.sessionId, url);
    return await provider.getConsoleMessages(session.sessionId);
  } finally {
    await provider.closeSession(session.sessionId);
  }
}