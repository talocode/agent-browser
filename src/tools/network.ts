import type { BrowserProvider, NetworkRequest } from "../browser/provider.js";
import { assertSafeUrl } from "../browser/safety.js";

export async function networkForUrl(
  provider: BrowserProvider,
  url: string,
): Promise<NetworkRequest[]> {
  assertSafeUrl(url);
  const session = await provider.startSession();
  try {
    await provider.navigate(session.sessionId, url);
    return await provider.getNetworkRequests(session.sessionId);
  } finally {
    await provider.closeSession(session.sessionId);
  }
}