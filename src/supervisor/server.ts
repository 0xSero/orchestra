import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import { ensureRuntime, shutdownAllWorkers } from "../core/runtime";
import { workerPool, type WorkerPoolEvent } from "../core/worker-pool";
import { workerJobs, type WorkerJob } from "../core/jobs";
import { listStreamChunks, streamEmitter, type StreamChunk } from "../core/stream-events";
import { spawnWorker, stopWorker } from "../workers/spawner";
import type { WorkerProfile, WorkerInstance } from "../types";

// SSE client management
type SSEClient = {
  id: string;
  res: ServerResponse;
  lastEventId: number;
};

const sseClients: Map<string, SSEClient> = new Map();
let globalEventId = 0;

function broadcastSSE(event: string, data: unknown): void {
  globalEventId++;
  const payload = `id: ${globalEventId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients.values()) {
    try {
      client.res.write(payload);
      client.lastEventId = globalEventId;
    } catch {
      // Client disconnected, will be cleaned up
    }
  }
}

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
  const streamSnapshotLimit = 200;

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
          !Number.isFinite(timeout) ||
          typeof timeout !== "number"
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

      // =========================================================================
      // SSE Event Stream
      // =========================================================================
      if (req.method === "GET" && pathname === "/sse") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Access-Control-Allow-Origin": "*",
        });

        const clientId = `sse-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const client: SSEClient = { id: clientId, res, lastEventId: globalEventId };
        sseClients.set(clientId, client);

        // Send initial connection event
        res.write(`id: ${globalEventId}\nevent: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);

        // Send current state
        const workers = workerPool.toJSON();
        const jobs = workerJobs.list({ limit: 50 });
        const streams = listStreamChunks({ limit: streamSnapshotLimit });
        res.write(`id: ${++globalEventId}\nevent: snapshot\ndata: ${JSON.stringify({ workers, jobs, streams })}\n\n`);

        // Heartbeat every 30s
        const heartbeat = setInterval(() => {
          try {
            res.write(`: heartbeat\n\n`);
          } catch {
            clearInterval(heartbeat);
            sseClients.delete(clientId);
          }
        }, 30_000);

        // Cleanup on close
        req.on("close", () => {
          clearInterval(heartbeat);
          sseClients.delete(clientId);
        });

        return;
      }

      // =========================================================================
      // Jobs Endpoint
      // =========================================================================
      if (req.method === "GET" && pathname === "/jobs") {
        const workerId = url.searchParams.get("workerId") ?? undefined;
        const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
        const jobs = workerJobs.list({ workerId, limit });
        json(res, 200, { jobs });
        return;
      }

      if (req.method === "GET" && pathname.startsWith("/jobs/")) {
        const jobId = pathname.slice("/jobs/".length);
        const job = workerJobs.get(jobId);
        if (!job) {
          json(res, 404, { error: "job not found" });
          return;
        }
        json(res, 200, { job });
        return;
      }

      // =========================================================================
      // Worker-specific endpoints
      // =========================================================================
      const workerMatch = pathname.match(/^\/workers\/([^/]+)\/(.+)$/);
      if (workerMatch) {
        const [, workerId, action] = workerMatch;
        const worker = workerPool.get(workerId);

        if (!worker) {
          json(res, 404, { error: `worker "${workerId}" not found` });
          return;
        }

        // GET /workers/:id/status
        if (req.method === "GET" && action === "status") {
          const workerData = workerPool.toJSON().find((w) => w.id === workerId);
          json(res, 200, { worker: workerData });
          return;
        }

        // GET /workers/:id/jobs
        if (req.method === "GET" && action === "jobs") {
          const limit = parseInt(url.searchParams.get("limit") ?? "20", 10);
          const jobs = workerJobs.list({ workerId, limit });
          json(res, 200, { jobs });
          return;
        }

        json(res, 404, { error: `unknown action "${action}"` });
        return;
      }

      // =========================================================================
      // Profiles Endpoint (for spawn dialog)
      // =========================================================================
      if (req.method === "GET" && pathname === "/profiles") {
        // Return available profiles from config
        // For now, return empty - will be populated from orchestrator config
        json(res, 200, { profiles: [] });
        return;
      }

      json(res, 404, { error: "not found" });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Wire up worker pool events to SSE broadcasts
  const poolEvents: Array<[WorkerPoolEvent, string]> = [
    ["spawn", "worker:spawned"],
    ["ready", "worker:ready"],
    ["busy", "worker:busy"],
    ["error", "worker:error"],
    ["stop", "worker:stopped"],
    ["dead", "worker:dead"],
    ["update", "worker:updated"],
  ];

  const unsubscribers: Array<() => void> = [];
  for (const [poolEvent, sseEvent] of poolEvents) {
    const unsub = workerPool.on(poolEvent, (instance) => {
      const data = workerPool.toJSON().find((w) => w.id === instance.profile.id);
      broadcastSSE(sseEvent, { worker: data ?? { id: instance.profile.id, status: instance.status } });
    });
    unsubscribers.push(unsub);
  }

  const onStream = (chunk: StreamChunk) => {
    broadcastSSE("worker:stream", { chunk });
  };
  streamEmitter.on("chunk", onStream);
  unsubscribers.push(() => streamEmitter.off("chunk", onStream));

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
    // Unsubscribe from worker pool events
    for (const unsub of unsubscribers) unsub();
    // Close all SSE connections
    for (const client of sseClients.values()) {
      try {
        client.res.end();
      } catch { /* ignore */ }
    }
    sseClients.clear();
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
