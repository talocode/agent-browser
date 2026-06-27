import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { PlaywrightBrowserProvider } from "../browser/playwright-provider.js";
import {
  SessionManager,
  buildSessionReport,
  formatReportMarkdown,
  getTraceSteps,
} from "../sessions/index.js";
import { runSmokeCheck } from "../tools/check.js";
import { screenshotUrl } from "../tools/screenshot.js";
import { requireAuth, getConfigStatus } from "./auth.js";
import { ApiRouteError, jsonResponse, sendError, sendRouteError, sendSuccess } from "./errors.js";
import { recordHostedUsageEvent } from "./usage.js";
import type { RouteContext } from "./types.js";

const checkBodySchema = z.object({
  url: z.string().min(1),
  screenshot: z.boolean().optional(),
  vision: z.boolean().optional(),
  sessionId: z.string().uuid().optional(),
});

const screenshotBodySchema = z.object({
  url: z.string().min(1),
  sessionId: z.string().uuid().optional(),
});

const sessionCreateBodySchema = z.object({
  name: z.string().optional(),
});

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    throw new ApiRouteError("invalid_body", "Request body is required.", 400);
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ApiRouteError("invalid_json", "Request body must be valid JSON.", 400);
  }
}

async function withProvider<T>(
  createProvider: () => ReturnType<RouteContext["createProvider"]>,
  fn: (provider: ReturnType<RouteContext["createProvider"]>) => Promise<T>,
): Promise<T> {
  const provider = createProvider();
  const disposable = provider as { dispose?: () => Promise<void> };
  try {
    return await fn(provider);
  } finally {
    if (typeof disposable.dispose === "function") {
      await disposable.dispose();
    }
  }
}

async function recordUsage(
  ctx: RouteContext,
  action: Parameters<typeof recordHostedUsageEvent>[0]["action"],
  metadata?: Record<string, unknown>,
): Promise<void> {
  await recordHostedUsageEvent({
    product: "agent_browser",
    action,
    units: 1,
    metadata,
    storageRoot: ctx.storageRoot,
    stacklaneBaseUrl: ctx.config.stacklaneBaseUrl,
    stacklaneApiKey: ctx.config.stacklaneApiKey,
  });
}

function sanitizeCheckResultForApi<T extends { screenshot: { path: string | null } }>(result: T, tempDir: string | null): T {
  if (!tempDir || !result.screenshot.path?.startsWith(tempDir)) {
    return result;
  }
  return {
    ...result,
    screenshot: {
      ...result.screenshot,
      path: null,
    },
  };
}

export async function handleHealth(ctx: RouteContext, res: ServerResponse): Promise<void> {
  jsonResponse(res, 200, {
    ok: true,
    version: ctx.config.version,
    mode: ctx.config.mode,
  });
}

export async function handleConfigStatus(
  req: IncomingMessage,
  ctx: RouteContext,
  res: ServerResponse,
): Promise<void> {
  requireAuth(req, ctx.config);
  jsonResponse(res, 200, { ok: true, ...getConfigStatus(ctx.config) });
}

