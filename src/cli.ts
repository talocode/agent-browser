import { Command } from "commander";
import { PlaywrightBrowserProvider } from "./browser/playwright-provider.js";
import { UnsafeUrlError } from "./browser/safety.js";
import {
  SessionError,
  SessionManager,
  buildSessionReport,
  formatReportJson,
  formatReportMarkdown,
  getTraceSteps,
  type ReportFormat,
} from "./sessions/index.js";
import { consoleForUrl } from "./tools/console.js";
import { navigateToUrl } from "./tools/navigate.js";
import { networkForUrl } from "./tools/network.js";
import { screenshotUrl } from "./tools/screenshot.js";
import { snapshotUrl } from "./tools/snapshot.js";
import { formatSmokeCheckHuman, runSmokeCheck } from "./tools/check.js";
import {
  formatVisionDiffHuman,
  formatVisionInspectHuman,
  visionDiff,
  visionInspect,
} from "./vision/python-bridge.js";

interface OutputOptions {
  json?: boolean;
}

interface SessionCommandOptions {
  session?: string;
}

function printOutput(data: unknown, options: OutputOptions): void {
  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (typeof data === "string") {
    console.log(data);
    return;
  }

  console.log(JSON.stringify(data, null, 2));
}

function printError(error: unknown, options: OutputOptions): never {
  const message =
    error instanceof UnsafeUrlError
      ? error.message
      : error instanceof SessionError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unknown error";

  if (options.json) {
    console.log(JSON.stringify({ ok: false, error: { code: "command_failed", message } }, null, 2));
  } else {
    console.error(`Error: ${message}`);
  }
  process.exit(1);
}

async function withProvider<T>(
  fn: (provider: PlaywrightBrowserProvider) => Promise<T>,
  options: OutputOptions,
): Promise<void> {
  const provider = new PlaywrightBrowserProvider();
  try {
    const result = await fn(provider);
    printOutput(result, options);
  } catch (error) {
    printError(error, options);
  } finally {
    await provider.dispose();
  }
}

const program = new Command();

program
  .name("agent-browser")
  .description("Safe browser automation layer for AI agents")
  .option("--json", "Output machine-readable JSON");

const sessionCmd = program
  .command("session")
  .description("Manage persistent local browser sessions and traces");

sessionCmd
  .command("create")
  .option("--name <name>", "Optional session name")
  .description("Create a new active session")
  .action(async (cmd: { name?: string }) => {
    const options = program.opts<OutputOptions>();
    try {
      const manager = new SessionManager();
      const session = await manager.createSession({ name: cmd.name });
      printOutput(options.json ? { ok: true, session } : session, options);
    } catch (error) {
      printError(error, options);
    }
  });

sessionCmd
  .command("list")
  .description("List local sessions")
  .action(async () => {
    const options = program.opts<OutputOptions>();
    try {
      const manager = new SessionManager();
      const sessions = await manager.listSessions();
      printOutput(options.json ? { ok: true, sessions } : sessions, options);
    } catch (error) {
      printError(error, options);
    }
  });

sessionCmd
  .command("close")
  .argument("<sessionId>", "Session id to close")
  .description("Close an active session")
  .action(async (sessionId: string) => {
    const options = program.opts<OutputOptions>();
    await withProvider(async () => {
      const manager = new SessionManager();
      const session = await manager.closeSession(sessionId);
      return options.json ? { ok: true, session } : session;
    }, options);
  });

sessionCmd
  .command("trace")
  .argument("<sessionId>", "Session id")
  .description("Show trace steps for a session")
  .action(async (sessionId: string) => {
    const options = program.opts<OutputOptions>();
    try {
      const manager = new SessionManager();
      const session = await manager.getSession(sessionId);
      if (!session) {
        throw new SessionError("session_not_found", `Session not found: ${sessionId}`);
      }
      const steps = await getTraceSteps(sessionId);
      printOutput(options.json ? { ok: true, session, steps } : { session, steps }, options);
    } catch (error) {
      printError(error, options);
    }
  });

