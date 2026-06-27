import { createServer, type Server } from "node:http";
import { loadApiConfig } from "./config.js";
import { createDefaultProvider, dispatchRoute } from "./routes.js";
import type { ApiConfig, ApiServerOptions } from "./types.js";

export interface StartedApiServer {
  server: Server;
  config: ApiConfig;
  close: () => Promise<void>;
}

export function createApiServer(options: ApiServerOptions = {}): StartedApiServer {
  const config = loadApiConfig(options.config);
  const createProvider = options.createProvider ?? createDefaultProvider;
  const storageRoot = options.storageRoot;

  const server = createServer((req, res) => {
    void dispatchRoute(req, res, { config, createProvider, storageRoot });
  });

  return {
    server,
    config,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

export async function startApiServer(options: ApiServerOptions = {}): Promise<StartedApiServer> {
  const started = createApiServer(options);
  const { host, port } = started.config;

  await new Promise<void>((resolve, reject) => {
    started.server.once("error", reject);
    started.server.listen(port, host, () => resolve());
  });

  return started;
}

export function formatStartupMessage(config: ApiConfig): string {
  const lines = [
    `Agent Browser Hosted API v0.1 listening on http://${config.host}:${config.port}`,
    `Mode: ${config.mode}`,
    `Auth: ${config.authDisabled ? "disabled (development only)" : "Bearer TALOCODE_API_KEY required"}`,
  ];

  if (config.authDisabled) {
    lines.push("WARNING: API authentication is disabled. Do not use in production.");
  }

  return lines.join("\n");
}