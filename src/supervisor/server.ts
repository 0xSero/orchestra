import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { ensureRuntime, shutdownAllWorkers } from "../core/runtime";
import { workerPool } from "../core/worker-pool";
import { spawnWorker, stopWorker } from "../workers/spawner";
import type { WorkerProfile } from "../types";

type EnsureBody = {
  profile?: WorkerProfile;
  options?: {
    basePort?: number;
    timeout?: number;
    directory?: string;
  };
};

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON: ${(err as Error).message}`);
  }
}

function isAlive(pid: number | undefined): boolean {
  if (!pid || !Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function reapDead(): Promise<void> {
  const workers = workerPool.list();
  for (const w of workers) {
    if (!isAlive(w.pid)) {
      await stopWorker(w.profile.id).catch(() => {});
      workerPool.unregister(w.profile.id);
    }
  }
}

export async function startSupervisor(options: { port: number; host?: string }) {
  process.env.OPENCODE_SUPERVISOR_MODE = "1";
  await ensureRuntime();

  const server = createServer(async (req, res) => {
    if (!req.url) {
      json(res, 404, { error: "missing url" });
      return;
    }
    const url = new URL(req.url, "http://localhost");
    const { pathname } = url;

    try {
      if (req.method === "GET" && pathname === "/health") {
        json(res, 200, { ok: true, workers: workerPool.workers.size });
        return;
      }

      if (req.method === "GET" && pathname === "/workers") {
        await reapDead();
        json(res, 200, { workers: workerPool.toJSON() });
        return;
      }

      if (req.method === "POST" && pathname === "/workers/ensure") {
        const body = (await readJson(req)) as EnsureBody;
        const basePort = body.options?.basePort;
        const timeout = body.options?.timeout;
        if (
          !body.profile ||
          !body.options?.directory ||
          !Number.isFinite(basePort) ||
          typeof basePort !== "number" ||
          basePort < 0 ||
          !Number.isFinite(timeout)
        ) {
          json(res, 400, { error: "profile, basePort, timeout, directory required" });
          return;
        }

        const existing = workerPool.get(body.profile.id);
        if (existing && isAlive(existing.pid)) {
          json(res, 200, { port: existing.port, pid: existing.pid });
          return;
        }

        const instance = await spawnWorker(body.profile, {
          basePort,
          timeout,
          directory: body.options.directory,
          forceLocal: true,
        });
        json(res, 200, { port: instance.port, pid: instance.pid });
        return;
      }

      if (req.method === "POST" && pathname === "/workers/stop") {
        const body = await readJson(req);
        const id = String(body?.workerId ?? "");
        if (!id) {
          json(res, 400, { error: "workerId required" });
          return;
        }
        const ok = await stopWorker(id);
        json(res, ok ? 200 : 404, { ok });
        return;
      }

      if (req.method === "POST" && pathname === "/reap") {
        await reapDead();
        json(res, 200, { ok: true, workers: workerPool.toJSON() });
        return;
      }

      json(res, 404, { error: "not found" });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  });

  server.listen(options.port, options.host ?? "127.0.0.1", () => {
    // Keep the process alive and log for visibility
    console.error(
      `[supervisor] listening on ${options.host ?? "127.0.0.1"}:${options.port} (workers: ${workerPool.workers.size})`
    );
  });

  const interval = setInterval(reapDead, 15_000);
  interval.unref();

  const shutdown = async () => {
    clearInterval(interval);
    await shutdownAllWorkers().catch(() => {});
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };

  const exit = (code: number) => {
    void shutdown().finally(() => process.exit(code));
  };

  process.once("SIGINT", () => exit(0));
  process.once("SIGTERM", () => exit(0));
  process.once("beforeExit", () => void shutdown());

  // Give callers a tiny grace period before serving requests if they just spawned us.
  await sleep(150);
  return { server };
}