sessionCmd
  .command("report")
  .argument("<sessionId>", "Session id")
  .option("--format <format>", "Report format: json or markdown", "json")
  .description("Generate a session report")
  .action(async (sessionId: string, cmd: { format: string }) => {
    const options = program.opts<OutputOptions>();
    try {
      const format = cmd.format as ReportFormat;
      if (format !== "json" && format !== "markdown") {
        throw new Error(`Unsupported report format: ${cmd.format}`);
      }
      const manager = new SessionManager();
      const session = await manager.getSession(sessionId);
      if (!session) {
        throw new SessionError("session_not_found", `Session not found: ${sessionId}`);
      }
      const report = await buildSessionReport(session);
      if (format === "markdown") {
        console.log(formatReportMarkdown(report));
        return;
      }
      if (options.json) {
        printOutput({ ok: true, report }, options);
        return;
      }
      console.log(formatReportJson(report));
    } catch (error) {
      printError(error, options);
    }
  });

program
  .command("navigate")
  .argument("<url>", "URL to open")
  .option("--session <sessionId>", "Record action in a persistent session")
  .description("Navigate to a URL and return page metadata")
  .action(async (url: string, cmd: SessionCommandOptions) => {
    const options = program.opts<OutputOptions>();
    await withProvider(async (provider) => {
      if (cmd.session) {
        const manager = new SessionManager();
        const { result } = await manager.navigate(provider, cmd.session, url);
        return options.json ? { ok: true, result, sessionId: cmd.session } : result;
      }
      return navigateToUrl(provider, url);
    }, options);
  });

program
  .command("snapshot")
  .argument("[url]", "URL to inspect (optional when --session has lastUrl)")
  .option("--max-text-chars <n>", "Maximum visible text characters", "4000")
  .option("--session <sessionId>", "Record action in a persistent session")
  .description("Capture a lightweight page snapshot")
  .action(async (url: string | undefined, cmd: { maxTextChars: string; session?: string }) => {
    const options = program.opts<OutputOptions>();
    await withProvider(async (provider) => {
      if (cmd.session) {
        const manager = new SessionManager();
        const { result } = await manager.snapshot(provider, cmd.session, url, {
          maxTextChars: Number(cmd.maxTextChars),
        });
        return options.json ? { ok: true, result, sessionId: cmd.session } : result;
      }
      if (!url) {
        throw new Error("URL is required when --session is not provided.");
      }
      return snapshotUrl(provider, url, { maxTextChars: Number(cmd.maxTextChars) });
    }, options);
  });

program
  .command("screenshot")
  .argument("[url]", "URL to capture (optional when --session has lastUrl)")
  .option("--out <path>", "Write screenshot to file")
  .option("--force", "Overwrite existing output file")
  .option("--full-page", "Capture the full scrollable page")
  .option("--session <sessionId>", "Record action in a persistent session")
  .description("Capture a screenshot of a page")
  .action(async (url: string | undefined, cmd: { out?: string; force?: boolean; fullPage?: boolean; session?: string }) => {
    const options = program.opts<OutputOptions>();
    await withProvider(async (provider) => {
      if (cmd.session) {
        const manager = new SessionManager();
        const { result } = await manager.screenshot(provider, cmd.session, url, {
          out: cmd.out,
          force: cmd.force,
          fullPage: cmd.fullPage,
        });
        return options.json ? { ok: true, result, sessionId: cmd.session } : result;
      }
      if (!url) {
        throw new Error("URL is required when --session is not provided.");
      }
      return screenshotUrl(provider, url, {
        out: cmd.out,
        force: cmd.force,
        fullPage: cmd.fullPage,
      });
    }, options);
  });

program
  .command("console")
  .argument("[url]", "URL to inspect (optional when --session has lastUrl)")
  .option("--session <sessionId>", "Record action in a persistent session")
  .description("Collect console messages during navigation")
  .action(async (url: string | undefined, cmd: SessionCommandOptions) => {
    const options = program.opts<OutputOptions>();
    await withProvider(async (provider) => {
      if (cmd.session) {
        const manager = new SessionManager();
        const { result } = await manager.console(provider, cmd.session, url);
        return options.json ? { ok: true, result, sessionId: cmd.session } : result;
      }
      if (!url) {
        throw new Error("URL is required when --session is not provided.");
      }
      return consoleForUrl(provider, url);
    }, options);
  });

