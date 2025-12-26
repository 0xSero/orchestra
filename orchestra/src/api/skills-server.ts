import { createServer, type Server } from "node:http";
import type { Factory, ServiceLifecycle } from "../types";
import type { SkillsService } from "../skills/service";
import type { WorkerManager } from "../workers";
import { createSkillsRouter } from "./skills-router";

export type SkillsApiConfig = {
  enabled?: boolean;
  host?: string;
  port?: number;
};

export type SkillsApiDeps = {
  skills: SkillsService;
  workers?: WorkerManager;
};

export type SkillsApiServer = ServiceLifecycle & {
  url?: string;
};

export const createSkillsApiServer: Factory<SkillsApiConfig, SkillsApiDeps, SkillsApiServer> = ({
  config,
  deps,
}) => {
  let server: Server | undefined;
  let url: string | undefined;

  const enabled = config.enabled !== false;
  const host = config.host ?? "127.0.0.1";
  const port =
    config.port ??
    Number(process.env.OPENCODE_SKILLS_PORT ?? process.env.OPENCODE_SKILLS_API_PORT ?? 4097);

  const start = async () => {
    if (!enabled || server) return;
    const handler = createSkillsRouter({ skills: deps.skills, workers: deps.workers });
    server = createServer((req, res) => {
      void handler(req, res);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        server!.once("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "EADDRINUSE") {
            console.log(`[SkillsAPI] Port ${port} in use, trying port 0 for auto-assign`);
            server!.listen(0, host, () => resolve());
          } else {
            reject(err);
          }
        });
        server!.listen(port, host, () => resolve());
      });
    } catch (err) {
      console.log(`[SkillsAPI] Failed to start server (non-fatal):`, err);
      server = undefined;
      return;
    }

    const address = server.address();
    if (address && typeof address === "object") {
      url = `http://${address.address}:${address.port}`;
    } else {
      url = `http://${host}:${port}`;
    }
    console.log(`[SkillsAPI] Server started at ${url}`);
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
