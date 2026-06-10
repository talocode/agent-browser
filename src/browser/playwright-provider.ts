import { randomUUID } from "node:crypto";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import type {
  BrowserProvider,
  ConsoleMessage,
  NavigateResult,
  NetworkRequest,
  ScreenshotOptions,
  ScreenshotResult,
  SnapshotResult,
} from "./provider.js";
import { assertSafeUrl, redactUrl } from "./safety.js";
import type { BrowserSession, StartSessionOptions } from "./session.js";

interface InternalSession {
  session: BrowserSession;
  context: BrowserContext;
  page: Page;
  consoleMessages: ConsoleMessage[];
  networkRequests: NetworkRequest[];
}

export class PlaywrightBrowserProvider implements BrowserProvider {
  private browser: Browser | null = null;
  private readonly sessions = new Map<string, InternalSession>();

  private async ensureBrowser(): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }

    try {
      this.browser = await chromium.launch({ headless: true });
      return this.browser;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to launch browser";
      throw new Error(
        `Playwright browser is not available. Install Chromium with: npx playwright install chromium. Details: ${message}`,
      );
    }
  }

  private getSession(sessionId: string): InternalSession {
    const session = this.sessions.get(sessionId);
    if (!session || session.session.status !== "active") {
      throw new Error(`Session not found or closed: ${sessionId}`);
    }
    return session;
  }

  private attachListeners(internal: InternalSession): void {
    const { page } = internal;

    page.on("console", (message) => {
      internal.consoleMessages.push({
        type: message.type(),
        text: message.text(),
        timestamp: new Date().toISOString(),
      });
    });

    page.on("request", (request) => {
      internal.networkRequests.push({
        method: request.method(),
        url: redactUrl(request.url()),
        status: null,
        resourceType: request.resourceType(),
        timestamp: new Date().toISOString(),
      });
    });

    page.on("response", (response) => {
      const url = redactUrl(response.url());
      const match = [...internal.networkRequests]
        .reverse()
        .find((entry) => entry.url === url && entry.status === null);
      if (match) {
        match.status = response.status();
      }
    });
  }

  async startSession(options: StartSessionOptions = {}): Promise<BrowserSession> {
    const browser = await this.ensureBrowser();
    const context = await browser.newContext();
    const page = await context.newPage();

    const session: BrowserSession = {
      sessionId: randomUUID(),
      createdAt: new Date().toISOString(),
      currentUrl: null,
      status: "active",
    };

    const internal: InternalSession = {
      session,
      context,
      page,
      consoleMessages: [],
      networkRequests: [],
    };

    this.attachListeners(internal);
    this.sessions.set(session.sessionId, internal);

    if (options.headless === false) {
      // playwright-core launch is headless by default; option reserved for future use
    }

    return session;
  }

  async closeSession(sessionId: string): Promise<void> {
    const internal = this.sessions.get(sessionId);
    if (!internal) {
      return;
    }

    internal.session.status = "closed";
    await internal.context.close();
    this.sessions.delete(sessionId);
  }

  async navigate(sessionId: string, url: string): Promise<NavigateResult> {
    assertSafeUrl(url);
    const internal = this.getSession(sessionId);
    const response = await internal.page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    const finalUrl = internal.page.url();
    const title = await internal.page.title();

    internal.session.currentUrl = finalUrl;

    if (!response) {
      return { url: finalUrl, title };
    }

    return { url: finalUrl, title };
  }

  async snapshot(
    sessionId: string,
    options: { maxTextChars?: number } = {},
  ): Promise<SnapshotResult> {
    const maxTextChars = options.maxTextChars ?? 4_000;
    const internal = this.getSession(sessionId);
    const page = internal.page;

    const data = await page.evaluate((limit: number) => {
      const doc = (globalThis as { document?: {
        title: string;
        body: { innerText: string } | null;
        querySelectorAll: (selector: string) => ArrayLike<{
          textContent: string | null;
          tagName: string;
          href?: string;
          getAttribute: (name: string) => string | null;
        }>;
      } }).document;

      if (!doc) {
        return {
          title: "",
          text: "",
          links: [] as Array<{ text: string; href: string }>,
          headings: [] as Array<{ level: number; text: string }>,
          buttons: [] as Array<{ text: string; type: string | null }>,
          inputsCount: 0,
        };
      }

      const visibleText = doc.body?.innerText ?? "";
      const text = visibleText.length > limit ? `${visibleText.slice(0, limit)}…` : visibleText;

      const links = Array.from(doc.querySelectorAll("a[href]"))
        .slice(0, 50)
        .map((anchor) => ({
          text: (anchor.textContent ?? "").trim().slice(0, 120),
          href: anchor.href ?? anchor.getAttribute("href") ?? "",
        }));

      const headings = Array.from(doc.querySelectorAll("h1, h2, h3, h4, h5, h6"))
        .slice(0, 30)
        .map((heading) => ({
          level: Number(heading.tagName.slice(1)),
          text: (heading.textContent ?? "").trim().slice(0, 200),
        }));

      const buttons = Array.from(doc.querySelectorAll("button, [role='button']"))
        .slice(0, 30)
        .map((button) => ({
          text: (button.textContent ?? "").trim().slice(0, 120),
          type: button.getAttribute("type"),
        }));

      const inputsCount = doc.querySelectorAll("input, textarea, select").length;

      return {
        title: doc.title,
        text,
        links,
        headings,
        buttons,
        inputsCount,
      };
    }, maxTextChars);

    return {
      url: page.url(),
      title: data.title,
      text: data.text,
      links: data.links.map((link) => ({
        text: link.text,
        href: redactUrl(link.href),
      })),
      headings: data.headings,
      buttons: data.buttons,
      inputsCount: data.inputsCount,
      timestamp: new Date().toISOString(),
    };
  }

  async screenshot(
    sessionId: string,
    options: ScreenshotOptions = {},
  ): Promise<ScreenshotResult> {
    const internal = this.getSession(sessionId);
    const type = options.type ?? "png";
    const buffer = await internal.page.screenshot({
      fullPage: options.fullPage ?? false,
      type,
    });

    return {
      base64: buffer.toString("base64"),
      mimeType: type === "jpeg" ? "image/jpeg" : "image/png",
    };
  }

  async getConsoleMessages(sessionId: string): Promise<ConsoleMessage[]> {
    const internal = this.getSession(sessionId);
    return [...internal.consoleMessages];
  }

  async getNetworkRequests(sessionId: string): Promise<NetworkRequest[]> {
    const internal = this.getSession(sessionId);
    return [...internal.networkRequests];
  }

  async dispose(): Promise<void> {
    for (const sessionId of [...this.sessions.keys()]) {
      await this.closeSession(sessionId);
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}