program
  .command("network")
  .argument("[url]", "URL to inspect (optional when --session has lastUrl)")
  .option("--session <sessionId>", "Record action in a persistent session")
  .description("Collect network requests during navigation")
  .action(async (url: string | undefined, cmd: SessionCommandOptions) => {
    const options = program.opts<OutputOptions>();
    await withProvider(async (provider) => {
      if (cmd.session) {
        const manager = new SessionManager();
        const { result } = await manager.network(provider, cmd.session, url);
        return options.json ? { ok: true, result, sessionId: cmd.session } : result;
      }
      if (!url) {
        throw new Error("URL is required when --session is not provided.");
      }
      return networkForUrl(provider, url);
    }, options);
  });

program
  .command("check")
  .argument("<url>", "URL to smoke check")
  .option("--screenshot-out <path>", "Save screenshot to this path")
  .option("--force", "Overwrite existing screenshot output")
  .option("--vision", "Run optional vision inspect when screenshot is available")
  .option("--session <sessionId>", "Record action in a persistent session")
  .description("Run a deploy-friendly smoke check against a URL")
  .action(async (url: string, cmd: { screenshotOut?: string; force?: boolean; vision?: boolean; session?: string }) => {
    const options = program.opts<OutputOptions>();
    await withProvider(async (provider) => {
      if (cmd.session) {
        const manager = new SessionManager();
        const { result } = await manager.check(provider, cmd.session, url, {
          screenshotOut: cmd.screenshotOut,
          force: cmd.force,
          vision: cmd.vision,
        });
        if (options.json) {
          return { ok: true, result, sessionId: cmd.session };
        }
        return formatSmokeCheckHuman(result);
      }

      const result = await runSmokeCheck(provider, url, {
        screenshotOut: cmd.screenshotOut,
        force: cmd.force,
        vision: cmd.vision,
      });

      if (options.json) {
        return { ok: true, result };
      }

      return formatSmokeCheckHuman(result);
    }, options);
  });

program
  .command("api")
  .description("Start the hosted Agent Browser API server locally")
  .option("--host <host>", "Bind host", process.env.AGENT_BROWSER_API_HOST ?? "127.0.0.1")
  .option("--port <port>", "Bind port", process.env.AGENT_BROWSER_API_PORT ?? "7340")
  .action(async (cmd: { host: string; port: string }) => {
    const { startApiServer, formatStartupMessage } = await import("./api/index.js");
    const port = Number(cmd.port);
    if (!Number.isFinite(port) || port <= 0 || port >= 65536) {
      console.error("Error: --port must be a valid TCP port.");
      process.exit(1);
    }

    const started = await startApiServer({
      config: { host: cmd.host, port },
    });

    console.log(formatStartupMessage(started.config));

    const shutdown = async () => {
      await started.close();
      process.exit(0);
    };

    process.on("SIGINT", () => void shutdown());
    process.on("SIGTERM", () => void shutdown());
  });

program
  .command("mcp")
  .description("Start the MCP server over stdio")
  .action(async () => {
    const { startMcpServer } = await import("./server/mcp.js");
    await startMcpServer();
  });

const vision = program
  .command("vision")
  .description("Optional screenshot visual inspection via Python/OpenCV");

vision
  .command("inspect")
  .argument("<image>", "Path to screenshot image")
  .description("Inspect a screenshot for blank or blurry renders")
  .action(async (image: string) => {
    const options = program.opts<OutputOptions>();
    try {
      const result = await visionInspect(image, { json: options.json });
      if (options.json) {
        printOutput({ ok: true, result }, options);
        return;
      }
      console.log(formatVisionInspectHuman(result));
    } catch (error) {
      printError(error, options);
    }
  });

vision
  .command("diff")
  .argument("<before>", "Path to before screenshot")
  .argument("<after>", "Path to after screenshot")
  .option("--out <path>", "Write diff image to this path")
  .option("--force", "Overwrite existing diff image")
  .description("Compare two screenshots and optionally save a diff image")
  .action(async (before: string, after: string, cmd: { out?: string; force?: boolean }) => {
    const options = program.opts<OutputOptions>();
    try {
      const result = await visionDiff(before, after, {
        out: cmd.out,
        force: cmd.force,
        json: options.json,
      });
      if (options.json) {
        printOutput({ ok: true, result }, options);
        return;
      }
      console.log(formatVisionDiffHuman(result));
    } catch (error) {
      printError(error, options);
    }
  });

await program.parseAsync(process.argv);