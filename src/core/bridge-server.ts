import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { URL } from "node:url";
import { workerPool } from "./worker-pool";
import { recordStreamChunk, streamEmitter, type StreamChunk } from "./stream-events";

export type BridgeServer = {
  url: string;
  token: string;
  close(): Promise<void>;
};

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const body = Buffer.concat(chunks).toString("utf8");
  if (!body.trim()) return {};
  return JSON.parse(body);
}

function writeJson(res: ServerResponse, status: number, payload: any) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(payload));
}

function unauthorized(res: ServerResponse) {
  writeJson(res, 401, { error: "unauthorized" });
}

function methodNotAllowed(res: ServerResponse) {
  writeJson(res, 405, { error: "method_not_allowed" });
}

export async function startBridgeServer(): Promise<BridgeServer> {
  const token = randomBytes(18).toString("base64url");

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const auth = req.headers.authorization ?? "";
    if (auth !== `Bearer ${token}`) return unauthorized(res);

    // Stream chunk endpoint - workers send text chunks here for real-time streaming
    if (url.pathname === "/v1/stream/chunk") {
      if (req.method !== "POST") return methodNotAllowed(res);
      const body = (await readJson(req)) as {
        workerId?: string;
        jobId?: string;
        chunk?: string;
        final?: boolean;
      };

      if (!body.workerId) return writeJson(res, 400, { error: "missing_workerId" });
      if (typeof body.chunk !== "string") return writeJson(res, 400, { error: "missing_chunk" });

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
      recordStreamChunk(streamChunk);
      streamEmitter.emit("chunk", streamChunk);

      return writeJson(res, 200, { ok: true, timestamp: streamChunk.timestamp });
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

    return writeJson(res, 404, { error: "not_found" });
  });

  await new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("Failed to bind bridge server");
  const url = `http://127.0.0.1:${addr.port}`;

  return {
    url,
    token,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
