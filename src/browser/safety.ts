const BLOCKED_PROTOCOLS = new Set([
  "file:",
  "data:",
  "javascript:",
  "chrome:",
  "about:",
]);

const SENSITIVE_QUERY_KEYS = [
  "token",
  "key",
  "secret",
  "password",
  "api_key",
  "apikey",
  "access_token",
  "auth",
  "authorization",
];

export interface UrlSafetyOptions {
  allowLocalhost?: boolean;
}

export class UnsafeUrlError extends Error {
  readonly code = "unsafe_url";

  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

function allowLocalhostFromEnv(): boolean {
  return process.env.AGENT_BROWSER_ALLOW_LOCALHOST === "1";
}

function isIpv4(hostname: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

function parseIpv4(hostname: string): number[] | null {
  if (!isIpv4(hostname)) {
    return null;
  }
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts;
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = parseIpv4(hostname);
  if (!parts) {
    return false;
  }

  const [a, b] = parts;

  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;

  return false;
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  if (normalized === "::1") return true;
  if (normalized === "0:0:0:0:0:0:0:1") return true;

  const withoutBrackets = normalized.replace(/^\[|\]$/g, "");

  if (withoutBrackets.startsWith("fc") || withoutBrackets.startsWith("fd")) {
    return true;
  }

  if (
    withoutBrackets.startsWith("fe8") ||
    withoutBrackets.startsWith("fe9") ||
    withoutBrackets.startsWith("fea") ||
    withoutBrackets.startsWith("feb")
  ) {
    return true;
  }

  return false;
}

function isLocalhostHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized.endsWith(".localhost");
}

export function assertSafeUrl(rawUrl: string, options: UrlSafetyOptions = {}): URL {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError(`Invalid URL: ${rawUrl}`);
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    throw new UnsafeUrlError(`Blocked protocol: ${protocol}`);
  }

  if (BLOCKED_PROTOCOLS.has(protocol)) {
    throw new UnsafeUrlError(`Blocked protocol: ${protocol}`);
  }

  const allowLocalhost = options.allowLocalhost ?? allowLocalhostFromEnv();
  const hostname = parsed.hostname.toLowerCase();

  if (!allowLocalhost) {
    if (isLocalhostHostname(hostname)) {
      throw new UnsafeUrlError("Localhost is disabled by default. Set AGENT_BROWSER_ALLOW_LOCALHOST=1 for local development.");
    }

    if (isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) {
      throw new UnsafeUrlError(`Private or loopback address is not allowed: ${hostname}`);
    }
  } else {
    const isAllowedLocal =
      isLocalhostHostname(hostname) ||
      hostname === "127.0.0.1" ||
      hostname === "::1";

    if (!isAllowedLocal && (isPrivateIpv4(hostname) || isPrivateIpv6(hostname))) {
      throw new UnsafeUrlError(`Private network address is not allowed: ${hostname}`);
    }
  }

  return parsed;
}

export function redactUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

  for (const key of [...parsed.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (SENSITIVE_QUERY_KEYS.some((sensitive) => lower.includes(sensitive))) {
      parsed.searchParams.set(key, "[REDACTED]");
    }
  }

  return parsed.toString();
}

export function redactSensitiveText(text: string): string {
  return text
    .replace(/(token|key|secret|password|authorization)=([^&\s]+)/gi, "$1=[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]");
}