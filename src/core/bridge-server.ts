import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { URL } from "node:url";
import { messageBus } from "./message-bus";
import { workerJobs, type WorkerJobReport } from "./jobs";
import { registry } from "./registry";

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

    if (url.pathname === "/v1/report") {
      if (req.method !== "POST") return methodNotAllowed(res);
      const body = (await readJson(req)) as {
        orchestratorInstanceId?: string;
        workerId?: string;
        jobId?: string;
        report?: WorkerJobReport;
        final?: string;
      };

      if (!body.workerId) return writeJson(res, 400, { error: "missing_workerId" });

      const instance = registry.getWorker(body.workerId);
      if (instance) {
        instance.lastActivity = new Date();
        const existing = instance.lastResult;
        const reportText = body.final && typeof body.final === "string" ? body.final : undefined;
        const mergedReport = body.report
          ? {
              ...(existing?.report ?? {}),
              ...body.report,
              ...(reportText && !body.report.details ? { details: reportText } : {}),
            }
          : reportText
            ? { ...(existing?.report ?? {}), details: reportText }
            : existing?.report;
        instance.lastResult = {
          at: existing?.at ?? new Date(),
          response: existing?.response ?? "",
          jobId: body.jobId ?? existing?.jobId,
          durationMs: existing?.durationMs,
          report: mergedReport,
        };
      }

      if (body.jobId && body.report) workerJobs.attachReport(body.jobId, body.report);
      if (body.jobId && body.final && typeof body.final === "string") workerJobs.setResult(body.jobId, { responseText: body.final });

      // Reports for async jobs should wake the orchestrator even if the worker forgets to call wakeup_orchestrator.
      if (body.jobId) {
        const job = workerJobs.get(body.jobId);
        messageBus.wakeup({
          workerId: body.workerId,
          jobId: body.jobId,
          reason: "result_ready",
          summary: body.report?.summary ?? (typeof body.final === "string" ? body.final.slice(0, 120) : "report received"),
          data: {
            kind: "report",
            ...(job?.sessionId ? { sessionId: job.sessionId } : {}),
          },
          timestamp: Date.now(),
        });
      }

      return writeJson(res, 200, { ok: true });
    }

    if (url.pathname === "/v1/message") {
      if (req.method !== "POST") return methodNotAllowed(res);
      const body = (await readJson(req)) as { from?: string; to?: string; topic?: string; jobId?: string; text?: string };
      if (!body.from || !body.to || !body.text) return writeJson(res, 400, { error: "missing_fields" });
      const msg = messageBus.send({ from: body.from, to: body.to, topic: body.topic, jobId: body.jobId, text: body.text });

      // Messages addressed to the orchestrator are treated as actionable and should wake it.
      if (body.to === "orchestrator") {
        const job = body.jobId ? workerJobs.get(body.jobId) : undefined;
        messageBus.wakeup({
          workerId: body.from,
          jobId: body.jobId,
          reason: "needs_attention",
          summary: body.topic ? `message: ${body.topic}` : "message",
          data: {
            kind: "message",
            messageId: msg.id,
            ...(job?.sessionId ? { sessionId: job.sessionId } : {}),
          },
          timestamp: Date.now(),
        });
      }
      return writeJson(res, 200, { ok: true, id: msg.id, createdAt: msg.createdAt });
    }

    if (url.pathname === "/v1/inbox") {
      if (req.method !== "GET") return methodNotAllowed(res);
      const to = url.searchParams.get("to") ?? "";
      if (!to) return writeJson(res, 400, { error: "missing_to" });
      const after = Number(url.searchParams.get("after") ?? "0");
      const limit = Number(url.searchParams.get("limit") ?? "50");
      const msgs = messageBus.list(to, { after: Number.isFinite(after) ? after : 0, limit: Number.isFinite(limit) ? limit : 50 });
      return writeJson(res, 200, { ok: true, messages: msgs });
    }

    // Wakeup endpoint - allows workers to notify orchestrator they need attention
    if (url.pathname === "/v1/wakeup") {
      if (req.method !== "POST") return methodNotAllowed(res);
      const body = (await readJson(req)) as {
        workerId?: string;
        jobId?: string;
        reason?: "result_ready" | "needs_attention" | "error" | "progress" | "custom";
        summary?: string;
        data?: Record<string, unknown>;
      };

      if (!body.workerId) return writeJson(res, 400, { error: "missing_workerId" });
      if (!body.reason) return writeJson(res, 400, { error: "missing_reason" });

      // Update worker's last activity
      const instance = registry.getWorker(body.workerId);
      if (instance) {
        instance.lastActivity = new Date();
      }

      // Emit wakeup event through the message bus
      const event = messageBus.wakeup({
        workerId: body.workerId,
        jobId: body.jobId,
        reason: body.reason,
        summary: body.summary,
        data: body.data,
        timestamp: Date.now(),
      });

      return writeJson(res, 200, { ok: true, id: event.id, timestamp: event.timestamp });
    }

    // Get wakeup history endpoint
    if (url.pathname === "/v1/wakeup/history") {
      if (req.method !== "GET") return methodNotAllowed(res);
      const workerId = url.searchParams.get("workerId") ?? undefined;
      const after = Number(url.searchParams.get("after") ?? "0");
      const limit = Number(url.searchParams.get("limit") ?? "50");
      const events = messageBus.getWakeupHistory({
        workerId,
        after: Number.isFinite(after) ? after : undefined,
        limit: Number.isFinite(limit) ? limit : 50,
      });
      return writeJson(res, 200, { ok: true, events });
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
