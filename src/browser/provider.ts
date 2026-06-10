import type { BrowserSession, StartSessionOptions } from "./session.js";

export interface NavigateResult {
  url: string;
  title: string;
}

export interface SnapshotLink {
  text: string;
  href: string;
}

export interface SnapshotHeading {
  level: number;
  text: string;
}

export interface SnapshotButton {
  text: string;
  type: string | null;
}

export interface SnapshotResult {
  url: string;
  title: string;
  text: string;
  links: SnapshotLink[];
  headings: SnapshotHeading[];
  buttons: SnapshotButton[];
  inputsCount: number;
  timestamp: string;
}

export interface ScreenshotOptions {
  fullPage?: boolean;
  type?: "png" | "jpeg";
}

export interface ScreenshotResult {
  path?: string;
  base64?: string;
  mimeType: string;
}

export interface ConsoleMessage {
  type: string;
  text: string;
  timestamp: string;
}

export interface NetworkRequest {
  method: string;
  url: string;
  status: number | null;
  resourceType: string;
  timestamp: string;
}

export interface BrowserProvider {
  startSession(options?: StartSessionOptions): Promise<BrowserSession>;
  closeSession(sessionId: string): Promise<void>;
  navigate(sessionId: string, url: string): Promise<NavigateResult>;
  snapshot(sessionId: string, options?: { maxTextChars?: number }): Promise<SnapshotResult>;
  screenshot(sessionId: string, options?: ScreenshotOptions): Promise<ScreenshotResult>;
  getConsoleMessages(sessionId: string): Promise<ConsoleMessage[]>;
  getNetworkRequests(sessionId: string): Promise<NetworkRequest[]>;
}