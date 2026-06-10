export interface AgentBrowserError {
  code: string;
  message: string;
}

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: AgentBrowserError };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err<T>(code: string, message: string): Result<T> {
  return { ok: false, error: { code, message } };
}

export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.data;
}