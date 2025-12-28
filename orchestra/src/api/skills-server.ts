import { createServer as createHttpServer, type Server } from "node:http";
import type { DatabaseService } from "../db";
import type { SkillsService } from "../skills/service";
import type { Factory, ServiceLifecycle } from "../types";
import type { WorkerManager } from "../workers";
import { createDbRouter } from "./db-router";
import { createSessionsRouter } from "./sessions-router";
import { createSkillsRouter } from "./skills-router";
import { createSystemRouter } from "./system-router";

export type SkillsApiConfig = {
  enabled?: boolean;
  host?: string;
  port?: number;
};

export type SkillsApiDeps = {
  skills: SkillsService;
  workers?: WorkerManager;
  db?: DatabaseService;
  onWorkerConfigChanged?: (workerId?: string) => void;
  onPreferencesChanged?: (key?: string) => void;
  createServer?: typeof createHttpServer;
};

export type SkillsApiServer = ServiceLifecycle & {
  url?: string;
};

export const createSkillsApiServer: Factory<SkillsApiConfig, SkillsApiDeps, SkillsApiServer> = ({ config, deps }) => {
  let server: Server | undefined;
  let url: string | undefined;

  const enabled = config.enabled !== false;
  const host = config.host ?? "127.0.0.1";
  const port = config.port ?? Number(process.env.OPENCODE_SKILLS_PORT ?? process.env.OPENCODE_SKILLS_API_PORT ?? 4097);

  const start = async () => {
    if (!enabled || server) return;

    // Create routers
    const skillsHandler = createSkillsRouter({ skills: deps.skills, workers: deps.workers });
    const dbHandler = deps.db
      ? createDbRouter({
          db: deps.db,
          onWorkerConfigChanged: deps.onWorkerConfigChanged,
          onPreferencesChanged: deps.onPreferencesChanged,
        })
      : null;

    // Sessions router needs workers with session manager
    const sessionsHandler = deps.workers
      ? createSessionsRouter({
          sessionManager: deps.workers.sessionManager,
          workers: deps.workers,
        })
      : null;

    // System router for process management
    const systemHandler = createSystemRouter();

    const createServer = deps.createServer ?? createHttpServer;
    server = createServer((req, res) => {
      const url = req.url ?? "";

      // Route to system API
      if (url.startsWith("/api/system")) {
        void systemHandler(req, res);
        return;
      }

      // Route to DB API
      if (url.startsWith("/api/db")) {
        if (dbHandler) {
          void dbHandler(req, res);
        } else {
          res.statusCode = 501;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "DB API not available" }));
        }
        return;
      }

      // Route to sessions API
      if (url.startsWith("/api/sessions")) {
        if (sessionsHandler) {
          void sessionsHandler(req, res);
        } else {
          res.statusCode = 501;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Sessions API not available" }));
        }
        return;
      }

      // Route to skills API
      void skillsHandler(req, res);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        server!.once("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "EADDRINUSE") {
            // Port in use, try auto-assign
            server!.listen(0, host, () => resolve());
          } else {
            reject(err);
          }
        });
        server!.listen(port, host, () => resolve());
      });
    } catch {
      // Failed to start server (non-fatal)
      server = undefined;
      return;
    }

    const address = server.address();
    url =
      address && typeof address === "object" ? `http://${address.address}:${address.port}` : `http://${host}:${port}`;
  };

  const stop = async () => {
    if (!server) return;
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  };

  return {
    get url() {
      return url;
    },
    start,
    stop,
    health: async () => ({ ok: true }),
  };
};
