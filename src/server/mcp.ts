import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PlaywrightBrowserProvider } from "../browser/playwright-provider.js";
import { UnsafeUrlError } from "../browser/safety.js";
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
] as const;

const MAX_BASE64_SCREENSHOT_BYTES = 512 * 1024;

function toolError(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error: message }) }],
    isError: true,
  };
}

export async function startMcpServer(): Promise<void> {
  const provider = new PlaywrightBrowserProvider();
  const server = new McpServer({
    name: "agent-browser",
    version: "0.1.0",
  });

  server.tool(
    "browser_navigate",
    "Navigate to a URL and return page metadata",
    { url: z.string().url() },
    async ({ url }) => {
      try {
        const result = await navigateToUrl(provider, url);
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: true, result }) }],
        };
      } catch (error) {
        const message = error instanceof UnsafeUrlError ? error.message : error instanceof Error ? error.message : "Navigation failed";
        return toolError(message);
      }
    },
  );

  server.tool(
    "browser_snapshot",
    "Capture a lightweight page snapshot",
    {
      url: z.string().url(),
      maxTextChars: z.number().int().positive().optional(),
    },
    async ({ url, maxTextChars }) => {
      try {
        const result = await snapshotUrl(provider, url, { maxTextChars });
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: true, result }) }],
        };
      } catch (error) {
        const message = error instanceof UnsafeUrlError ? error.message : error instanceof Error ? error.message : "Snapshot failed";
        return toolError(message);
      }
    },
  );

  server.tool(
    "browser_screenshot",
    "Capture a screenshot. Returns base64 only when the image is small enough.",
    {
      url: z.string().url(),
      fullPage: z.boolean().optional(),
    },
    async ({ url, fullPage }) => {
      try {
        const result = await screenshotUrl(provider, url, { fullPage });
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
                      message: "Screenshot too large for inline base64 response",
                      sizeBytes,
                    },
                  }),
                },
              ],
            };
          }
        }

        return {
          content: [{ type: "text", text: JSON.stringify({ ok: true, result }) }],
        };
      } catch (error) {
        const message = error instanceof UnsafeUrlError ? error.message : error instanceof Error ? error.message : "Screenshot failed";
        return toolError(message);
      }
    },
  );

  server.tool(
    "browser_console",
    "Collect console messages during navigation",
    { url: z.string().url() },
    async ({ url }) => {
      try {
        const result = await consoleForUrl(provider, url);
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: true, result }) }],
        };
      } catch (error) {
        const message = error instanceof UnsafeUrlError ? error.message : error instanceof Error ? error.message : "Console capture failed";
        return toolError(message);
      }
    },
  );

  server.tool(
    "browser_network",
    "Collect network requests during navigation",
    { url: z.string().url() },
    async ({ url }) => {
      try {
        const result = await networkForUrl(provider, url);
        return {
          content: [{ type: "text", text: JSON.stringify({ ok: true, result }) }],
        };
      } catch (error) {
        const message = error instanceof UnsafeUrlError ? error.message : error instanceof Error ? error.message : "Network capture failed";
        return toolError(message);
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
    },
    async ({ url, screenshotOut, vision, force }) => {
      try {
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
        const message =
          error instanceof UnsafeUrlError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Smoke check failed";
        return toolError(message);
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