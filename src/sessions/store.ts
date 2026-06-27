import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentBrowserSession, SessionStoreData, TraceStoreData } from "./types.js";

const SESSION_ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SAFE_FILENAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

export class SessionStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionStoreError";
  }
}

export function getStorageRoot(): string {
  return process.env.AGENT_BROWSER_STORAGE_ROOT ?? process.cwd();
}

export function getAgentBrowserDir(root = getStorageRoot()): string {
  return join(root, ".agent-browser");
}

export function getSessionsFilePath(root = getStorageRoot()): string {
  return join(getAgentBrowserDir(root), "sessions.json");
}

export function getTracesDir(root = getStorageRoot()): string {
  return join(getAgentBrowserDir(root), "traces");
}

export function getScreenshotsDir(root = getStorageRoot()): string {
  return join(getAgentBrowserDir(root), "screenshots");
}

export function getTraceFilePath(sessionId: string, root = getStorageRoot()): string {
  assertSafeSessionId(sessionId);
  return join(getTracesDir(root), `${sessionId}.json`);
}

export function getSessionScreenshotsDir(sessionId: string, root = getStorageRoot()): string {
  assertSafeSessionId(sessionId);
  return join(getScreenshotsDir(root), sessionId);
}

export function assertSafeSessionId(sessionId: string): void {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new SessionStoreError(`Invalid session id: ${sessionId}`);
  }
}

export function assertSafeFilename(filename: string): void {
  if (!SAFE_FILENAME_PATTERN.test(filename) || filename.includes("..")) {
    throw new SessionStoreError(`Unsafe filename: ${filename}`);
  }
}

export async function ensureStorageDirs(root = getStorageRoot()): Promise<void> {
  await mkdir(getTracesDir(root), { recursive: true });
  await mkdir(getScreenshotsDir(root), { recursive: true });
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

export async function loadSessions(root = getStorageRoot()): Promise<AgentBrowserSession[]> {
  const data = await readJsonFile<SessionStoreData>(getSessionsFilePath(root), { sessions: [] });
  return data.sessions;
}

export async function saveSessions(sessions: AgentBrowserSession[], root = getStorageRoot()): Promise<void> {
  await ensureStorageDirs(root);
  const path = getSessionsFilePath(root);
  await mkdir(getAgentBrowserDir(root), { recursive: true });
  await writeFile(path, JSON.stringify({ sessions }, null, 2), "utf8");
}

export async function loadTraceSteps(sessionId: string, root = getStorageRoot()): Promise<TraceStoreData> {
  assertSafeSessionId(sessionId);
  return readJsonFile<TraceStoreData>(getTraceFilePath(sessionId, root), { steps: [] });
}

export async function saveTraceSteps(
  sessionId: string,
  data: TraceStoreData,
  root = getStorageRoot(),
): Promise<void> {
  assertSafeSessionId(sessionId);
  await ensureStorageDirs(root);
  await writeFile(getTraceFilePath(sessionId, root), JSON.stringify(data, null, 2), "utf8");
}