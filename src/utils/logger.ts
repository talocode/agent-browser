export type LogLevel = "info" | "warn" | "error" | "debug";

export function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (process.env.AGENT_BROWSER_QUIET === "1") {
    return;
  }

  const entry = {
    level,
    message,
    ...(meta ? { meta } : {}),
  };

  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.error(line);
  }
}