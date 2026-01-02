import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomBytes } from "node:crypto";
import { URL } from "node:url";
import { workerPool } from "./worker-pool";
import { EventEmitter } from "node:events";
import {
  onOrchestratorEvent,
  publishOrchestratorEvent,
  type OrchestratorEvent,
} from "./orchestrator-events";
import { getWorkflowContextForWorker } from "../skills/context";

// Stream event emitter for real-time worker output
export const streamEmitter = new EventEmitter();
streamEmitter.setMaxListeners(100); // Allow many concurrent SSE connections

export type StreamChunk = {
  workerId: string;
  jobId?: string;
  chunk: string;
  timestamp: number;
  final?: boolean;
};

export type BridgeServer = {
  url: string;
  token: string;
  close(): Promise<void>;
};

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const body = Buffer.concat(chunks).toString("utf8");
  if (!body.trim()) return {};
  return JSON.parse(body);
}

function normalizeSkillEventData(type: string, data: Record<string, any>) {
  if (!type.startsWith("orchestra.skill.")) return data;
  const workerId = data.worker?.id ?? data.workerId;
  if (workerId && !data.worker) {
    const instance = workerPool.get(workerId);
    data.worker = {
      id: workerId,
      ...(instance?.kind || instance?.profile.kind
        ? { kind: instance?.kind ?? instance?.profile.kind }
        : {}),
    };
  }
  if (!data.workflow && workerId) {
    const ctx = getWorkflowContextForWorker(workerId);
    if (ctx) {
      data.workflow = { runId: ctx.runId, stepId: ctx.stepId };
    }
  }
  if (!data.source) {
    data.source = "server";
  }
  data.workerId = undefined;
  return data;
}

function writeJson(res: ServerResponse, status: number, payload: any) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(payload));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function unauthorized(res: ServerResponse) {
  writeJson(res, 401, { error: "unauthorized" });
}

function methodNotAllowed(res: ServerResponse) {
  writeJson(res, 405, { error: "method_not_allowed" });
}

function resolveBridgePort(): number {
  const raw = process.env.OPENCODE_ORCH_BRIDGE_PORT;
  if (!raw) return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 65535) return 0;
  return value;
}

export async function startBridgeServer(): Promise<BridgeServer> {
  const token = randomBytes(18).toString("base64url");
  const port = resolveBridgePort();
  const host = "127.0.0.1";
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const auth = req.headers.authorization ?? "";
    const isWrite =
      url.pathname === "/v1/stream/chunk" ||
      (url.pathname === "/v1/events" && req.method === "POST");
    if (isWrite && auth !== `Bearer ${token}`) return unauthorized(res);

    // Stream chunk endpoint - workers send text chunks here for real-time streaming
    if (url.pathname === "/v1/stream/chunk") {
      if (req.method !== "POST") return methodNotAllowed(res);
      const body = (await readJson(req)) as {
        workerId?: string;
        jobId?: string;
        chunk?: string;
        final?: boolean;
      };

      if (!body.workerId)
        return writeJson(res, 400, { error: "missing_workerId" });
      if (typeof body.chunk !== "string")
        return writeJson(res, 400, { error: "missing_chunk" });

      // Update worker's last activity
      const instance = workerPool.get(body.workerId);
      if (instance) {
        instance.lastActivity = new Date();
      }

      // Emit the chunk to all SSE listeners
      const streamChunk: StreamChunk = {
        workerId: body.workerId,
        jobId: body.jobId,
        chunk: body.chunk,
        timestamp: Date.now(),
        final: body.final,
      };
      streamEmitter.emit("chunk", streamChunk);
      publishOrchestratorEvent("orchestra.worker.stream", {
        chunk: streamChunk,
      });

      return writeJson(res, 200, {
        ok: true,
        timestamp: streamChunk.timestamp,
      });
    }

    // SSE endpoint - clients subscribe to real-time worker output
    if (url.pathname === "/v1/stream") {
      if (req.method !== "GET") return methodNotAllowed(res);

      // Set up SSE headers
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      res.write(": connected\n\n");

      // Optional filter by workerId or jobId
      const filterWorkerId = url.searchParams.get("workerId") ?? undefined;
      const filterJobId = url.searchParams.get("jobId") ?? undefined;

      const onChunk = (chunk: StreamChunk) => {
        // Apply filters if specified
        if (filterWorkerId && chunk.workerId !== filterWorkerId) return;
        if (filterJobId && chunk.jobId !== filterJobId) return;

        // Send SSE event
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      };

      streamEmitter.on("chunk", onChunk);

      // Keep-alive ping every 30s
      const pingInterval = setInterval(() => {
        res.write(": ping\n\n");
      }, 30000);

      // Clean up on close
      req.on("close", () => {
        clearInterval(pingInterval);
        streamEmitter.off("chunk", onChunk);
      });

      return; // Keep connection open
    }

    // Orchestrator events SSE
    if (url.pathname === "/v1/events") {
      if (req.method === "POST") {
        const body = (await readJson(req)) as { type?: string; data?: unknown };
        if (!body?.type || typeof body.type !== "string") {
          return writeJson(res, 400, { error: "missing_type" });
        }
        const raw = isRecord(body.data) ? body.data : {};
        const payload = normalizeSkillEventData(
          body.type,
          raw as Record<string, unknown>,
        );
        const event = publishOrchestratorEvent(
          body.type as any,
          payload as any,
        );
        return writeJson(res, 200, {
          ok: true,
          id: event.id,
          timestamp: event.timestamp,
        });
      }

      if (req.method !== "GET") return methodNotAllowed(res);

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      res.write(": connected\n\n");

      const onEvent = (event: OrchestratorEvent) => {
        res.write(`event: ${event.type}\n`);
        res.write(`id: ${event.id}\n`);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      const off = onOrchestratorEvent(onEvent);

      const pingInterval = setInterval(() => {
        res.write(": ping\n\n");
      }, 30000);

      req.on("close", () => {
        clearInterval(pingInterval);
        off();
      });

      return;
    }

    return writeJson(res, 404, { error: "not_found" });
  });

  await new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, host, () => resolve());
  });

  const addr = server.address();
  if (!addr || typeof addr === "string")
    throw new Error("Failed to bind bridge server");

  const url = `http://127.0.0.1:${addr.port}`;

  return {
    url,
    token,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
