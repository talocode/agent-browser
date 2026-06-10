import { Command } from "commander";
import { PlaywrightBrowserProvider } from "./browser/playwright-provider.js";
import { UnsafeUrlError } from "./browser/safety.js";
import { consoleForUrl } from "./tools/console.js";
import { navigateToUrl } from "./tools/navigate.js";
import { networkForUrl } from "./tools/network.js";
import { screenshotUrl } from "./tools/screenshot.js";
import { snapshotUrl } from "./tools/snapshot.js";
import {
  formatVisionDiffHuman,
  formatVisionInspectHuman,
  visionDiff,
  visionInspect,
} from "./vision/python-bridge.js";

interface OutputOptions {
  json?: boolean;
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

program
  .command("navigate")
  .argument("<url>", "URL to open")
  .description("Navigate to a URL and return page metadata")
  .action(async (url: string) => {
    const options = program.opts<OutputOptions>();
    await withProvider((provider) => navigateToUrl(provider, url), options);
  });

program
  .command("snapshot")
  .argument("<url>", "URL to inspect")
  .option("--max-text-chars <n>", "Maximum visible text characters", "4000")
  .description("Capture a lightweight page snapshot")
  .action(async (url: string, cmd: { maxTextChars: string }) => {
    const options = program.opts<OutputOptions>();
    await withProvider(
      (provider) =>
        snapshotUrl(provider, url, {
          maxTextChars: Number(cmd.maxTextChars),
        }),
      options,
    );
  });

program
  .command("screenshot")
  .argument("<url>", "URL to capture")
  .option("--out <path>", "Write screenshot to file")
  .option("--force", "Overwrite existing output file")
  .option("--full-page", "Capture the full scrollable page")
  .description("Capture a screenshot of a page")
  .action(async (url: string, cmd: { out?: string; force?: boolean; fullPage?: boolean }) => {
    const options = program.opts<OutputOptions>();
    await withProvider(
      (provider) =>
        screenshotUrl(provider, url, {
          out: cmd.out,
          force: cmd.force,
          fullPage: cmd.fullPage,
        }),
      options,
    );
  });

program
  .command("console")
  .argument("<url>", "URL to inspect")
  .description("Collect console messages during navigation")
  .action(async (url: string) => {
    const options = program.opts<OutputOptions>();
    await withProvider((provider) => consoleForUrl(provider, url), options);
  });

program
  .command("network")
  .argument("<url>", "URL to inspect")
  .description("Collect network requests during navigation")
  .action(async (url: string) => {
    const options = program.opts<OutputOptions>();
    await withProvider((provider) => networkForUrl(provider, url), options);
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