import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ApiConfig } from "./types.js";

function readPackageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(here, "..", "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed < 65536 ? parsed : fallback;
}

function isDevOrTestMode(mode: string): boolean {
  const nodeEnv = process.env.NODE_ENV ?? "";
  return (
    nodeEnv === "test" ||
    nodeEnv === "development" ||
    mode === "local"
  );
}

export function loadApiConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  const mode = (process.env.AGENT_BROWSER_API_MODE === "production" ? "production" : "local") as ApiConfig["mode"];
  const authDisabledRequested = process.env.AGENT_BROWSER_API_AUTH_DISABLED === "1";

  return {
    host: overrides.host ?? process.env.AGENT_BROWSER_API_HOST ?? "127.0.0.1",
    port: overrides.port ?? parsePort(process.env.AGENT_BROWSER_API_PORT, 7340),
    mode: overrides.mode ?? mode,
    talocodeApiKey: overrides.talocodeApiKey ?? process.env.TALOCODE_API_KEY,
    authDisabled:
      overrides.authDisabled ??
      (authDisabledRequested && isDevOrTestMode(overrides.mode ?? mode)),
    stacklaneBaseUrl: overrides.stacklaneBaseUrl ?? process.env.TALOCODE_BASE_URL ?? process.env.STACKLANE_BASE_URL,
    stacklaneApiKey: overrides.stacklaneApiKey ?? process.env.STACKLANE_API_KEY,
    version: overrides.version ?? readPackageVersion(),
  };
}