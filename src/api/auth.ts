import type { IncomingMessage } from "node:http";
import type { ApiConfig } from "./types.js";
import { ApiRouteError } from "./errors.js";

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

export function requireAuth(req: IncomingMessage, config: ApiConfig): void {
  if (config.authDisabled) {
    return;
  }

  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    throw new ApiRouteError(
      "auth_missing",
      "Authorization header with Bearer token is required.",
      401,
    );
  }

  if (!config.talocodeApiKey) {
    throw new ApiRouteError(
      "auth_not_configured",
      "Server API key is not configured.",
      503,
    );
  }

  if (token !== config.talocodeApiKey) {
    throw new ApiRouteError("auth_invalid", "Invalid API key.", 401);
  }
}

export function getConfigStatus(config: ApiConfig): {
  talocodeApiKey: "present" | "missing";
  stacklane: {
    baseUrl: "present" | "missing";
    apiKey: "present" | "missing";
  };
  authDisabled: boolean;
} {
  return {
    talocodeApiKey: config.talocodeApiKey ? "present" : "missing",
    stacklane: {
      baseUrl: config.stacklaneBaseUrl ? "present" : "missing",
      apiKey: config.stacklaneApiKey ? "present" : "missing",
    },
    authDisabled: config.authDisabled,
  };
}