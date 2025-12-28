import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseService, User, WorkerConfig, WorkerState } from "../db";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type DbRouterDeps = {
  db: DatabaseService;
  onWorkerConfigChanged?: (workerId?: string) => void;
  onPreferencesChanged?: (key?: string) => void;
};

const asRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

function setCors(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function sendJson(res: ServerResponse, status: number, body: JsonValue) {
  setCors(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function serializeUser(user: User | null): JsonValue {
  if (!user) return null;
  return {
    id: user.id,
    onboarded: user.onboarded,
    onboardedAt: user.onboardedAt ? user.onboardedAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

function serializeWorkerConfig(config: WorkerConfig): JsonValue {
  return {
    id: config.id,
    userId: config.userId,
    workerId: config.workerId,
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    enabled: config.enabled,
    updatedAt: config.updatedAt.toISOString(),
  };
}

function serializeWorkerState(state: WorkerState): JsonValue {
  return {
    id: state.id,
    userId: state.userId,
    workerId: state.workerId,
    profileName: state.profileName,
    model: state.model,
    serverUrl: state.serverUrl,
    sessionId: state.sessionId,
    uiSessionId: state.uiSessionId,
    status: state.status,
    sessionMode: state.sessionMode,
    parentSessionId: state.parentSessionId,
    startedAt: state.startedAt ? state.startedAt.toISOString() : null,
    lastActivity: state.lastActivity ? state.lastActivity.toISOString() : null,
    currentTask: state.currentTask,
    lastResult: state.lastResult,
    lastResultAt: state.lastResultAt ? state.lastResultAt.toISOString() : null,
    lastResultJobId: state.lastResultJobId,
    lastResultDurationMs: state.lastResultDurationMs,
    error: state.error,
    warning: state.warning,
    updatedAt: state.updatedAt.toISOString(),
  };
}

export function createDbRouter(deps: DbRouterDeps) {
  const subscribers = new Set<ServerResponse>();

  const buildSnapshot = (): JsonValue => ({
    dbPath: deps.db.getDbPath(),
    user: serializeUser(deps.db.getUser()),
    preferences: deps.db.getAllPreferences(),
    workerConfigs: deps.db.getAllWorkerConfigs().map(serializeWorkerConfig),
    workerStates: deps.db.getAllWorkerStates().map(serializeWorkerState),
  });

  const broadcastSnapshot = () => {
    const payload = `event: db.snapshot\ndata: ${JSON.stringify(buildSnapshot())}\n\n`;
    for (const res of subscribers) {
      res.write(payload);
    }
  };

  return async function handle(req: IncomingMessage, res: ServerResponse) {
    if (!req.url) {
      sendJson(res, 400, { error: "Missing URL" });
      return;
    }

    if (req.method === "OPTIONS") {
      setCors(res);
      res.statusCode = 204;
      res.end();
      return;
    }

    const url = new URL(req.url, "http://localhost");
    const path = url.pathname;
    const segments = path.split("/").filter(Boolean);

    if (segments[0] !== "api" || segments[1] !== "db") {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    if (segments.length === 2 && req.method === "GET") {
      sendJson(res, 200, buildSnapshot());
      return;
    }

    if (segments.length === 3 && segments[2] === "events" && req.method === "GET") {
      setCors(res);
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.flushHeaders?.();
      res.write(`event: db.snapshot\ndata: ${JSON.stringify(buildSnapshot())}\n\n`);
      subscribers.add(res);
      req.on("close", () => {
        subscribers.delete(res);
      });
      return;
    }

    if (segments.length >= 3 && segments[2] === "preferences") {
      let handled = false;
      if (segments.length === 3 && req.method === "GET") {
        sendJson(res, 200, deps.db.getAllPreferences());
        return;
      }

      if (segments.length === 3 && req.method === "PUT") {
        try {
          const body = await readJson(req);
          if (asRecord(body) && body.updates && typeof body.updates === "object") {
            for (const [key, value] of Object.entries(body.updates as Record<string, string | null>)) {
              deps.db.setPreference(key, value ?? null);
              deps.onPreferencesChanged?.(key);
            }
          } else if (asRecord(body) && typeof body.key === "string") {
            const rawValue = body.value;
            if (rawValue !== undefined && rawValue !== null && typeof rawValue !== "string") {
              sendJson(res, 400, { error: "Preference value must be a string or null" });
              return;
            }
            const value = typeof rawValue === "string" ? rawValue : null;
            deps.db.setPreference(body.key, value);
            deps.onPreferencesChanged?.(body.key);
          } else {
            sendJson(res, 400, { error: "Invalid preference update payload" });
            return;
          }
          broadcastSnapshot();
          sendJson(res, 200, buildSnapshot());
        } catch (err) {
          sendJson(res, 400, { error: err instanceof Error ? err.message : "Failed to update preferences" });
        }
        return;
      }

      if (segments.length === 4 && req.method === "DELETE") {
        const key = segments[3];
        deps.db.deletePreference(key);
        deps.onPreferencesChanged?.(key);
        broadcastSnapshot();
        sendJson(res, 200, { success: true });
        handled = true;
      }
      if (handled) return;
    }

    if (segments.length >= 3 && segments[2] === "worker-config") {
      let handled = false;
      if (segments.length === 3 && req.method === "GET") {
        sendJson(res, 200, deps.db.getAllWorkerConfigs().map(serializeWorkerConfig));
        return;
      }

      const workerId = segments[3];
      if (!workerId) {
        sendJson(res, 404, { error: "Worker ID not provided" });
        return;
      }

      if (segments.length === 4 && req.method === "GET") {
        const config = deps.db.getWorkerConfig(workerId);
        if (!config) {
          sendJson(res, 404, { error: "Not found" });
          return;
        }
        sendJson(res, 200, serializeWorkerConfig(config));
        return;
      }

      if (segments.length === 4 && req.method === "PUT") {
        try {
          const body = await readJson(req);
          if (!asRecord(body)) {
            sendJson(res, 400, { error: "Invalid worker config payload" });
            return;
          }
          const updates: {
            model?: string | null;
            temperature?: number | null;
            maxTokens?: number | null;
            enabled?: boolean;
          } = {};

          if ("model" in body) {
            updates.model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : null;
          }
          if ("temperature" in body) {
            updates.temperature = body.temperature === null ? null : Number(body.temperature);
            if (Number.isNaN(updates.temperature as number)) delete updates.temperature;
          }
          if ("maxTokens" in body) {
            updates.maxTokens = body.maxTokens === null ? null : Number(body.maxTokens);
            if (Number.isNaN(updates.maxTokens as number)) delete updates.maxTokens;
          }
          if (typeof body.enabled === "boolean") {
            updates.enabled = body.enabled;
          }

          deps.db.setWorkerConfig(workerId, updates);
          deps.onWorkerConfigChanged?.(workerId);
          broadcastSnapshot();
          const config = deps.db.getWorkerConfig(workerId);
          sendJson(res, 200, config ? serializeWorkerConfig(config) : { workerId });
        } catch (err) {
          sendJson(res, 400, { error: err instanceof Error ? err.message : "Failed to update worker config" });
        }
        return;
      }

      if (segments.length === 4 && req.method === "DELETE") {
        deps.db.clearWorkerConfig(workerId);
        deps.onWorkerConfigChanged?.(workerId);
        broadcastSnapshot();
        sendJson(res, 200, { success: true });
        handled = true;
      }
      if (handled) return;
    }

    const handleOnboarded = () => {
      const user = deps.db.markOnboarded();
      broadcastSnapshot();
      sendJson(res, 200, serializeUser(user));
    };

    if (segments.length === 3 && segments[2] === "onboarded" && req.method === "POST") return handleOnboarded();

    sendJson(res, 404, { error: "Not found" });
  };
}
