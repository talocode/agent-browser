import type { ServerResponse } from "node:http";
import type { ApiErrorResponse } from "./types.js";

export class ApiRouteError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "ApiRouteError";
    this.code = code;
    this.status = status;
  }
}

export function jsonResponse(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(payload));
  res.end(payload);
}

export function sendSuccess<T>(res: ServerResponse, data: T, status = 200): void {
  jsonResponse(res, status, { ok: true, data });
}

export function sendError(
  res: ServerResponse,
  code: string,
  message: string,
  status = 400,
): void {
  const body: ApiErrorResponse = {
    ok: false,
    error: { code, message },
  };
  jsonResponse(res, status, body);
}

export function sendRouteError(res: ServerResponse, error: unknown): void {
  if (error instanceof ApiRouteError) {
    sendError(res, error.code, error.message, error.status);
    return;
  }

  if (error instanceof Error && error.name === "UnsafeUrlError") {
    sendError(res, "unsafe_url", error.message, 400);
    return;
  }

  if (error instanceof Error && error.name === "SessionError") {
    const sessionError = error as Error & { code?: string };
    sendError(res, sessionError.code ?? "session_error", error.message, 404);
    return;
  }

  sendError(res, "internal_error", "An unexpected error occurred.", 500);
}