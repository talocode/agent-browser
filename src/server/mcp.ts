import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PlaywrightBrowserProvider } from "../browser/playwright-provider.js";
import { UnsafeUrlError } from "../browser/safety.js";
import {
  SessionError,
  SessionManager,
  buildSessionReport,
  formatReportJson,
  formatReportMarkdown,
  getTraceSteps,
} from "../sessions/index.js";
import { consoleForUrl } from "../tools/console.js";
import { navigateToUrl } from "../tools/navigate.js";
import { networkForUrl } from "../tools/network.js";
import { screenshotUrl } from "../tools/screenshot.js";
import { snapshotUrl } from "../tools/snapshot.js";
import { handleBrowserCheck } from "./browser-check.js";

export const MCP_TOOL_NAMES = [
  "browser_navigate",
  "browser_snapshot",
  "browser_screenshot",
  "browser_console",
  "browser_network",
  "browser_check",
  "browser_session_create",
  "browser_session_list",
  "browser_session_close",
  "browser_session_trace",
  "browser_session_report",
] as const;

const MAX_BASE64_SCREENSHOT_BYTES = 512 * 1024;

function toolError(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error: message }) }],
    isError: true,
  };
}

function formatError(error: unknown): string {
  if (error instanceof UnsafeUrlError || error instanceof SessionError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Operation failed";
}

export async function startMcpServer(): Promise<void> {
  const provider = new PlaywrightBrowserProvider();
  const sessionManager = new SessionManager();
  const server = new McpServer({
    name: "agent-browser",
    version: "0.2.0",
  });

  server.tool(
    "browser_session_create",
    "Create a persistent local browser session",
    { name: z.string().optional() },
    async ({ name }) => {
      try {
        const session = await sessionManager.createSession({ name });
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: true, session }) }],
        };
      } catch (error) {
        return toolError(formatError(error));
      }
    },
  );

  server.tool("browser_session_list", "List persistent local browser sessions", {}, async () => {
    try {
      const sessions = await sessionManager.listSessions();
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true, sessions }) }],
      };
    } catch (error) {
      return toolError(formatError(error));
    }
  });

  server.tool(
    "browser_session_close",
    "Close a persistent local browser session",
    { sessionId: z.string() },
    async ({ sessionId }) => {
      try {
        const session = await sessionManager.closeSession(sessionId);
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: true, session, status: "closed" }) }],
        };
      } catch (error) {
        return toolError(formatError(error));
      }
    },
  );

  server.tool(
    "browser_session_trace",
    "Return trace steps for a session",
    { sessionId: z.string() },
    async ({ sessionId }) => {
      try {
        const session = await sessionManager.getSession(sessionId);
        if (!session) {
          return toolError(`Session not found: ${sessionId}`);
        }
        const steps = await getTraceSteps(sessionId);
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: true, session, steps }) }],
        };
      } catch (error) {
        return toolError(formatError(error));
      }
    },
  );

  server.tool(
    "browser_session_report",
    "Generate a JSON or Markdown session report",
    {
      sessionId: z.string(),
      format: z.enum(["json", "markdown"]).optional().default("json"),
    },
    async ({ sessionId, format }) => {
      try {
        const session = await sessionManager.getSession(sessionId);
        if (!session) {
          return toolError(`Session not found: ${sessionId}`);
        }
        const report = await buildSessionReport(session);
        if (format === "markdown") {
          return {
            content: [{ type: "text", text: formatReportMarkdown(report) }],
          };
        }
        return {
          content: [{ type: "text", text: formatReportJson(report) }],
        };
      } catch (error) {
        return toolError(formatError(error));
      }
    },
  );

  server.tool(
    "browser_navigate",
    "Navigate to a URL and return page metadata",
    { url: z.string().url(), sessionId: z.string().optional() },
    async ({ url, sessionId }) => {
      try {
        if (sessionId) {
          const { result } = await sessionManager.navigate(provider, sessionId, url);
          return {
            content: [{ type: "text", text: JSON.stringify({ ok: true, result, sessionId, status: "passed" }) }],
          };
        }
        const result = await navigateToUrl(provider, url);
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: true, result }) }],
        };
      } catch (error) {
        return toolError(formatError(error));
      }
    },
  );

  server.tool(
    "browser_snapshot",
    "Capture a lightweight page snapshot",
    {
      url: z.string().url().optional(),
      maxTextChars: z.number().int().positive().optional(),
      sessionId: z.string().optional(),
    },
    async ({ url, maxTextChars, sessionId }) => {
      try {
        if (sessionId) {
          const { result, step } = await sessionManager.snapshot(provider, sessionId, url, { maxTextChars });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ ok: true, result, sessionId, status: step.status }),
              },
            ],
          };
        }
        if (!url) {
          return toolError("URL is required when sessionId is not provided.");
        }
        const result = await snapshotUrl(provider, url, { maxTextChars });
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: true, result }) }],
        };
      } catch (error) {
        return toolError(formatError(error));
      }
    },
  );

  server.tool(
    "browser_screenshot",
    "Capture a screenshot. Returns base64 only when the image is small enough.",
    {
      url: z.string().url().optional(),
      fullPage: z.boolean().optional(),
      sessionId: z.string().optional(),
    },
    async ({ url, fullPage, sessionId }) => {
      try {
        let result;
        let status = "passed";
        if (sessionId) {
          const response = await sessionManager.screenshot(provider, sessionId, url, { fullPage });
          result = response.result;
          status = response.step.status;
        } else {
          if (!url) {
            return toolError("URL is required when sessionId is not provided.");
          }
          result = await screenshotUrl(provider, url, { fullPage });
        }

        if (result.base64) {
          const sizeBytes = Buffer.byteLength(result.base64, "base64");
          if (sizeBytes > MAX_BASE64_SCREENSHOT_BYTES) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    ok: true,
                    result: {
                      mimeType: result.mimeType,
                      path: result.path,
                      message: "Screenshot too large for inline base64 response",
                      sizeBytes,
                    },
                    sessionId,
                    status,
                  }),
                },
              ],
            };
          }
        }

        return {
          content: [{ type: "text", text: JSON.stringify({ ok: true, result, sessionId, status }) }],
        };
      } catch (error) {
        return toolError(formatError(error));
      }
    },
  );

  server.tool(
    "browser_console",
    "Collect console messages during navigation",
    { url: z.string().url().optional(), sessionId: z.string().optional() },
    async ({ url, sessionId }) => {
      try {
        if (sessionId) {
          const { result, step } = await sessionManager.console(provider, sessionId, url);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ ok: true, result, sessionId, status: step.status }),
              },
            ],
          };
        }
        if (!url) {
          return toolError("URL is required when sessionId is not provided.");
        }
        const result = await consoleForUrl(provider, url);
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: true, result }) }],
        };
      } catch (error) {
        return toolError(formatError(error));
      }
    },
  );

  server.tool(
    "browser_network",
    "Collect network requests during navigation",
    { url: z.string().url().optional(), sessionId: z.string().optional() },
    async ({ url, sessionId }) => {
      try {
        if (sessionId) {
          const { result, step } = await sessionManager.network(provider, sessionId, url);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ ok: true, result, sessionId, status: step.status }),
              },
            ],
          };
        }
        if (!url) {
          return toolError("URL is required when sessionId is not provided.");
        }
        const result = await networkForUrl(provider, url);
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: true, result }) }],
        };
      } catch (error) {
        return toolError(formatError(error));
      }
    },
  );

  server.tool(
    "browser_check",
    "Run a deploy-friendly smoke check against a URL",
    {
      url: z.string().url(),
      screenshotOut: z.string().optional(),
      vision: z.boolean().optional().default(false),
      json: z.boolean().optional().default(true),
      force: z.boolean().optional().default(false),
      sessionId: z.string().optional(),
    },
    async ({ url, screenshotOut, vision, force, sessionId }) => {
      try {
        if (sessionId) {
          const { result, step } = await sessionManager.check(provider, sessionId, url, {
            screenshotOut,
            vision,
            force,
          });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ ok: true, result, sessionId, status: step.status }),
              },
            ],
          };
        }

        const response = await handleBrowserCheck(provider, {
          url,
          screenshotOut,
          vision,
          json: true,
          force,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(response) }],
        };
      } catch (error) {
        return toolError(formatError(error));
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = async () => {
    await provider.dispose();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}