export async function handleBrowserCheck(
  req: IncomingMessage,
  ctx: RouteContext,
  res: ServerResponse,
): Promise<void> {
  requireAuth(req, ctx.config);
  const body = checkBodySchema.parse(await readJsonBody(req));

  await withProvider(ctx.createProvider, async (provider) => {
    let tempDir: string | null = null;
    let screenshotOut: string | undefined;

    if (body.screenshot || body.vision) {
      tempDir = await mkdtemp(join(tmpdir(), "agent-browser-api-check-"));
      screenshotOut = join(tempDir, "screenshot.png");
    }

    try {
      if (body.sessionId) {
        const manager = new SessionManager(ctx.storageRoot);
        const { result, step } = await manager.check(provider, body.sessionId, body.url, {
          screenshotOut,
          force: true,
          vision: body.vision,
        });

        await recordUsage(ctx, "agent_browser.check", {
          url: result.url,
          status: result.status,
          sessionId: body.sessionId,
        });

        sendSuccess(res, {
          result: sanitizeCheckResultForApi(result, tempDir),
          sessionId: body.sessionId,
          traceStepId: step.id,
        });
        return;
      }

      const result = await runSmokeCheck(provider, body.url, {
        screenshotOut,
        force: true,
        vision: body.vision,
      });

      await recordUsage(ctx, "agent_browser.check", {
        url: result.url,
        status: result.status,
      });

      sendSuccess(res, { result: sanitizeCheckResultForApi(result, tempDir) });
    } finally {
      if (tempDir) {
        await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  });
}

export async function handleBrowserScreenshot(
  req: IncomingMessage,
  ctx: RouteContext,
  res: ServerResponse,
): Promise<void> {
  requireAuth(req, ctx.config);
  const body = screenshotBodySchema.parse(await readJsonBody(req));

  await withProvider(ctx.createProvider, async (provider) => {
    if (body.sessionId) {
      const manager = new SessionManager(ctx.storageRoot);
      const { result, step } = await manager.screenshot(provider, body.sessionId, body.url);

      await recordUsage(ctx, "agent_browser.screenshot", {
        url: body.url,
        sessionId: body.sessionId,
      });

      sendSuccess(res, {
        result,
        sessionId: body.sessionId,
        traceStepId: step.id,
      });
      return;
    }

    const result = await screenshotUrl(provider, body.url);

    await recordUsage(ctx, "agent_browser.screenshot", { url: body.url });

    sendSuccess(res, { result });
  });
}

export async function handleSessionCreate(
  req: IncomingMessage,
  ctx: RouteContext,
  res: ServerResponse,
): Promise<void> {
  requireAuth(req, ctx.config);
  const body = sessionCreateBodySchema.parse(await readJsonBody(req));
  const manager = new SessionManager(ctx.storageRoot);
  const session = await manager.createSession({ name: body.name });

  await recordUsage(ctx, "agent_browser.session.create", {
    sessionId: session.id,
    name: body.name,
  });

  sendSuccess(res, { session }, 201);
}

export async function handleSessionGet(
  req: IncomingMessage,
  ctx: RouteContext,
  res: ServerResponse,
  sessionId: string,
): Promise<void> {
  requireAuth(req, ctx.config);
  const manager = new SessionManager(ctx.storageRoot);
  const session = await manager.getSession(sessionId);

  if (!session) {
    sendError(res, "session_not_found", `Session not found: ${sessionId}`, 404);
    return;
  }

  const steps = await getTraceSteps(sessionId, ctx.storageRoot);
  sendSuccess(res, { session, steps });
}

export async function handleSessionReport(
  req: IncomingMessage,
  ctx: RouteContext,
  res: ServerResponse,
  sessionId: string,
  query: URLSearchParams,
): Promise<void> {
  requireAuth(req, ctx.config);
  const formatParam = query.get("format") ?? "json";
  if (formatParam !== "json" && formatParam !== "markdown") {
    sendError(res, "invalid_format", "format must be json or markdown", 400);
    return;
  }

  const manager = new SessionManager(ctx.storageRoot);
  const session = await manager.getSession(sessionId);
  if (!session) {
    sendError(res, "session_not_found", `Session not found: ${sessionId}`, 404);
    return;
  }

  const report = await buildSessionReport(session, ctx.storageRoot);

  await recordUsage(ctx, "agent_browser.session.report", {
    sessionId,
    format: formatParam,
  });

  if (formatParam === "markdown") {
    sendSuccess(res, {
      report,
      format: "markdown",
      markdown: formatReportMarkdown(report),
    });
    return;
  }

  sendSuccess(res, {
    report,
    format: "json",
    markdown: undefined,
  });
}

export async function handleSessionClose(
  req: IncomingMessage,
  ctx: RouteContext,
  res: ServerResponse,
  sessionId: string,
): Promise<void> {
  requireAuth(req, ctx.config);
  const manager = new SessionManager(ctx.storageRoot);
  const session = await manager.closeSession(sessionId);

  await recordUsage(ctx, "agent_browser.session.close", { sessionId });

  sendSuccess(res, { session });
}

export function createDefaultProvider(): PlaywrightBrowserProvider {
  return new PlaywrightBrowserProvider();
}

export async function dispatchRoute(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const path = url.pathname;
  const method = req.method ?? "GET";

  try {
    if (method === "GET" && path === "/v1/health") {
      await handleHealth(ctx, res);
      return;
    }

    if (method === "GET" && path === "/v1/config/status") {
      await handleConfigStatus(req, ctx, res);
      return;
    }

    if (method === "POST" && path === "/v1/browser/check") {
      await handleBrowserCheck(req, ctx, res);
      return;
    }

    if (method === "POST" && path === "/v1/browser/screenshot") {
      await handleBrowserScreenshot(req, ctx, res);
      return;
    }

    if (method === "POST" && path === "/v1/browser/session") {
      await handleSessionCreate(req, ctx, res);
      return;
    }

    const sessionMatch = path.match(/^\/v1\/browser\/session\/([^/]+)$/);
    if (sessionMatch && method === "GET") {
      await handleSessionGet(req, ctx, res, sessionMatch[1]);
      return;
    }

    const reportMatch = path.match(/^\/v1\/browser\/session\/([^/]+)\/report$/);
    if (reportMatch && method === "GET") {
      await handleSessionReport(req, ctx, res, reportMatch[1], url.searchParams);
      return;
    }

    const closeMatch = path.match(/^\/v1\/browser\/session\/([^/]+)\/close$/);
    if (closeMatch && method === "POST") {
      await handleSessionClose(req, ctx, res, closeMatch[1]);
      return;
    }

    sendError(res, "not_found", `Route not found: ${method} ${path}`, 404);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.issues[0]?.message ?? "Invalid request body.";
      sendError(res, "validation_error", message, 400);
      return;
    }
    sendRouteError(res, error);
  }
}