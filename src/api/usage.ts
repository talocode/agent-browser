import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentBrowserDir } from "../sessions/store.js";
import type { HostedUsageAction, HostedUsageEvent } from "./types.js";

const SENSITIVE_METADATA_KEYS = new Set([
  "apikey",
  "api_key",
  "token",
  "secret",
  "password",
  "authorization",
  "talocode_api_key",
  "stacklane_api_key",
]);

export interface RecordHostedUsageInput {
  product: "agent_browser";
  action: HostedUsageAction;
  units: number;
  metadata?: Record<string, unknown>;
  storageRoot?: string;
  stacklaneBaseUrl?: string;
  stacklaneApiKey?: string;
}

function sanitizeMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!metadata) return undefined;

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const lower = key.toLowerCase();
    if (SENSITIVE_METADATA_KEYS.has(lower) || lower.includes("secret") || lower.includes("password")) {
      continue;
    }
    if (typeof value === "string" && /Bearer\s+/i.test(value)) {
      continue;
    }
    sanitized[key] = value;
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function getUsageLogPath(storageRoot?: string): string {
  return join(getAgentBrowserDir(storageRoot), "hosted-usage.json");
}

async function appendLocalUsageEvent(event: HostedUsageEvent, storageRoot?: string): Promise<void> {
  const dir = getAgentBrowserDir(storageRoot);
  await mkdir(dir, { recursive: true });
  const logPath = getUsageLogPath(storageRoot);

  let events: HostedUsageEvent[] = [];
  try {
    const raw = await readFile(logPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      events = parsed as HostedUsageEvent[];
    }
  } catch {
    events = [];
  }

  events.push(event);
  await writeFile(logPath, JSON.stringify(events, null, 2), "utf8");
}

async function forwardToStacklane(
  event: HostedUsageEvent,
  baseUrl: string,
  apiKey: string,
): Promise<void> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/usage/events`;
  const body = {
    product: event.product,
    action: event.action,
    units: event.units,
    metadata: event.metadata,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Stacklane usage forward failed with status ${response.status}`);
  }
}

export async function recordHostedUsageEvent(input: RecordHostedUsageInput): Promise<void> {
  const event: HostedUsageEvent = {
    product: input.product,
    action: input.action,
    units: input.units,
    metadata: sanitizeMetadata(input.metadata),
    timestamp: new Date().toISOString(),
  };

  await appendLocalUsageEvent(event, input.storageRoot);

  const baseUrl = input.stacklaneBaseUrl;
  const apiKey = input.stacklaneApiKey;
  if (!baseUrl || !apiKey) {
    return;
  }

  try {
    await forwardToStacklane(event, baseUrl, apiKey);
  } catch {
    // Best-effort forward; never fail the browser API request.
  }
}

export { getUsageLogPath };