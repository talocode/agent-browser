export type SessionStatus = "active" | "closed";

export interface BrowserSession {
  sessionId: string;
  createdAt: string;
  currentUrl: string | null;
  status: SessionStatus;
}

export interface StartSessionOptions {
  headless?: boolean;
}