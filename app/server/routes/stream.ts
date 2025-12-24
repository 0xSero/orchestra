import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { workerPool } from "@orchestrator/core/worker-pool";
import { workerJobs } from "@orchestrator/core/jobs";
import { streamEmitter, type StreamChunk } from "@orchestrator/core/bridge-server";

export const streamRoutes = new Hono();

// GET /api/stream - SSE endpoint for real-time updates
streamRoutes.get("/", async (c) => {
  const filterWorkerId = c.req.query("workerId");
  const filterJobId = c.req.query("jobId");

  return streamSSE(c, async (stream) => {
    // Send initial snapshot
    await stream.writeSSE({
      event: "snapshot",
      data: JSON.stringify({
        workers: workerPool.toJSON(),
        jobs: workerJobs.list({ limit: 20 }),
        timestamp: Date.now(),
      }),
    });

    // Stream chunk listener (from bridge server)
    const onChunk = (chunk: StreamChunk) => {
      if (filterWorkerId && chunk.workerId !== filterWorkerId) return;
      if (filterJobId && chunk.jobId !== filterJobId) return;
      stream.writeSSE({ event: "worker:output", data: JSON.stringify(chunk) });
    };
    streamEmitter.on("chunk", onChunk);

    // Worker status events
    const createStatusHandler = (eventName: string) => (instance: unknown) => {
      const worker = instance as { profile?: { id?: string } };
      if (filterWorkerId && worker.profile?.id !== filterWorkerId) return;
      stream.writeSSE({
        event: "worker:status",
        data: JSON.stringify({ event: eventName, worker: instance }),
      });
    };

    const unsubSpawn = workerPool.on("spawn", createStatusHandler("spawn"));
    const unsubReady = workerPool.on("ready", createStatusHandler("ready"));
    const unsubBusy = workerPool.on("busy", createStatusHandler("busy"));
    const unsubError = workerPool.on("error", createStatusHandler("error"));
    const unsubStop = workerPool.on("stop", createStatusHandler("stop"));

    // Keep-alive ping every 30s
    const pingInterval = setInterval(() => {
      stream.writeSSE({ event: "ping", data: "" });
    }, 30000);

    // Cleanup on disconnect
    stream.onAbort(() => {
      clearInterval(pingInterval);
      streamEmitter.off("chunk", onChunk);
      unsubSpawn();
      unsubReady();
      unsubBusy();
      unsubError();
      unsubStop();
    });

    // Keep connection open indefinitely
    await new Promise(() => {});
  });
});
