import type {
  BrowserProvider,
  ConsoleMessage,
  NavigateResult,
  NetworkRequest,
  ScreenshotResult,
  SnapshotResult,
} from "../../src/browser/provider.js";
import type { BrowserSession } from "../../src/browser/session.js";

export class MockBrowserProvider implements BrowserProvider {
  readonly sessions = new Map<string, BrowserSession>();

  async startSession(): Promise<BrowserSession> {
    const session: BrowserSession = {
      sessionId: `mock-${this.sessions.size + 1}`,
      createdAt: new Date().toISOString(),
      currentUrl: null,
      status: "active",
    };
    this.sessions.set(session.sessionId, session);
    return session;
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = "closed";
    }
  }

  async navigate(_sessionId: string, url: string): Promise<NavigateResult> {
    return { url, title: "Mock Page" };
  }

  async snapshot(_sessionId: string): Promise<SnapshotResult> {
    return {
      url: "https://example.com",
      title: "Example Domain",
      text: "Example text",
      links: [{ text: "More information", href: "https://www.iana.org/domains/example" }],
      headings: [{ level: 1, text: "Example Domain" }],
      buttons: [],
      inputsCount: 0,
      timestamp: new Date().toISOString(),
    };
  }

  async screenshot(): Promise<ScreenshotResult> {
    return {
      base64: Buffer.from("mock-image").toString("base64"),
      mimeType: "image/png",
    };
  }

  async getConsoleMessages(): Promise<ConsoleMessage[]> {
    return [{ type: "log", text: "hello", timestamp: new Date().toISOString() }];
  }

  async getNetworkRequests(): Promise<NetworkRequest[]> {
    return [
      {
        method: "GET",
        url: "https://example.com/?token=secret",
        status: 200,
        resourceType: "document",
        timestamp: new Date().toISOString(),
      },
    ];
  }
}