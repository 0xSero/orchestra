# OpenCode Orchestra Repository Bundle

Generated: 2025-12-28T19:08:11.463Z

Total files: 132

## File Structure

- api/db-router.ts
- api/index.ts
- api/sessions-router.ts
- api/skills-router.ts
- api/skills-server.ts
- api/system-router.ts
- commands/index.ts
- commands/memory.ts
- commands/orchestrator-constants.ts
- commands/orchestrator-council.ts
- commands/orchestrator-image.ts
- commands/orchestrator-multimodal.ts
- commands/orchestrator-utils.ts
- commands/orchestrator.ts
- commands/vision.ts
- communication/events.ts
- communication/index.ts
- config/opencode.ts
- config/orchestrator.ts
- config/orchestrator/defaults.ts
- config/orchestrator/parse-extra.ts
- config/orchestrator/parse-workers.ts
- config/orchestrator/parse.ts
- config/orchestrator/paths.ts
- config/profile-inheritance.ts
- config/profiles.ts
- core/container-profiles.ts
- core/container-toasts.ts
- core/container-vision.ts
- core/container.ts
- core/index.ts
- core/jobs.ts
- core/spawn-policy.ts
- db/index.ts
- db/overrides.ts
- db/schema.ts
- helpers/advanced-util.ts
- helpers/format.ts
- helpers/fs.ts
- helpers/process.ts
- index.ts
- integrations/linear-config.ts
- integrations/linear-issues.ts
- integrations/linear-projects.ts
- integrations/linear-request.ts
- integrations/linear-teams.ts
- integrations/linear-types.ts
- integrations/linear.ts
- integrations/registry.ts
- integrations/selection.ts
- memory/auto.ts
- memory/graph.ts
- memory/graph/shared.ts
- memory/graph/trim.ts
- memory/index.ts
- memory/inject.ts
- memory/neo4j-config.ts
- memory/neo4j-docker.ts
- memory/neo4j-driver.ts
- memory/neo4j.ts
- memory/store-file.ts
- memory/store.ts
- memory/text.ts
- models/aliases.ts
- models/capabilities.ts
- models/capability-overrides.ts
- models/catalog.ts
- models/cost.ts
- models/hydrate.ts
- models/resolver.ts
- orchestrator/index.ts
- orchestrator/router.ts
- permissions/schema.ts
- permissions/validator.ts
- profiles/discovery.ts
- prompts/index.ts
- prompts/orchestrator-system.ts
- skills/builtin.ts
- skills/convert.ts
- skills/crud.ts
- skills/events.ts
- skills/index.ts
- skills/loader.ts
- skills/parse.ts
- skills/paths.ts
- skills/service.ts
- skills/validate.ts
- tools/hooks.ts
- tools/index.ts
- tools/linear-tools.ts
- tools/worker-tools.ts
- tools/workflow-tools.ts
- types/config.ts
- types/events.ts
- types/factory.ts
- types/index.ts
- types/integrations.ts
- types/memory.ts
- types/permissions.ts
- types/skill.ts
- types/worker.ts
- types/workflow.ts
- ux/repo-context.ts
- ux/vision-attachments.ts
- ux/vision-parts.ts
- ux/vision-routing.ts
- ux/vision-types.ts
- workers/attachments.ts
- workers/event-forwarding.ts
- workers/index.ts
- workers/jobs.ts
- workers/manager.ts
- workers/pid-tracker.ts
- workers/profiles/index.ts
- workers/prompt.ts
- workers/registry.ts
- workers/send.ts
- workers/session-manager-types.ts
- workers/session-manager.ts
- workers/spawn-bootstrap.ts
- workers/spawn-env.ts
- workers/spawn-helpers.ts
- workers/spawn-model.ts
- workers/spawn-plugin.ts
- workers/spawn-server.ts
- workers/spawn.ts
- workflows/builtins.ts
- workflows/engine.ts
- workflows/factory.ts
- workflows/index.ts
- workflows/roocode-boomerang.ts
- workflows/types.ts

---

## File: api/db-router.ts

```typescript
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

```

---

## File: api/index.ts

```typescript
import { createOpencode, createOpencodeClient } from "@opencode-ai/sdk";
import type { Factory, ServiceLifecycle } from "../types";

export * from "./skills-server";

export type ApiConfig = {
  baseUrl?: string;
  directory?: string;
};

export type ApiDeps = {
  client?: ReturnType<typeof createOpencodeClient>;
};

/**
 * Simplified API service interface for OpenCode SDK operations.
 *
 * Note: This interface uses `unknown` for args/return types instead of the SDK's
 * complex generic types. This is intentional - the SDK types have deeply nested
 * generics with conditional types that would require complex type gymnastics to
 * properly expose. Using `unknown` provides a clean interface while the actual
 * implementation delegates to the properly-typed SDK client.
 *
 * Callers should refer to SDK documentation for the actual request/response shapes.
 */
export type ApiService = ServiceLifecycle & {
  client: ReturnType<typeof createOpencodeClient>;
  createClient: (input: { baseUrl: string; directory?: string }) => ReturnType<typeof createOpencodeClient>;
  createServer: typeof createOpencode;
  session: {
    create: (args: unknown) => Promise<unknown>;
    list: (args: unknown) => Promise<unknown>;
    get: (args: unknown) => Promise<unknown>;
    prompt: (args: unknown) => Promise<unknown>;
    promptAsync: (args: unknown) => Promise<unknown>;
    messages: (args: unknown) => Promise<unknown>;
    messageDelete: (args: unknown) => Promise<unknown>;
    abort: (args: unknown) => Promise<unknown>;
  };
  event: {
    subscribe: (args: unknown) => unknown;
  };
  file: {
    read: (args: unknown) => Promise<unknown>;
  };
  find: {
    text: (args: unknown) => Promise<unknown>;
    files: (args: unknown) => Promise<unknown>;
  };
  project: {
    list: (args: unknown) => Promise<unknown>;
    current: (args: unknown) => Promise<unknown>;
  };
  path: {
    get: (args: unknown) => Promise<unknown>;
  };
  config: {
    get: (args: unknown) => Promise<unknown>;
    providers: (args: unknown) => Promise<unknown>;
  };
  app: {
    agents: (args: unknown) => Promise<unknown>;
    log: (args: unknown) => Promise<unknown>;
  };
  tui: {
    appendPrompt: (args: unknown) => Promise<unknown>;
    showToast: (args: unknown) => Promise<unknown>;
    submitPrompt: (args: unknown) => Promise<unknown>;
    publish: (args: unknown) => Promise<unknown>;
  };
  auth: {
    set: (args: unknown) => Promise<unknown>;
  };
};

/**
 * SDK request arguments shape - simplified for type checking.
 */
type SdkArgs = { query?: Record<string, unknown> } & Record<string, unknown>;

/**
 * Helper to inject directory into SDK request arguments.
 *
 * The SDK uses complex generics; we normalize to a simple shape here and cast
 * back to the SDK's expected types at call sites.
 */
function withDirectory(directory: string | undefined, args: unknown): SdkArgs {
  if (!directory) {
    if (!args || typeof args !== "object") return {};
    return args as SdkArgs;
  }
  if (!args || typeof args !== "object") return { query: { directory } };
  const typedArgs = args as SdkArgs;
  return { ...typedArgs, query: { ...(typedArgs.query ?? {}), directory } };
}

export const createApi: Factory<ApiConfig, ApiDeps, ApiService> = ({ config, deps }) => {
  const client = deps.client ?? createOpencodeClient({ baseUrl: config.baseUrl });
  const directory = config.directory;
  const withDirectoryArgs = <T>(args: unknown): T => withDirectory(directory, args) as T;

  return {
    client,
    createClient: ({ baseUrl, directory: dir }) => createOpencodeClient({ baseUrl, directory: dir }),
    createServer: createOpencode,
    session: {
      create: (args) => client.session.create(withDirectoryArgs<Parameters<typeof client.session.create>[0]>(args)),
      list: (args) => client.session.list(withDirectoryArgs<Parameters<typeof client.session.list>[0]>(args)),
      get: (args) => client.session.get(withDirectoryArgs<Parameters<typeof client.session.get>[0]>(args)),
      prompt: (args) => client.session.prompt(withDirectoryArgs<Parameters<typeof client.session.prompt>[0]>(args)),
      promptAsync: (args) =>
        client.session.promptAsync(withDirectoryArgs<Parameters<typeof client.session.promptAsync>[0]>(args)),
      messages: (args) =>
        client.session.messages(withDirectoryArgs<Parameters<typeof client.session.messages>[0]>(args)),
      messageDelete: (args) =>
        client.session.delete(withDirectoryArgs<Parameters<typeof client.session.delete>[0]>(args)),
      abort: (args) => client.session.abort(withDirectoryArgs<Parameters<typeof client.session.abort>[0]>(args)),
    },
    event: {
      subscribe: (args) =>
        client.event.subscribe(withDirectoryArgs<Parameters<typeof client.event.subscribe>[0]>(args)),
    },
    file: {
      read: (args) => client.file.read(withDirectoryArgs<Parameters<typeof client.file.read>[0]>(args)),
    },
    find: {
      text: (args) => client.find.text(withDirectoryArgs<Parameters<typeof client.find.text>[0]>(args)),
      files: (args) => client.find.files(withDirectoryArgs<Parameters<typeof client.find.files>[0]>(args)),
    },
    project: {
      list: (args) => client.project.list(withDirectoryArgs<Parameters<typeof client.project.list>[0]>(args)),
      current: (args) => client.project.current(withDirectoryArgs<Parameters<typeof client.project.current>[0]>(args)),
    },
    path: {
      get: (args) => client.path.get(withDirectoryArgs<Parameters<typeof client.path.get>[0]>(args)),
    },
    config: {
      get: (args) => client.config.get(withDirectoryArgs<Parameters<typeof client.config.get>[0]>(args)),
      providers: (args) =>
        client.config.providers(withDirectoryArgs<Parameters<typeof client.config.providers>[0]>(args)),
    },
    app: {
      agents: (args) => client.app.agents(withDirectoryArgs<Parameters<typeof client.app.agents>[0]>(args)),
      log: (args) => client.app.log(withDirectoryArgs<Parameters<typeof client.app.log>[0]>(args)),
    },
    tui: {
      appendPrompt: (args) =>
        client.tui.appendPrompt(withDirectoryArgs<Parameters<typeof client.tui.appendPrompt>[0]>(args)),
      showToast: (args) => client.tui.showToast(withDirectoryArgs<Parameters<typeof client.tui.showToast>[0]>(args)),
      submitPrompt: (args) =>
        client.tui.submitPrompt(withDirectoryArgs<Parameters<typeof client.tui.submitPrompt>[0]>(args)),
      publish: (args) => client.tui.publish(withDirectoryArgs<Parameters<typeof client.tui.publish>[0]>(args)),
    },
    auth: {
      set: (args) => client.auth.set(withDirectoryArgs<Parameters<typeof client.auth.set>[0]>(args)),
    },
    start: async () => {},
    stop: async () => {},
    health: async () => ({ ok: true }),
  };
};

```

---

## File: api/sessions-router.ts

```typescript
import type { IncomingMessage, ServerResponse } from "node:http";
import type { SessionManagerEvent, TrackedSession, WorkerManager, WorkerSessionManager } from "../workers";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type SessionsRouterDeps = {
  sessionManager: WorkerSessionManager;
  workers: WorkerManager;
};

function setCors(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res: ServerResponse, status: number, body: JsonValue) {
  setCors(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function serializeSession(session: TrackedSession): JsonValue {
  return {
    workerId: session.workerId,
    sessionId: session.sessionId,
    mode: session.mode,
    parentSessionId: session.parentSessionId ?? null,
    serverUrl: session.serverUrl ?? null,
    createdAt: session.createdAt.toISOString(),
    lastActivity: session.lastActivity.toISOString(),
    status: session.status,
    messageCount: session.messageCount,
    toolCount: session.toolCount,
    recentActivity: session.recentActivity.map((activity) => ({
      id: activity.id,
      type: activity.type,
      timestamp: activity.timestamp.toISOString(),
      summary: activity.summary,
    })),
    error: session.error ?? null,
  };
}

/**
 * Create a router for the sessions API.
 * Provides endpoints for viewing worker sessions and their activity.
 */
export function createSessionsRouter(deps: SessionsRouterDeps) {
  const eventSubscribers = new Set<ServerResponse>();

  // Subscribe to session manager events and broadcast to SSE clients
  deps.sessionManager.on((event: SessionManagerEvent) => {
    const payload = `event: ${event.type}\ndata: ${JSON.stringify({
      type: event.type,
      session: serializeSession(event.session),
      activity: event.activity
        ? {
            id: event.activity.id,
            type: event.activity.type,
            timestamp: event.activity.timestamp.toISOString(),
            summary: event.activity.summary,
          }
        : null,
    })}\n\n`;
    for (const res of eventSubscribers) {
      res.write(payload);
    }
  });

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

    // Require /api/sessions prefix
    if (segments[0] !== "api" || segments[1] !== "sessions") {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    // GET /api/sessions - List all sessions with summary
    if (segments.length === 2 && req.method === "GET") {
      try {
        const summary = deps.sessionManager.getSummary();
        sendJson(res, 200, {
          total: summary.total,
          byMode: summary.byMode,
          byStatus: summary.byStatus,
          sessions: summary.sessions as unknown as JsonValue,
        });
      } catch (err) {
        sendJson(res, 500, { error: err instanceof Error ? err.message : "Failed to get sessions" });
      }
      return;
    }

    // GET /api/sessions/events - SSE stream of session events
    if (segments.length === 3 && segments[2] === "events" && req.method === "GET") {
      setCors(res);
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.flushHeaders?.();

      // Send initial state
      const summary = deps.sessionManager.getSummary();
      res.write(
        `event: init\ndata: ${JSON.stringify({
          total: summary.total,
          sessions: summary.sessions,
        })}\n\n`,
      );

      eventSubscribers.add(res);
      req.on("close", () => {
        eventSubscribers.delete(res);
      });
      return;
    }

    // GET /api/sessions/active - List only active sessions
    if (segments.length === 3 && segments[2] === "active" && req.method === "GET") {
      try {
        const sessions = deps.sessionManager.getActiveSessions();
        sendJson(res, 200, sessions.map(serializeSession) as unknown as JsonValue);
      } catch (err) {
        sendJson(res, 500, { error: err instanceof Error ? err.message : "Failed to get active sessions" });
      }
      return;
    }

    // GET /api/sessions/by-mode/:mode - List sessions by mode
    if (segments.length === 4 && segments[2] === "by-mode" && req.method === "GET") {
      const mode = segments[3];
      if (mode !== "child" && mode !== "isolated" && mode !== "linked") {
        sendJson(res, 400, { error: "Invalid mode. Must be: child, isolated, or linked" });
        return;
      }
      try {
        const sessions = deps.sessionManager.getSessionsByMode(mode);
        sendJson(res, 200, sessions.map(serializeSession) as unknown as JsonValue);
      } catch (err) {
        sendJson(res, 500, { error: err instanceof Error ? err.message : "Failed to get sessions by mode" });
      }
      return;
    }

    // GET /api/sessions/worker/:workerId - Get session for a specific worker
    if (segments.length === 4 && segments[2] === "worker" && req.method === "GET") {
      const workerId = segments[3];
      try {
        const session = deps.sessionManager.getSessionByWorker(workerId);
        if (!session) {
          sendJson(res, 404, { error: `No session found for worker: ${workerId}` });
          return;
        }
        sendJson(res, 200, serializeSession(session) as unknown as JsonValue);
      } catch (err) {
        sendJson(res, 500, { error: err instanceof Error ? err.message : "Failed to get worker session" });
      }
      return;
    }

    // GET /api/sessions/:sessionId - Get specific session
    if (segments.length === 3 && req.method === "GET") {
      const sessionId = segments[2];
      try {
        const session = deps.sessionManager.getSession(sessionId);
        if (!session) {
          sendJson(res, 404, { error: `Session not found: ${sessionId}` });
          return;
        }
        sendJson(res, 200, serializeSession(session) as unknown as JsonValue);
      } catch (err) {
        sendJson(res, 500, { error: err instanceof Error ? err.message : "Failed to get session" });
      }
      return;
    }

    // GET /api/sessions/:sessionId/activity - Get session activity log
    if (segments.length === 4 && segments[3] === "activity" && req.method === "GET") {
      const sessionId = segments[2];
      try {
        const session = deps.sessionManager.getSession(sessionId);
        if (!session) {
          sendJson(res, 404, { error: `Session not found: ${sessionId}` });
          return;
        }

        // Parse query params for pagination
        const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
        const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

        const activity = session.recentActivity.slice(offset, offset + limit);
        sendJson(res, 200, {
          sessionId,
          workerId: session.workerId,
          total: session.recentActivity.length,
          offset,
          limit,
          activity: activity.map((a) => ({
            id: a.id,
            type: a.type as string,
            timestamp: a.timestamp.toISOString(),
            summary: a.summary,
            details: (a.details as JsonValue) ?? null,
          })),
        } as unknown as JsonValue);
      } catch (err) {
        sendJson(res, 500, { error: err instanceof Error ? err.message : "Failed to get session activity" });
      }
      return;
    }

    const handleCloseSession = async (sessionId: string) => {
      try {
        const session = deps.sessionManager.getSession(sessionId);
        if (!session) {
          sendJson(res, 404, { error: `Session not found: ${sessionId}` });
          return;
        }

        // Stop the worker to close the session
        const stopped = await deps.workers.stopWorker(session.workerId);
        if (!stopped) {
          sendJson(res, 500, { error: "Failed to stop worker" });
          return;
        }

        deps.sessionManager.closeSession(sessionId);
        sendJson(res, 200, { success: true, sessionId, workerId: session.workerId });
      } catch (err) {
        sendJson(res, 500, { error: err instanceof Error ? err.message : "Failed to close session" });
      }
    };

    // DELETE /api/sessions/:sessionId - Close a session
    if (segments.length === 3 && req.method === "DELETE") return await handleCloseSession(segments[2]);

    sendJson(res, 404, { error: "Not found" });
  };
}

```

---

## File: api/skills-router.ts

```typescript
import type { IncomingMessage, ServerResponse } from "node:http";
import type { SkillsService } from "../skills/service";
import type { SkillInput, SkillScope } from "../types";
import type { WorkerManager } from "../workers";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type SkillsRouterDeps = {
  skills: SkillsService;
  workers?: WorkerManager;
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

function normalizeScope(value: unknown): SkillScope {
  return value === "global" ? "global" : "project";
}

export function createSkillsRouter(deps: SkillsRouterDeps) {
  const subscribers = new Set<ServerResponse>();
  deps.skills.events.on((event) => {
    const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const res of subscribers) {
      res.write(payload);
    }
  });

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

    if (segments[0] !== "api" || segments[1] !== "skills") {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    if (segments.length === 2 && req.method === "GET") {
      try {
        const skills = await deps.skills.list();
        sendJson(res, 200, skills as unknown as JsonValue);
      } catch (err) {
        sendJson(res, 500, { error: err instanceof Error ? err.message : "Failed to list skills" });
      }
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
      res.write(": connected\n\n");
      subscribers.add(res);
      req.on("close", () => {
        subscribers.delete(res);
      });
      return;
    }

    if (segments.length === 2 && req.method === "POST") {
      try {
        const body = await readJson(req);
        const record = asRecord(body) ? body : {};
        const input = (asRecord(record.input) ? (record.input as unknown) : {}) as SkillInput;
        const skill = await deps.skills.create(input, normalizeScope(record.scope));
        sendJson(res, 201, skill as unknown as JsonValue);
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : "Failed to create skill" });
      }
      return;
    }

    const skillId = segments[2];
    if (!skillId) {
      sendJson(res, 404, { error: "Skill ID not provided" });
      return;
    }

    if (segments.length === 3 && req.method === "GET") {
      try {
        const skill = await deps.skills.get(skillId);
        if (!skill) {
          sendJson(res, 404, { error: "Not found" });
          return;
        }
        sendJson(res, 200, skill as unknown as JsonValue);
      } catch (err) {
        sendJson(res, 500, { error: err instanceof Error ? err.message : "Failed to load skill" });
      }
      return;
    }

    if (segments.length === 3 && req.method === "PUT") {
      try {
        const body = await readJson(req);
        const record = asRecord(body) ? body : {};
        const updates = (asRecord(record.updates) ? record.updates : {}) as Partial<SkillInput>;
        const skill = await deps.skills.update(skillId, updates, normalizeScope(record.scope));
        sendJson(res, 200, skill as unknown as JsonValue);
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : "Failed to update skill" });
      }
      return;
    }

    if (segments.length === 3 && req.method === "DELETE") {
      try {
        const body = await readJson(req);
        const record = asRecord(body) ? body : {};
        await deps.skills.delete(skillId, normalizeScope(record.scope));
        sendJson(res, 200, { success: true });
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : "Failed to delete skill" });
      }
      return;
    }

    if (segments.length === 4 && segments[3] === "duplicate" && req.method === "POST") {
      try {
        const body = await readJson(req);
        const record = asRecord(body) ? body : {};
        const newId = typeof record.newId === "string" ? record.newId : "";
        if (!newId) {
          sendJson(res, 400, { error: "Missing newId" });
          return;
        }
        const skill = await deps.skills.duplicate(skillId, newId, normalizeScope(record.scope));
        sendJson(res, 201, skill as unknown as JsonValue);
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : "Failed to duplicate skill" });
      }
      return;
    }

    const handleSpawn = async () => {
      if (!deps.workers) {
        sendJson(res, 501, { error: "Worker manager not available" });
        return;
      }
      try {
        const worker = await deps.workers.spawnById(skillId);
        sendJson(res, 201, {
          id: worker.profile.id,
          status: worker.status,
          port: worker.port,
          model: worker.profile.model,
        });
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : "Failed to spawn worker" });
      }
    };

    if (segments.length === 4 && segments[3] === "spawn" && req.method === "POST") return await handleSpawn();

    sendJson(res, 404, { error: "Not found" });
  };
}

```

---

## File: api/skills-server.ts

```typescript
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

```

---

## File: api/system-router.ts

```typescript
import { exec } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import { promisify } from "node:util";

type ExecAsync = (command: string) => Promise<{ stdout: string; stderr: string }>;

const defaultExecAsync = promisify(exec) as ExecAsync;

export type ProcessInfo = {
  pid: number;
  cpu: number;
  memory: number;
  started: string;
  command: string;
  type: "opencode-serve" | "opencode-main" | "vite" | "bun" | "other";
};

export type SystemStats = {
  processes: ProcessInfo[];
  totalMemory: number;
  totalCpu: number;
  count: number;
};

async function getOpencodeProcesses(execAsync: ExecAsync): Promise<SystemStats> {
  try {
    const { stdout } = await execAsync(
      `/bin/ps aux | /usr/bin/grep -E 'opencode|node.*vite|bun.*serve' | /usr/bin/grep -v grep`,
    );

    const lines = stdout.trim().split("\n").filter(Boolean);
    const processes: ProcessInfo[] = [];
    let totalMemory = 0;
    let totalCpu = 0;

    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length < 11) continue;

      const pid = parseInt(parts[1], 10);
      const cpu = parseFloat(parts[2]) || 0;
      const memKb = parseInt(parts[5], 10) || 0;
      const memory = memKb / 1024; // Convert to MB
      const started = parts[8] || "";
      const command = parts.slice(10).join(" ");

      // Determine process type
      let type: ProcessInfo["type"] = "other";
      if (command.includes("opencode serve")) {
        type = "opencode-serve";
      } else if (command.includes("opencode") && !command.includes("serve")) {
        type = "opencode-main";
      } else if (command.includes("vite")) {
        type = "vite";
      } else if (command.includes("bun")) {
        type = "bun";
      }

      processes.push({ pid, cpu, memory, started, command, type });
      totalMemory += memory;
      totalCpu += cpu;
    }

    // Sort by memory usage descending
    processes.sort((a, b) => b.memory - a.memory);

    return {
      processes,
      totalMemory,
      totalCpu,
      count: processes.length,
    };
  } catch {
    return { processes: [], totalMemory: 0, totalCpu: 0, count: 0 };
  }
}

async function killProcess(execAsync: ExecAsync, pid: number): Promise<{ success: boolean; error?: string }> {
  try {
    await execAsync(`kill ${pid}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

async function killAllOpencodeServe(
  execAsync: ExecAsync,
  getProcesses: (execAsync: ExecAsync) => Promise<SystemStats> = getOpencodeProcesses,
): Promise<{ killed: number; errors: string[] }> {
  try {
    const stats = await getProcesses(execAsync);
    const servePids = stats.processes.filter((p) => p.type === "opencode-serve").map((p) => p.pid);

    let killed = 0;
    const errors: string[] = [];

    for (const pid of servePids) {
      const result = await killProcess(execAsync, pid);
      if (result.success) {
        killed++;
      } else if (result.error) {
        errors.push(`PID ${pid}: ${result.error}`);
      }
    }

    return { killed, errors };
  } catch (err) {
    return { killed: 0, errors: [String(err)] };
  }
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(data));
}

export function createSystemRouter(
  deps: { execAsync?: ExecAsync; getOpencodeProcesses?: (execAsync: ExecAsync) => Promise<SystemStats> } = {},
) {
  const execAsync = deps.execAsync ?? defaultExecAsync;
  const getProcesses = deps.getOpencodeProcesses ?? getOpencodeProcesses;
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = req.url ?? "";
    const method = req.method ?? "GET";

    // Handle CORS preflight
    if (method === "OPTIONS") {
      res.statusCode = 204;
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.end();
      return;
    }

    // GET /api/system/processes - List all opencode processes
    if (url === "/api/system/processes" && method === "GET") {
      const stats = await getProcesses(execAsync);
      sendJson(res, 200, stats);
      return;
    }

    // DELETE /api/system/processes/:pid - Kill a specific process
    const killMatch = url.match(/^\/api\/system\/processes\/(\d+)$/);
    if (killMatch && method === "DELETE") {
      const pid = parseInt(killMatch[1], 10);
      const result = await killProcess(execAsync, pid);
      if (result.success) {
        sendJson(res, 200, { success: true, pid });
      } else {
        sendJson(res, 500, { success: false, error: result.error });
      }
      return;
    }

    // POST /api/system/processes/kill-all-serve - Kill all opencode serve processes
    if (url === "/api/system/processes/kill-all-serve" && method === "POST") {
      const result = await killAllOpencodeServe(execAsync, getProcesses);
      sendJson(res, 200, result);
      return;
    }

    // 404 for unknown routes
    sendJson(res, 404, { error: "Not found" });
  };
}

```

---

## File: commands/index.ts

```typescript
import type { ApiService } from "../api";
import type { MemoryService } from "../memory";
import type { OrchestratorService } from "../orchestrator";
import type { OrchestratorConfig } from "../types";
import type { WorkerManager } from "../workers";
import { createMemoryCommands } from "./memory";
import { createOrchestratorCommands } from "./orchestrator";
import { createVisionCommands } from "./vision";

export type CommandDeps = {
  api: ApiService;
  orchestrator: OrchestratorService;
  workers: WorkerManager;
  memory: MemoryService;
  config: OrchestratorConfig;
  projectDir: string;
};

export type CommandInput = {
  command: string;
  args?: unknown;
  text?: string;
  raw?: string;
  sessionID?: string;
  agent?: string;
};

export type ParsedCommandInput = {
  raw: string;
  tokens: string[];
  positional: string[];
  named: Record<string, string | string[]>;
};

export type CommandContext = {
  deps: CommandDeps;
  input: CommandInput;
  parsed: ParsedCommandInput;
};

export type CommandDefinition = {
  description: string;
  usage?: string;
  execute: (ctx: CommandContext) => Promise<string>;
};

export type CommandRouter = {
  execute: (input: CommandInput) => Promise<string | undefined>;
  list: () => Array<{ name: string; description: string; usage?: string }>;
  commandConfig: () => Record<string, { template: string; description?: string }>;
};

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  const matcher = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match = matcher.exec(input);
  while (match !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
    match = matcher.exec(input);
  }
  return tokens;
}

function addNamedValue(named: Record<string, string | string[]>, key: string, value: string) {
  if (!key) return;
  const existing = named[key];
  if (!existing) {
    named[key] = value;
    return;
  }
  if (Array.isArray(existing)) {
    existing.push(value);
    return;
  }
  named[key] = [existing, value];
}

export function normalizeCommandName(raw: string): string {
  return raw.trim().replace(/^\/+/, "");
}

export function parseCommandInput(input: CommandInput): ParsedCommandInput {
  const named: Record<string, string | string[]> = {};
  let raw = "";
  let tokens: string[] = [];

  if (typeof input.args === "string") {
    raw = input.args;
    tokens = tokenize(raw);
  } else if (Array.isArray(input.args)) {
    tokens = input.args.map((value) => String(value));
    raw = tokens.join(" ");
  } else if (typeof input.text === "string") {
    raw = input.text;
    tokens = tokenize(raw);
  } else if (typeof input.raw === "string") {
    raw = input.raw;
    tokens = tokenize(raw);
  }

  if (input.args && typeof input.args === "object" && !Array.isArray(input.args)) {
    for (const [key, value] of Object.entries(input.args as Record<string, unknown>)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        named[key] = value.map((item) => String(item));
        continue;
      }
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        named[key] = String(value);
      }
    }
    const extras = (input.args as Record<string, unknown>)._;
    if (Array.isArray(extras) && tokens.length === 0) {
      tokens = extras.map((value) => String(value));
      raw = tokens.join(" ");
    }
  }

  if (!raw && tokens.length > 0) raw = tokens.join(" ");

  const positional: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    const trimmed = token.slice(2);
    if (!trimmed) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex !== -1) {
      const key = trimmed.slice(0, eqIndex);
      const value = trimmed.slice(eqIndex + 1);
      if (!(key in named)) addNamedValue(named, key, value);
      continue;
    }

    const next = tokens[i + 1];
    if (next && !next.startsWith("--")) {
      if (!(trimmed in named)) addNamedValue(named, trimmed, next);
      i += 1;
      continue;
    }

    if (!(trimmed in named)) named[trimmed] = "true";
  }

  return { raw, tokens, positional, named };
}

export function createCommandRouter(deps: CommandDeps): CommandRouter {
  const enabled = deps.config.commands?.enabled !== false;
  const rawPrefix = (deps.config.commands?.prefix ?? "orchestrator.").trim();
  const prefix = rawPrefix && !rawPrefix.endsWith(".") ? `${rawPrefix}.` : rawPrefix;

  const commands: Record<string, CommandDefinition> = {
    ...createOrchestratorCommands({ prefix }),
    ...createVisionCommands(),
    ...createMemoryCommands(),
  };

  return {
    execute: async (input: CommandInput) => {
      if (!enabled) return undefined;
      const commandName = normalizeCommandName(String(input.command ?? ""));
      const command = commands[commandName];
      if (!command) return undefined;
      const parsed = parseCommandInput(input);
      return await command.execute({ deps, input, parsed });
    },
    list: () =>
      Object.entries(commands).map(([name, def]) => ({
        name,
        description: def.description,
        usage: def.usage,
      })),
    commandConfig: () => {
      if (!enabled) return {};
      const config: Record<string, { template: string; description?: string }> = {};
      for (const [name, def] of Object.entries(commands)) {
        config[name] = {
          template: `Command ${name} handled by orchestrator plugin.`,
          description: def.description,
        };
      }
      return config;
    },
  };
}

```

---

## File: commands/memory.ts

```typescript
import type { ApiService } from "../api";
import {
  getMemoryBackend,
  type MemoryNode,
  type MemoryScope,
  recentMemory,
  searchMemory,
  upsertMemory,
} from "../memory/store";
import type { CommandDefinition } from "./index";

function pickFirstString(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function parseTags(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const tags = Array.isArray(value) ? value : value.split(",");
  return tags.map((tag) => tag.trim()).filter(Boolean);
}

async function resolveProjectId(api: ApiService): Promise<string | undefined> {
  try {
    const res = await api.project.current({});
    const data = res && typeof res === "object" && "data" in res ? (res as { data?: unknown }).data : (res as unknown);
    if (data && typeof data === "object" && "id" in data) {
      const idValue = (data as { id?: unknown }).id;
      if (idValue) return String(idValue);
    }
  } catch {
    // ignore
  }
  return undefined;
}

async function resolveScope(input: {
  api: ApiService;
  requested: MemoryScope;
  requireProject: boolean;
  projectId?: string;
}): Promise<{ scope: MemoryScope; projectId?: string }> {
  if (input.requested !== "project") return { scope: input.requested };
  const projectId = input.projectId ?? (await resolveProjectId(input.api));
  if (!projectId) {
    if (input.requireProject) {
      throw new Error("Project scope requested but project ID is unavailable.");
    }
    return { scope: "global" };
  }
  return { scope: "project", projectId };
}

function formatNode(node: MemoryNode): string {
  const tags = node.tags.length > 0 ? ` tags=[${node.tags.join(", ")}]` : "";
  const scope = node.projectId ? `project:${node.projectId}` : node.scope;
  return `- ${node.key}: ${node.value}${tags} (${scope})`;
}

export function createMemoryCommands(): Record<string, CommandDefinition> {
  return {
    "memory.record": {
      description: "Record a memory entry in the knowledge graph",
      usage: "<key> <value> [--tags tag1,tag2]",
      async execute(ctx) {
        if (!ctx.deps.memory.enabled) return "Memory is disabled.";

        const named = ctx.parsed.named;
        const positional = ctx.parsed.positional;
        const raw = ctx.parsed.raw;

        let key = pickFirstString(named.key ?? named.k);
        let value = pickFirstString(named.value ?? named.v);

        if ((!key || !value) && raw.includes(":")) {
          const [head, ...rest] = raw.split(":");
          const candidateKey = head.trim();
          const candidateValue = rest.join(":").trim();
          if (candidateKey && candidateValue) {
            key = candidateKey;
            value = candidateValue;
          }
        }

        if (!key && positional.length >= 2) {
          key = positional[0];
          value = positional.slice(1).join(" ");
        }

        if (!key || !value) {
          return "Usage: /memory.record <key> <value> [--tags tag1,tag2]";
        }

        const tags = parseTags(pickFirstString(named.tags ?? named.tag));
        const scopeOverride = pickFirstString(named.scope) as MemoryScope | undefined;
        const requested =
          scopeOverride === "global" || scopeOverride === "project" ? scopeOverride : ctx.deps.memory.getScope();

        const { scope, projectId } = await resolveScope({
          api: ctx.deps.api,
          requested,
          requireProject: scopeOverride === "project",
          projectId: ctx.deps.memory.getProjectId(),
        });

        const node = await upsertMemory({
          scope,
          projectId,
          key,
          value,
          tags,
        });

        const backend = getMemoryBackend();
        return `Stored (${backend})\n${formatNode(node)}`;
      },
    },
    "memory.query": {
      description: "Query the memory graph",
      usage: "<query> [--limit 10]",
      async execute(ctx) {
        if (!ctx.deps.memory.enabled) return "Memory is disabled.";

        const named = ctx.parsed.named;
        const positional = ctx.parsed.positional;
        const query = pickFirstString(named.query) ?? positional.join(" ");
        const limitRaw = pickFirstString(named.limit);
        const parsedLimit = limitRaw ? Number(limitRaw) : undefined;
        const limit =
          Number.isFinite(parsedLimit ?? NaN) && (parsedLimit as number) > 0 ? (parsedLimit as number) : undefined;

        const scopeOverride = pickFirstString(named.scope) as MemoryScope | undefined;
        const requested =
          scopeOverride === "global" || scopeOverride === "project" ? scopeOverride : ctx.deps.memory.getScope();

        const { scope, projectId } = await resolveScope({
          api: ctx.deps.api,
          requested,
          requireProject: scopeOverride === "project",
          projectId: ctx.deps.memory.getProjectId(),
        });

        const results = query
          ? await searchMemory({ scope, projectId, query, limit })
          : await recentMemory({ scope, projectId, limit });

        if (results.length === 0) {
          return "No memory entries found.";
        }

        const backend = getMemoryBackend();
        const header = query ? `Results (${backend}) for "${query}"` : `Recent entries (${backend})`;
        return [header, ...results.map(formatNode)].join("\n");
      },
    },
  };
}

```

---

## File: commands/orchestrator-constants.ts

```typescript
export const DEMO_WORKER_ID = "glm47-vision-demo";
export const DEFAULT_WORKFLOW_ID = "bug-triage";
export const COUNCIL_TIMEBOX = "2 minutes";
export const MULTIMODAL_TIMEBOX = "2 minutes";

export const DEFAULT_COUNCIL_TOPIC =
  "Design a 5-minute onboarding path for new users. Focus on immediate value, not exhaustive coverage.";

export const DEFAULT_WORKFLOW_TASK =
  "Triage: Settings page shows an empty state during loading; suggest a fix and risks.";

```

---

## File: commands/orchestrator-council.ts

```typescript
import type { WorkerInstance, WorkerProfile } from "../types";
import { COUNCIL_TIMEBOX } from "./orchestrator-constants";
import { pickCouncilWorkers, pickSummaryWorkerId, truncateText } from "./orchestrator-utils";

type CouncilResponse = {
  workerId: string;
  response?: string;
  error?: string;
};

const formatCouncilResponses = (responses: CouncilResponse[]): string =>
  responses
    .map((result) => {
      if (result.error) {
        return `- ${result.workerId}: error (${result.error})`;
      }
      return `- ${result.workerId}: ${truncateText(result.response ?? "No response")}`;
    })
    .join("\n");

/** Run a short parallel "workers council" demo and summarize the results. */
export const runWorkersCouncil = async (input: {
  deps: {
    workers: {
      listProfiles: () => WorkerProfile[];
      send: (
        workerId: string,
        message: string,
        options?: { timeout?: number; from?: string },
      ) => Promise<{ success: boolean; response?: string; error?: string }>;
    };
    orchestrator: { ensureWorker: (input: { workerId: string; reason: "manual" }) => Promise<WorkerInstance> };
  };
  topic: string;
  timeoutMs: number;
}) => {
  const profiles = input.deps.workers.listProfiles();
  if (profiles.length === 0) {
    return "No worker profiles are available yet. Create a few skills to run the council.";
  }

  const councilIds = pickCouncilWorkers(profiles, 3);
  const prompt = [
    `Workers Council (${COUNCIL_TIMEBOX} timebox)`,
    `Topic: ${input.topic}`,
    "",
    "Return:",
    "- 2 bullet insights",
    "- 1 risk or assumption",
    "- 1 next step",
    "Keep it under 120 words.",
  ].join("\n");

  const settled = await Promise.allSettled(
    councilIds.map(async (workerId) => {
      await input.deps.orchestrator.ensureWorker({ workerId, reason: "manual" });
      const res = await input.deps.workers.send(workerId, prompt, { timeout: input.timeoutMs, from: "onboarding" });
      if (!res.success) {
        return { workerId, error: res.error ?? "worker error" } satisfies CouncilResponse;
      }
      return { workerId, response: res.response ?? "" } satisfies CouncilResponse;
    }),
  );

  const responses: CouncilResponse[] = settled.map((result, index) => {
    const workerId = councilIds[index] ?? `worker-${index + 1}`;
    if (result.status === "fulfilled") return result.value;
    return { workerId, error: result.reason instanceof Error ? result.reason.message : String(result.reason) };
  });

  const summaryWorkerId = pickSummaryWorkerId(profiles, ["reviewer", "product", "architect", "docs", "coder"]);
  let summaryText = "";
  if (summaryWorkerId) {
    try {
      await input.deps.orchestrator.ensureWorker({ workerId: summaryWorkerId, reason: "manual" });
      const summaryPrompt = [
        "Summarize the council responses into two short sections:",
        "Consensus Summary: 2-3 bullets.",
        "Next Steps: 2-3 bullets.",
        "",
        "Council responses:",
        formatCouncilResponses(responses),
      ].join("\n");
      const res = await input.deps.workers.send(summaryWorkerId, summaryPrompt, {
        timeout: Math.min(45_000, input.timeoutMs),
        from: "onboarding",
      });
      if (res.success && res.response) summaryText = res.response;
    } catch {
      summaryText = "";
    }
  }

  const fallbackNextSteps = [
    "Pick one worker to dive deeper on the highest-confidence insight.",
    "Run a built-in workflow to see multi-step orchestration.",
    "Tune worker profiles in Settings (model, temperature, enabled).",
  ];

  const summaryBlock =
    summaryText.trim().length > 0
      ? summaryText.trim()
      : `Consensus Summary:\n- The council produced ${responses.length} viewpoints on the onboarding focus.\n\nNext Steps:\n${fallbackNextSteps.map((s) => `- ${s}`).join("\n")}`;

  return ["Workers Council Output", formatCouncilResponses(responses), "", summaryBlock].join("\n");
};

```

---

## File: commands/orchestrator-image.ts

```typescript
import { deflateSync } from "node:zlib";

export type ImageAttachment = { type: "image"; base64: string; mimeType: string };

// Build a minimal in-memory PNG without external dependencies.
const createSolidPngBase64 = (width: number, height: number, rgba: [number, number, number, number]): string => {
  const rowSize = 1 + width * 4;
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowSize;
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = rowStart + 1 + x * 4;
      raw[offset] = rgba[0];
      raw[offset + 1] = rgba[1];
      raw[offset + 2] = rgba[2];
      raw[offset + 3] = rgba[3];
    }
  }

  const crcTable = new Uint32Array(256).map((_, i) => {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return c >>> 0;
  });
  const crc32 = (buf: Buffer) => {
    let crc = 0xffffffff;
    for (const b of buf) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ b) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  };

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw);
  return Buffer.concat([signature, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]).toString(
    "base64",
  );
};

/** Create a small red PNG payload for the vision demo when no image is provided. */
export const buildFallbackImage = (): ImageAttachment => {
  const base64 = createSolidPngBase64(64, 64, [220, 61, 45, 255]);
  return { type: "image", base64, mimeType: "image/png" };
};

```

---

## File: commands/orchestrator-multimodal.ts

```typescript
import { existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import type { WorkerInstance, WorkerProfile } from "../types";
import { DEMO_WORKER_ID, MULTIMODAL_TIMEBOX } from "./orchestrator-constants";
import { buildFallbackImage, type ImageAttachment } from "./orchestrator-image";
import { truncateText } from "./orchestrator-utils";

/** Run the multimodal demo (vision analysis + workflow run) for onboarding. */
export const runMultimodalDemo = async (input: {
  deps: {
    workers: {
      listProfiles: () => WorkerProfile[];
      send: (
        workerId: string,
        message: string,
        options?: {
          timeout?: number;
          from?: string;
          attachments?: Array<{ type: "image"; base64?: string; path?: string; mimeType?: string }>;
        },
      ) => Promise<{ success: boolean; response?: string; error?: string }>;
    };
    orchestrator: {
      ensureWorker: (input: { workerId: string; reason: "manual" }) => Promise<WorkerInstance>;
      runWorkflow: (input: { workflowId: string; task: string }) => Promise<{
        workflowId: string;
        workflowName: string;
        steps: Array<{
          id: string;
          title: string;
          workerId: string;
          status: string;
          response?: string;
          error?: string;
        }>;
      }>;
    };
  };
  imagePath?: string;
  base64?: string;
  mimeType?: string;
  workflowId: string;
  workflowTask: string;
  timeoutMs: number;
}) => {
  const profiles = input.deps.workers.listProfiles();
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const visionProfile =
    byId.get(DEMO_WORKER_ID) ?? profiles.find((profile) => profile.supportsVision) ?? byId.get("vision");

  if (!visionProfile) {
    return "No vision-capable worker is available. Add a vision profile to run the multimodal demo.";
  }

  const attachment: ImageAttachment | { type: "image"; path: string; mimeType?: string } =
    input.imagePath && existsSync(input.imagePath)
      ? { type: "image" as const, path: resolvePath(input.imagePath), mimeType: input.mimeType }
      : input.base64
        ? { type: "image" as const, base64: input.base64, mimeType: input.mimeType ?? "image/png" }
        : buildFallbackImage();

  await input.deps.orchestrator.ensureWorker({ workerId: visionProfile.id, reason: "manual" });
  const visionPrompt = [
    `Multimodal Demo (${MULTIMODAL_TIMEBOX} timebox)`,
    "Describe the image, call out any text, and give one actionable insight.",
  ].join("\n");
  const visionRes = await input.deps.workers.send(visionProfile.id, visionPrompt, {
    timeout: input.timeoutMs,
    from: "onboarding",
    attachments: [attachment],
  });

  let workflowOutput = "Workflow demo unavailable.";
  try {
    const workflowResult = await input.deps.orchestrator.runWorkflow({
      workflowId: input.workflowId,
      task: input.workflowTask,
    });
    const stepLines = workflowResult.steps.map((step) => {
      if (step.status === "error") {
        return `- ${step.title} (${step.workerId}): error (${step.error ?? "unknown"})`;
      }
      return `- ${step.title} (${step.workerId}): ${truncateText(step.response ?? "")}`;
    });
    workflowOutput = [`Workflow: ${workflowResult.workflowName} (${workflowResult.workflowId})`, ...stepLines].join(
      "\n",
    );
  } catch (err) {
    workflowOutput = `Workflow demo failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  const visionOutput = visionRes.success
    ? truncateText(visionRes.response ?? "No vision response returned.")
    : `Vision demo failed: ${visionRes.error ?? "unknown error"}`;

  const modelLabel = visionProfile.model ? ` (model: ${visionProfile.model})` : "";

  return [`Vision Output${modelLabel}`, visionOutput, "", workflowOutput].join("\n");
};

```

---

## File: commands/orchestrator-utils.ts

```typescript
import type { WorkerInstance, WorkerProfile } from "../types";

/** Format a single line describing a running worker. */
export const formatWorkerLine = (worker: WorkerInstance): string => {
  const name = worker.profile.name ? ` (${worker.profile.name})` : "";
  const port = worker.port ? ` port=${worker.port}` : "";
  const status = worker.status ? ` status=${worker.status}` : "";
  return `- ${worker.profile.id}${name}${status}${port} model=${worker.profile.model}`;
};

/** Format a profile summary line with running state. */
export const formatProfileLine = (profile: WorkerProfile, running: boolean): string => {
  const state = running ? "running" : "idle";
  return `- ${profile.id} (${state}) model=${profile.model}`;
};

/** Return the first string in a flag value that may be a string or string list. */
export const pickFirstString = (value: string | string[] | undefined): string | undefined => {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
};

/** Clamp long text output to a fixed number of characters. */
export const truncateText = (input: string, maxChars = 600): string => {
  if (input.length <= maxChars) return input;
  return `${input.slice(0, Math.max(0, maxChars - 3))}...`;
};

/** Choose a short list of preferred worker IDs for the council demo. */
export const pickCouncilWorkers = (profiles: WorkerProfile[], limit = 3): string[] => {
  const preferred = ["product", "architect", "coder", "reviewer", "analyst", "docs", "qa"];
  const available = new Set(profiles.map((profile) => profile.id));
  const picked = preferred.filter((id) => available.has(id)).slice(0, limit);
  if (picked.length >= limit) return picked;

  const fallback = profiles.map((profile) => profile.id).filter((id) => !picked.includes(id));
  return [...picked, ...fallback].slice(0, limit);
};

/** Pick a worker ID to summarize council responses. */
export const pickSummaryWorkerId = (profiles: WorkerProfile[], candidates: string[]): string | undefined => {
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  for (const id of candidates) {
    if (byId.has(id)) return id;
  }
  return profiles[0]?.id;
};

/** Build the status output for the orchestrator status command. */
export const buildStatusOutput = (input: {
  workers: WorkerInstance[];
  profiles: WorkerProfile[];
  autoSpawn: string[];
}): string => {
  const runningIds = new Set(input.workers.map((worker) => worker.profile.id));
  const lines: string[] = [];

  lines.push(`Workers: ${input.workers.length} running / ${input.profiles.length} profiles`);

  if (input.workers.length > 0) {
    lines.push("Running workers:");
    for (const worker of input.workers) {
      lines.push(formatWorkerLine(worker));
    }
  }

  if (input.profiles.length > 0) {
    lines.push("Profiles:");
    for (const profile of input.profiles) {
      lines.push(formatProfileLine(profile, runningIds.has(profile.id)));
    }
  }

  if (input.autoSpawn.length > 0) {
    lines.push(`Auto-spawn: ${input.autoSpawn.join(", ")}`);
  }

  return lines.join("\n");
};

/** Resolve a worker ID from parsed command arguments. */
export const pickWorkerId = (positional: string[], named: Record<string, string | string[]>): string | undefined => {
  const namedId = named.workerId ?? named.profileId ?? named.id;
  if (Array.isArray(namedId)) return namedId[0];
  if (typeof namedId === "string" && namedId.trim()) return namedId.trim();
  if (positional.length > 0) return positional[0];
  return undefined;
};

```

---

## File: commands/orchestrator.ts

```typescript
import type { CommandDefinition } from "./index";
import { DEFAULT_COUNCIL_TOPIC, DEFAULT_WORKFLOW_ID, DEFAULT_WORKFLOW_TASK } from "./orchestrator-constants";
import { runWorkersCouncil } from "./orchestrator-council";
import { runMultimodalDemo } from "./orchestrator-multimodal";
import { buildStatusOutput, pickFirstString, pickWorkerId } from "./orchestrator-utils";

/** Build the orchestrator command table using the configured command prefix. */
export function createOrchestratorCommands(input: { prefix: string }): Record<string, CommandDefinition> {
  const prefix = input.prefix;
  const baseName = prefix.endsWith(".") ? prefix.slice(0, -1) : prefix;
  const statusName = `${prefix}status`;
  const spawnName = `${prefix}spawn`;
  const stopName = `${prefix}stop`;
  const demoName = `${prefix}demo`;
  const onboardName = `${prefix}onboard`;
  const helpName = `${prefix}help`;
  const listName = `${prefix}list`;
  const listWorkersName = `${prefix}list_workers`;

  const helpTarget = baseName || helpName;
  const listTarget = baseName || listName;
  const statusTarget = baseName || statusName;
  const spawnTarget = baseName || spawnName;
  const stopTarget = baseName || stopName;
  const demoTarget = baseName || demoName;
  const onboardTarget = baseName || onboardName;

  const helpCommand: CommandDefinition = {
    description: "Show available orchestrator commands",
    async execute(_ctx) {
      const lines: string[] = [
        "Orchestrator Commands",
        "",
        `/${helpTarget} help`,
        "  Show this help message",
        "",
        `/${listTarget} list`,
        "  List all running workers with their status",
        "",
        `/${statusTarget} status`,
        "  Show orchestrator status (workers + profiles)",
        "",
        `/${spawnTarget} spawn <profileId>`,
        "  Spawn a worker by profile ID",
        "",
        `/${stopTarget} stop <profileId|all>`,
        "  Stop a running worker (or all workers)",
        "",
        `/${demoTarget} demo`,
        "  Run a short orchestrator demo",
        "",
        `/${onboardTarget} onboard [council|multimodal|all]`,
        "  Run the 5-minute onboarding flow",
        "",
        "/vision.analyze [--path <file>] [--prompt <text>]",
        "  Analyze an image from clipboard or file",
        "",
        "/memory.record <key> <value> [--tags tag1,tag2]",
        "  Record a memory entry",
        "",
        "/memory.query <query> [--limit 10]",
        "  Query the memory graph",
      ];
      return lines.join("\n");
    },
  };

  const listCommand: CommandDefinition = {
    description: "List all running workers",
    async execute(ctx) {
      const workers = ctx.deps.workers.listWorkers();

      if (workers.length === 0) {
        return "No workers are currently running.";
      }

      const lines: string[] = [`Running Workers (${workers.length})`, ""];

      for (const worker of workers) {
        const name = worker.profile.name || worker.profile.id;
        const model = worker.profile.model;
        const port = worker.port ? `port ${worker.port}` : "no port";
        const status = worker.status || "unknown";
        const vision = worker.profile.supportsVision ? " [vision]" : "";

        lines.push(`${name}`);
        lines.push(`  ID: ${worker.profile.id}`);
        lines.push(`  Model: ${model}${vision}`);
        lines.push(`  Status: ${status}`);
        lines.push(`  Port: ${port}`);
        lines.push("");
      }

      return lines.join("\n").trimEnd();
    },
  };

  const statusCommand: CommandDefinition = {
    description: "Show orchestrator worker status",
    async execute(ctx) {
      const workers = ctx.deps.workers.listWorkers();
      const profiles = ctx.deps.workers.listProfiles();
      const autoSpawn = ctx.deps.config.spawn ?? [];
      return buildStatusOutput({ workers, profiles, autoSpawn });
    },
  };

  const spawnCommand: CommandDefinition = {
    description: "Spawn a worker by profile ID",
    usage: "<profileId>",
    async execute(ctx) {
      const workerId = pickWorkerId(ctx.parsed.positional, ctx.parsed.named);
      if (!workerId) {
        return `Usage: /${spawnName} <profileId>`;
      }

      const profile = ctx.deps.workers.getProfile(workerId);
      if (!profile) {
        const available = ctx.deps.workers
          .listProfiles()
          .map((p) => p.id)
          .join(", ");
        return `Unknown profile "${workerId}". Available: ${available || "none"}.`;
      }

      const worker = await ctx.deps.orchestrator.ensureWorker({ workerId, reason: "manual" });
      return `Spawned ${worker.profile.id} (${worker.profile.model}) on port ${worker.port}.`;
    },
  };

  const stopCommand: CommandDefinition = {
    description: "Stop a running worker",
    usage: "<profileId|all>",
    async execute(ctx) {
      const workerId = pickWorkerId(ctx.parsed.positional, ctx.parsed.named);
      if (!workerId || workerId === "all") {
        const workers = ctx.deps.workers.listWorkers();
        if (workers.length === 0) {
          return "No workers are currently running.";
        }
        const results = await Promise.allSettled(
          workers.map((worker) => ctx.deps.workers.stopWorker(worker.profile.id)),
        );
        const stopped = results.filter((result) => result.status === "fulfilled" && result.value).length;
        const failed = results.length - stopped;
        if (failed > 0) {
          return `Stopped ${stopped}/${results.length} workers. ${failed} failed to stop.`;
        }
        return `Stopped ${stopped} workers.`;
      }

      try {
        const stopped = await ctx.deps.workers.stopWorker(workerId);
        if (!stopped) return `Worker "${workerId}" is not running.`;
        return `Stopped ${workerId}.`;
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return `Failed to stop ${workerId}: ${error}`;
      }
    },
  };

  const demoCommand: CommandDefinition = {
    description: "Run a short orchestrator demo",
    async execute(ctx) {
      const targets = ["vision", "docs", "memory"].filter((id) => ctx.deps.workers.getProfile(id));
      const results = await Promise.allSettled(
        targets.map((id) => ctx.deps.orchestrator.ensureWorker({ workerId: id, reason: "manual" })),
      );

      const lines: string[] = ["Spawning workers..."];
      results.forEach((result, index) => {
        const id = targets[index];
        if (!id) return;
        if (result.status === "fulfilled") {
          const name = result.value.profile.name || id;
          lines.push(`OK ${name} ready`);
        } else {
          const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
          lines.push(`ERROR ${id}: ${error}`);
        }
      });

      lines.push("");
      lines.push("Try these:");
      lines.push("1. Paste a screenshot to analyze");
      lines.push("2. Ask: What does the useState hook do?");
      lines.push("3. Say: Remember that we prefer TypeScript");

      return lines.join("\n");
    },
  };

  const onboardCommand: CommandDefinition = {
    description: "Run the 5-minute onboarding flow (council + multimodal demo)",
    usage: "[council|multimodal|all] [--topic <text>] [--image <path>] [--workflow <id>]",
    async execute(ctx) {
      const modeRaw = ctx.parsed.positional[0] ?? pickFirstString(ctx.parsed.named.mode) ?? "all";
      const mode = modeRaw.toLowerCase();
      const topic =
        pickFirstString(ctx.parsed.named.topic) ??
        pickFirstString(ctx.parsed.named.task) ??
        DEFAULT_COUNCIL_TOPIC;
      const workflowId = pickFirstString(ctx.parsed.named.workflow) ?? DEFAULT_WORKFLOW_ID;
      const workflowTask =
        pickFirstString(ctx.parsed.named.workflowTask) ??
        pickFirstString(ctx.parsed.named["workflow-task"]) ??
        DEFAULT_WORKFLOW_TASK;
      const imagePath = pickFirstString(ctx.parsed.named.image);
      const base64 = pickFirstString(ctx.parsed.named.base64);
      const mimeType =
        pickFirstString(ctx.parsed.named.mime) ??
        pickFirstString(ctx.parsed.named.mimeType) ??
        pickFirstString(ctx.parsed.named["mime-type"]);

      const timeoutMs = 75_000;

      if (mode === "council") {
        return await runWorkersCouncil({ deps: ctx.deps, topic, timeoutMs });
      }
      if (mode === "multimodal") {
        return await runMultimodalDemo({
          deps: ctx.deps,
          imagePath,
          base64,
          mimeType,
          workflowId,
          workflowTask,
          timeoutMs,
        });
      }

      const council = await runWorkersCouncil({ deps: ctx.deps, topic, timeoutMs });
      const multimodal = await runMultimodalDemo({
        deps: ctx.deps,
        imagePath,
        base64,
        mimeType,
        workflowId,
        workflowTask,
        timeoutMs,
      });

      return ["Onboarding Flow (<=5 minutes)", "", council, "", multimodal].join("\n");
    },
  };

  const commands: Record<string, CommandDefinition> = {
    [helpName]: helpCommand,
    [listName]: listCommand,
    [listWorkersName]: listCommand,
    [statusName]: statusCommand,
    [spawnName]: spawnCommand,
    [stopName]: stopCommand,
    [demoName]: demoCommand,
    [onboardName]: onboardCommand,
  };

  if (baseName) {
    const aliasMap: Record<string, string> = {
      help: helpName,
      list: listName,
      workers: listName,
      status: statusName,
      spawn: spawnName,
      stop: stopName,
      demo: demoName,
      onboard: onboardName,
      onboarding: onboardName,
      council: onboardName,
      multimodal: onboardName,
    };

    commands[baseName] = {
      description: "Orchestrator command router (verb-based)",
      usage: "<action> [args]",
      async execute(ctx) {
        const [verbRaw, ...rest] = ctx.parsed.positional;
        if (!verbRaw) {
          return commands[helpName].execute(ctx);
        }

        const verb = verbRaw.toLowerCase();
        const target = aliasMap[verb];
        if (!target) {
          return `Unknown action "${verb}". Try /${helpTarget} help.`;
        }

        const nextPositional = verb === "council" || verb === "multimodal" ? [verb, ...rest] : rest;
        const nextParsed = {
          ...ctx.parsed,
          positional: nextPositional,
          tokens: nextPositional,
          raw: nextPositional.join(" "),
        };

        return commands[target].execute({ ...ctx, parsed: nextParsed });
      },
    };
  }

  return commands;
}

```

---

## File: commands/vision.ts

```typescript
import { existsSync } from "node:fs";
import { isAbsolute, resolve as resolvePath } from "node:path";
import { extractVisionAttachments, formatVisionAnalysis, type VisionPart } from "../ux/vision-routing";
import type { CommandDefinition } from "./index";

const DEFAULT_PROMPT =
  "Analyze this image and describe what you see. Focus on any text, code, UI elements, errors, or relevant details.";

function resolveCandidatePath(projectDir: string, inputPath: string): string {
  if (isAbsolute(inputPath)) return inputPath;
  return resolvePath(projectDir, inputPath);
}

function pickFirstString(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

export function createVisionCommands(): Record<string, CommandDefinition> {
  return {
    "vision.analyze": {
      description: "Analyze an image from the clipboard or a file",
      usage: "[--path <file>] [--prompt <text>]",
      async execute(ctx) {
        const named = ctx.parsed.named;
        const positional = ctx.parsed.positional;

        const explicitPath = pickFirstString(named.path ?? named.file);
        let candidatePath: string | undefined;
        let remainingPositional = positional;

        if (explicitPath) {
          candidatePath = resolveCandidatePath(ctx.deps.projectDir, explicitPath);
        } else if (positional.length > 0) {
          const guess = resolveCandidatePath(ctx.deps.projectDir, positional[0]);
          if (existsSync(guess)) {
            candidatePath = guess;
            remainingPositional = positional.slice(1);
          }
        }

        if (candidatePath && !existsSync(candidatePath)) {
          return `File not found: ${candidatePath}`;
        }

        const promptOverride =
          pickFirstString(named.prompt ?? named.question) ||
          (remainingPositional.length > 0 ? remainingPositional.join(" ") : undefined);
        const prompt = promptOverride?.trim() || process.env.OPENCODE_VISION_PROMPT?.trim() || DEFAULT_PROMPT;

        if (!ctx.deps.workers.getProfile("vision")) {
          return "Vision profile is not available.";
        }

        const mimeType = pickFirstString(named.mime ?? named.mimeType);
        const base64 = pickFirstString(named.base64);
        const parts: VisionPart[] = [];

        if (base64) {
          parts.push({ type: "image", base64, ...(mimeType ? { mimeType } : {}) });
        } else if (candidatePath) {
          parts.push({ type: "image", url: candidatePath, ...(mimeType ? { mimeType } : {}) });
        } else {
          parts.push({ type: "image", url: "clipboard" });
        }

        const attachments = await extractVisionAttachments(parts);
        if (attachments.length === 0) {
          return "No image was found in the clipboard or provided file.";
        }

        await ctx.deps.orchestrator.ensureWorker({ workerId: "vision", reason: "manual" });

        const timeoutMsRaw = pickFirstString(named.timeoutMs ?? named.timeout);
        const parsedTimeout = timeoutMsRaw ? Number(timeoutMsRaw) : undefined;
        const timeoutMs =
          Number.isFinite(parsedTimeout ?? NaN) && (parsedTimeout as number) > 0
            ? (parsedTimeout as number)
            : undefined;

        const res = await ctx.deps.workers.send("vision", prompt, {
          attachments,
          ...(timeoutMs ? { timeout: timeoutMs } : {}),
          from: ctx.input.agent ?? "orchestrator",
        });

        const analysis = formatVisionAnalysis({ response: res.response, error: res.error });
        return analysis;
      },
    },
  };
}

```

---

## File: communication/events.ts

```typescript
import type { Event as OpenCodeEvent } from "@opencode-ai/sdk";
import type { Skill, SkillScope, WorkerForwardEvent, WorkerInstance, WorkerSessionMode } from "../types";
import type { WorkerJob } from "../workers/jobs";

export type OrchestraEventMeta = {
  source: "orchestrator" | "worker" | "sdk" | "session-manager" | "event-forwarding" | "vision";
  sessionId?: string;
  workerId?: string;
  jobId?: string;
};

// Session-related event payloads
export type SessionCreatedPayload = {
  session: {
    workerId: string;
    sessionId: string;
    mode: WorkerSessionMode;
    parentSessionId?: string;
    serverUrl?: string;
    createdAt: string;
    lastActivity: string;
    status: string;
    messageCount: number;
    toolCount: number;
    recentActivityCount: number;
    error?: string;
  };
};

export type SessionActivityPayload = {
  sessionId: string;
  workerId: string;
  activity: {
    id: string;
    type: WorkerForwardEvent;
    timestamp: string;
    summary: string;
  };
};

export type SessionStatusPayload = {
  sessionId: string;
  workerId: string;
  status: string;
  error?: string;
};

export type SessionClosedPayload = {
  sessionId: string;
  workerId: string;
};

export type SessionErrorPayload = {
  workerId: string;
  sessionId?: string;
  error: string;
};

export type StreamChunk = {
  workerId: string;
  jobId?: string;
  chunk: string;
  timestamp: number;
  final?: boolean;
};

export type SubagentSessionInfo = {
  workerId: string;
  sessionId: string;
  parentSessionId?: string;
  profile?: { id: string; name: string; model?: string };
  serverUrl?: string;
  status?: string;
};

export type SubagentActivePayload = {
  subagent: SubagentSessionInfo;
};

export type SubagentClosedPayload = {
  subagent: SubagentSessionInfo;
  result?: { summary?: string; error?: string };
};

export type ModelResolution = {
  profileId: string;
  from: string;
  to: string;
  reason: string;
};

export type OrchestraEventMap = {
  "orchestra.server.event": { event: OpenCodeEvent };
  "orchestra.started": { profileCount: number; autoSpawn: string[]; fallbackModel?: string };
  "orchestra.model.resolved": { resolution: ModelResolution };
  "orchestra.model.fallback": { profileId: string; model: string; reason: string };
  "orchestra.worker.spawned": { worker: WorkerInstance };
  "orchestra.worker.created": { worker: WorkerInstance };
  "orchestra.worker.reused": { worker: WorkerInstance };
  "orchestra.worker.ready": { worker: WorkerInstance };
  "orchestra.worker.busy": { worker: WorkerInstance };
  "orchestra.worker.error": { worker: WorkerInstance; error: string };
  "orchestra.worker.completed": { worker: WorkerInstance; jobId?: string; response?: string };
  "orchestra.worker.stopped": { worker: WorkerInstance };
  "orchestra.worker.job": { job: WorkerJob; status: "created" | "succeeded" | "failed" };
  "orchestra.worker.stream": { chunk: StreamChunk };
  "orchestra.worker.response": { worker: WorkerInstance; response: string; jobId?: string };
  "orchestra.worker.wakeup": { workerId: string; jobId?: string; reason: string; summary?: string };
  "orchestra.vision.started": { sessionId: string; messageId?: string; jobId?: string };
  "orchestra.vision.completed": { success: boolean; error?: string; durationMs?: number; jobId?: string };
  // Session events
  "orchestra.session.created": SessionCreatedPayload;
  "orchestra.session.activity": SessionActivityPayload;
  "orchestra.session.status": SessionStatusPayload;
  "orchestra.session.closed": SessionClosedPayload;
  "orchestra.session.error": SessionErrorPayload;
  // Subagent events
  "orchestra.subagent.active": SubagentActivePayload;
  "orchestra.subagent.closed": SubagentClosedPayload;
  // Skill events
  "skill.created": { skill: Skill };
  "skill.updated": { skill: Skill };
  "skill.deleted": { id: string; scope: SkillScope };
};

export type OrchestraEventName = keyof OrchestraEventMap;

export type OrchestraEvent<T extends OrchestraEventName> = {
  type: T;
  meta: OrchestraEventMeta;
  data: OrchestraEventMap[T];
};

```

---

## File: communication/index.ts

```typescript
import { EventEmitter } from "node:events";
import type { Event as OpenCodeEvent } from "@opencode-ai/sdk";
import type { ApiService } from "../api";
import type { Factory, ServiceLifecycle } from "../types";
import type { OrchestraEvent, OrchestraEventMap, OrchestraEventMeta, OrchestraEventName } from "./events";

export type CommunicationConfig = {
  maxListeners?: number;
  enableSdkEvents?: boolean;
};

export type CommunicationDeps = {
  api: ApiService;
};

export type CommunicationService = ServiceLifecycle & {
  emit: <T extends OrchestraEventName>(type: T, data: OrchestraEventMap[T], meta: OrchestraEventMeta) => void;
  on: <T extends OrchestraEventName>(type: T, handler: (event: OrchestraEvent<T>) => void) => () => void;
  off: <T extends OrchestraEventName>(type: T, handler: (event: OrchestraEvent<T>) => void) => void;
};

export const createCommunication: Factory<CommunicationConfig, CommunicationDeps, CommunicationService> = ({
  config,
  deps,
}) => {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(config.maxListeners ?? 50);
  const enableSdkEvents = config.enableSdkEvents !== false;

  type AnyOrchestraEventHandler = (event: OrchestraEvent<OrchestraEventName>) => void;
  type EventStreamResult = {
    stream: AsyncGenerator<OpenCodeEvent, unknown, unknown>;
  };

  let abortController: AbortController | undefined;
  let streamTask: Promise<void> | undefined;

  // Forward orchestra events to the SSE stream for frontend visibility
  const forwardToSse = <T extends OrchestraEventName>(
    type: T,
    data: OrchestraEventMap[T],
    meta: OrchestraEventMeta,
  ) => {
    // Forward worker events, session events, orchestrator lifecycle, and model events
    if (
      type.startsWith("orchestra.worker.") ||
      type.startsWith("orchestra.session.") ||
      type.startsWith("orchestra.subagent.") ||
      type.startsWith("orchestra.model.") ||
      type === "orchestra.started" ||
      type.startsWith("skill.")
    ) {
      deps.api.tui
        .publish({
          body: {
            type: "orchestra.event",
            payload: { type, data, meta },
          },
        })
        .catch(() => {});
    }
  };

  const emit = <T extends OrchestraEventName>(type: T, data: OrchestraEventMap[T], meta: OrchestraEventMeta) => {
    emitter.emit(type, { type, data, meta } satisfies OrchestraEvent<T>);
    forwardToSse(type, data, meta);
  };

  const on = <T extends OrchestraEventName>(type: T, handler: (event: OrchestraEvent<T>) => void) => {
    emitter.on(type, handler as AnyOrchestraEventHandler);
    return () => emitter.off(type, handler as AnyOrchestraEventHandler);
  };

  const off = <T extends OrchestraEventName>(type: T, handler: (event: OrchestraEvent<T>) => void) => {
    emitter.off(type, handler as AnyOrchestraEventHandler);
  };

  return {
    emit,
    on,
    off,
    start: async () => {
      if (!enableSdkEvents) return;
      if (abortController) return;
      abortController = new AbortController();

      try {
        const result = (await deps.api.event.subscribe({ signal: abortController.signal })) as EventStreamResult;
        streamTask = (async () => {
          try {
            for await (const event of result.stream) {
              emit("orchestra.server.event", { event }, { source: "sdk" });
            }
          } catch {
            // ignore stream errors
          }
        })();
      } catch {
        // event subscription failed (non-fatal)
        abortController = undefined;
      }
    },
    stop: async () => {
      abortController?.abort();
      abortController = undefined;
      if (streamTask) {
        try {
          await streamTask;
        } catch {
          // ignore stream errors
        }
        streamTask = undefined;
      }
      emitter.removeAllListeners();
    },
    health: async () => ({ ok: true }),
  };
};

```

---

## File: config/opencode.ts

```typescript
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { deepMerge, getUserConfigDir, isPlainObject } from "../helpers/format";

const ORCHESTRATOR_PLUGIN_SUFFIXES = ["orchestrator.js", "orchestrator.mjs", "orchestrator.cjs", "orchestrator.ts"];
const ORCHESTRATOR_PLUGIN_PACKAGE = "@open-orchestra/opencode-orchestrator";

function isOrchestratorPlugin(entry: string): boolean {
  const normalized = entry.toLowerCase();
  if (normalized.includes(ORCHESTRATOR_PLUGIN_PACKAGE)) return true;
  return ORCHESTRATOR_PLUGIN_SUFFIXES.some((suffix) => normalized.includes(suffix));
}

function normalizePlugins(value: unknown, dropOrchestrator: boolean): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => typeof entry === "string")
    .filter((entry) => {
      if (!dropOrchestrator) return true;
      return !isOrchestratorPlugin(entry);
    });
}

function mergePlugins(
  base: unknown,
  override: unknown,
  options?: { dropOrchestrator?: boolean; append?: string[] },
): string[] {
  const dropOrchestrator = options?.dropOrchestrator ?? false;
  const baseList = normalizePlugins(base, dropOrchestrator);
  const overrideList = normalizePlugins(override, dropOrchestrator);
  const appendList = normalizePlugins(options?.append, dropOrchestrator);
  const merged = [...baseList, ...overrideList, ...appendList];
  return [...new Set(merged)];
}

export async function loadOpenCodeConfig(): Promise<Record<string, unknown>> {
  const configPath = join(getUserConfigDir(), "opencode", "opencode.json");
  if (!existsSync(configPath)) return {};
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function extractIntegrationsFromOpenCodeConfig(
  config: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!isPlainObject(config.integrations)) return undefined;
  return config.integrations as Record<string, unknown>;
}

export async function mergeOpenCodeConfig(
  override?: Record<string, unknown>,
  options?: { dropOrchestratorPlugin?: boolean; appendPlugins?: string[]; baseConfig?: unknown },
): Promise<Record<string, unknown>> {
  const base = options?.baseConfig ?? (await loadOpenCodeConfig());
  const baseRecord = isPlainObject(base) ? base : undefined;
  if (!override || Object.keys(override).length === 0) {
    if (options?.dropOrchestratorPlugin || (options?.appendPlugins?.length ?? 0) > 0) {
      const merged = baseRecord ? { ...baseRecord } : {};
      merged.plugin = mergePlugins(baseRecord?.plugin, undefined, {
        dropOrchestrator: options?.dropOrchestratorPlugin,
        append: options?.appendPlugins,
      });
      return merged;
    }
    return baseRecord ? baseRecord : {};
  }
  if (!baseRecord) {
    const merged = { ...override };
    merged.plugin = mergePlugins(undefined, override?.plugin, {
      dropOrchestrator: options?.dropOrchestratorPlugin,
      append: options?.appendPlugins,
    });
    return merged;
  }
  const merged = deepMerge(baseRecord, override);
  merged.plugin = mergePlugins(baseRecord?.plugin, override?.plugin, {
    dropOrchestrator: options?.dropOrchestratorPlugin,
    append: options?.appendPlugins,
  });
  return merged;
}

```

---

## File: config/orchestrator.ts

```typescript
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { canAutoSpawn, canSpawnOnDemand, canWarmPool } from "../core/spawn-policy";
import { deepMerge } from "../helpers/format";
import type { OrchestratorConfig, OrchestratorConfigFile } from "../types";
import { extractIntegrationsFromOpenCodeConfig, loadOpenCodeConfig } from "./opencode";
import { buildDefaultOrchestratorConfigFile } from "./orchestrator/defaults";
import { collectProfilesAndSpawn, parseOrchestratorConfigFile } from "./orchestrator/parse";
import {
  getDefaultGlobalOpenCodeConfigPath,
  getDefaultGlobalOrchestratorConfigPath,
  getDefaultProjectOrchestratorConfigPath,
} from "./orchestrator/paths";

const mergeOpenCodeIntegrations = (
  defaults: Record<string, unknown> | undefined,
  openCode: Record<string, unknown> | undefined,
  orchestrator: Record<string, unknown> | undefined,
): Record<string, unknown> => {
  const base = defaults ?? {};
  const mergedOpenCode = openCode ? deepMerge(base, openCode) : base;
  return orchestrator ? deepMerge(mergedOpenCode, orchestrator) : mergedOpenCode;
};

export type LoadedOrchestratorConfig = {
  config: OrchestratorConfig;
  sources: { global?: string; project?: string };
};

export {
  getDefaultGlobalOrchestratorConfigPath,
  getDefaultGlobalOpenCodeConfigPath,
  getDefaultProjectOrchestratorConfigPath,
};

export async function loadOrchestratorConfig(input: {
  directory: string;
  worktree?: string;
}): Promise<LoadedOrchestratorConfig> {
  const defaultsFile = buildDefaultOrchestratorConfigFile();

  const globalPath = getDefaultGlobalOrchestratorConfigPath();
  const projectCandidates = [
    getDefaultProjectOrchestratorConfigPath(input.directory),
    input.worktree ? getDefaultProjectOrchestratorConfigPath(input.worktree) : undefined,
    // Fallback to orchestra/ subdirectory (for monorepo development setups)
    join(input.directory, "orchestra", ".opencode", "orchestrator.json"),
    input.worktree ? join(input.worktree, "orchestra", ".opencode", "orchestrator.json") : undefined,
    join(input.directory, "orchestrator.json"),
    input.worktree ? join(input.worktree, "orchestrator.json") : undefined,
  ].filter(Boolean) as string[];

  const sources: LoadedOrchestratorConfig["sources"] = {};

  const globalPartial = await (async () => {
    if (!existsSync(globalPath)) return {};
    sources.global = globalPath;
    try {
      const raw = JSON.parse(await readFile(globalPath, "utf8")) as unknown;
      return parseOrchestratorConfigFile(raw);
    } catch {
      return {};
    }
  })();

  const projectPath = projectCandidates.find((p) => existsSync(p));
  const projectPartial = await (async () => {
    if (!projectPath) return {};
    sources.project = projectPath;
    try {
      const raw = JSON.parse(await readFile(projectPath, "utf8")) as unknown;
      return parseOrchestratorConfigFile(raw);
    } catch {
      return {};
    }
  })();

  const openCodeConfig = await loadOpenCodeConfig();
  const openCodeIntegrations = extractIntegrationsFromOpenCodeConfig(openCodeConfig);

  const mergedFile = deepMerge(
    deepMerge(defaultsFile as unknown as Record<string, unknown>, globalPartial as unknown as Record<string, unknown>),
    projectPartial as unknown as Record<string, unknown>,
  ) as unknown as OrchestratorConfigFile;
  const orchestratorIntegrations = deepMerge(
    (globalPartial.integrations ?? {}) as Record<string, unknown>,
    (projectPartial.integrations ?? {}) as Record<string, unknown>,
  );
  const mergedIntegrations = mergeOpenCodeIntegrations(
    defaultsFile.integrations as Record<string, unknown> | undefined,
    openCodeIntegrations,
    orchestratorIntegrations,
  );

  const { profiles, spawn } = collectProfilesAndSpawn(mergedFile);
  const spawnPolicy = (mergedFile.spawnPolicy ?? defaultsFile.spawnPolicy) as OrchestratorConfig["spawnPolicy"];
  const spawnList = spawn.filter((id) => canAutoSpawn(spawnPolicy, id));
  const spawnOnDemand = (mergedFile.spawnOnDemand ?? defaultsFile.spawnOnDemand ?? []).filter((id) =>
    canSpawnOnDemand(spawnPolicy, id),
  );

  const warmPool = (() => {
    const base = (mergedFile.warmPool ?? defaultsFile.warmPool) as OrchestratorConfig["warmPool"];
    if (!base?.profiles) return base;
    const nextProfiles: Record<string, { size?: number; idleTimeoutMs?: number }> = {};
    for (const [id, cfg] of Object.entries(base.profiles)) {
      if (!canWarmPool(spawnPolicy, id)) continue;
      nextProfiles[id] = cfg ?? {};
    }
    return { ...base, profiles: nextProfiles };
  })();

  const config: OrchestratorConfig = {
    basePort: mergedFile.basePort ?? defaultsFile.basePort ?? 14096,
    autoSpawn: mergedFile.autoSpawn ?? defaultsFile.autoSpawn ?? false,
    spawnOnDemand,
    spawnPolicy,
    startupTimeout: mergedFile.startupTimeout ?? defaultsFile.startupTimeout ?? 30000,
    healthCheckInterval: mergedFile.healthCheckInterval ?? defaultsFile.healthCheckInterval ?? 30000,
    healthCheck: (mergedFile.healthCheck ?? defaultsFile.healthCheck) as OrchestratorConfig["healthCheck"],
    warmPool,
    modelSelection: (mergedFile.modelSelection ?? defaultsFile.modelSelection) as OrchestratorConfig["modelSelection"],
    modelAliases: (mergedFile.modelAliases ?? defaultsFile.modelAliases) as OrchestratorConfig["modelAliases"],
    ui: (mergedFile.ui ?? defaultsFile.ui) as OrchestratorConfig["ui"],
    notifications: (mergedFile.notifications ?? defaultsFile.notifications) as OrchestratorConfig["notifications"],
    agent: (mergedFile.agent ?? defaultsFile.agent) as OrchestratorConfig["agent"],
    commands: (mergedFile.commands ?? defaultsFile.commands) as OrchestratorConfig["commands"],
    pruning: (mergedFile.pruning ?? defaultsFile.pruning) as OrchestratorConfig["pruning"],
    workflows: (mergedFile.workflows ?? defaultsFile.workflows) as OrchestratorConfig["workflows"],
    security: (mergedFile.security ?? defaultsFile.security) as OrchestratorConfig["security"],
    memory: (mergedFile.memory ?? defaultsFile.memory) as OrchestratorConfig["memory"],
    integrations: mergedIntegrations as OrchestratorConfig["integrations"],
    telemetry: (mergedFile.telemetry ?? defaultsFile.telemetry) as OrchestratorConfig["telemetry"],
    profiles,
    spawn: spawnList,
  };

  return { config: applyEnvOverrides(config), sources };
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return items.length > 0 ? items : [];
}

function applyEnvOverrides(config: OrchestratorConfig): OrchestratorConfig {
  const autoSpawn = parseBoolean(process.env.OPENCODE_ORCH_AUTO_SPAWN);
  const spawnOnDemand = parseList(process.env.OPENCODE_ORCH_SPAWN_ON_DEMAND);
  const basePort = parseNumber(process.env.OPENCODE_ORCH_BASE_PORT);
  const startupTimeout = parseNumber(process.env.OPENCODE_ORCH_STARTUP_TIMEOUT_MS);
  const healthCheckInterval = parseNumber(process.env.OPENCODE_ORCH_HEALTH_INTERVAL_MS);

  const commandsEnabled = parseBoolean(process.env.OPENCODE_ORCH_COMMANDS);
  const commandPrefix = process.env.OPENCODE_ORCH_COMMAND_PREFIX?.trim();

  const uiToasts = parseBoolean(process.env.OPENCODE_ORCH_UI_TOASTS);
  const uiWakeup = parseBoolean(process.env.OPENCODE_ORCH_UI_WAKEUP);
  const uiFirstRunDemo = parseBoolean(process.env.OPENCODE_ORCH_UI_FIRST_RUN_DEMO);

  const memoryEnabled = parseBoolean(process.env.OPENCODE_ORCH_MEMORY);
  const workflowsEnabled = parseBoolean(process.env.OPENCODE_ORCH_WORKFLOWS);
  const pruningEnabled = parseBoolean(process.env.OPENCODE_ORCH_PRUNING);
  const telemetryEnabled = parseBoolean(process.env.OPENCODE_ORCH_TELEMETRY);

  return {
    ...config,
    ...(autoSpawn !== undefined ? { autoSpawn } : {}),
    ...(spawnOnDemand !== undefined ? { spawnOnDemand } : {}),
    ...(basePort !== undefined ? { basePort } : {}),
    ...(startupTimeout !== undefined ? { startupTimeout } : {}),
    ...(healthCheckInterval !== undefined ? { healthCheckInterval } : {}),
    ...(commandsEnabled !== undefined || commandPrefix
      ? {
          commands: {
            ...config.commands,
            ...(commandsEnabled !== undefined ? { enabled: commandsEnabled } : {}),
            ...(commandPrefix ? { prefix: commandPrefix } : {}),
          },
        }
      : {}),
    ...(uiToasts !== undefined || uiWakeup !== undefined || uiFirstRunDemo !== undefined
      ? {
          ui: {
            ...config.ui,
            ...(uiToasts !== undefined ? { toasts: uiToasts } : {}),
            ...(uiWakeup !== undefined ? { wakeupInjection: uiWakeup } : {}),
            ...(uiFirstRunDemo !== undefined ? { firstRunDemo: uiFirstRunDemo } : {}),
          },
        }
      : {}),
    ...(memoryEnabled !== undefined
      ? { memory: { ...config.memory, enabled: memoryEnabled } }
      : {}),
    ...(workflowsEnabled !== undefined
      ? { workflows: { ...config.workflows, enabled: workflowsEnabled } }
      : {}),
    ...(pruningEnabled !== undefined ? { pruning: { ...config.pruning, enabled: pruningEnabled } } : {}),
    ...(telemetryEnabled !== undefined ? { telemetry: { ...config.telemetry, enabled: telemetryEnabled } } : {}),
  };
}

```

---

## File: config/orchestrator/defaults.ts

```typescript
import type { OrchestratorConfigFile } from "../../types";

export function buildDefaultOrchestratorConfigFile(): OrchestratorConfigFile {
  return {
    basePort: 14096,
    autoSpawn: false, // Workers spawn on-demand, not automatically
    spawnOnDemand: ["vision"],
    spawnPolicy: {
      default: {
        autoSpawn: false, // Don't auto-spawn on plugin init
        onDemand: true, // Allow on-demand spawning via tools
        allowManual: true,
        warmPool: false, // Don't pre-warm workers
        reuseExisting: true,
      },
      profiles: {},
    },
    startupTimeout: 30000,
    healthCheckInterval: 30000,
    healthCheck: {
      enabled: true,
      intervalMs: 30000,
      timeoutMs: 3000,
      maxRetries: 3,
    },
    warmPool: {
      enabled: false,
      profiles: {},
    },
    modelSelection: {
      mode: "performance",
    },
    modelAliases: {},
    ui: {
      toasts: true,
      injectSystemContext: true,
      systemContextMaxWorkers: 12,
      defaultListFormat: "markdown",
      debug: false,
      logToConsole: false,
      firstRunDemo: true,
    },
    notifications: {
      idle: { enabled: false, title: "OpenCode", message: "Session is idle", delayMs: 1500 },
    },
    agent: {
      enabled: true,
      name: "orchestrator",
      mode: "primary",
      applyToBuild: false,
    },
    commands: { enabled: true, prefix: "orchestrator." },
    pruning: {
      enabled: false,
      maxToolOutputChars: 12000,
      maxToolInputChars: 4000,
      protectedTools: ["task", "todowrite", "todoread"],
    },
    workflows: {
      enabled: true,
      roocodeBoomerang: {
        enabled: true,
        maxSteps: 4,
        maxTaskChars: 12000,
        maxCarryChars: 24000,
        perStepTimeoutMs: 120_000,
      },
    },
    security: {
      workflows: {
        maxSteps: 4,
        maxTaskChars: 12000,
        maxCarryChars: 24000,
        perStepTimeoutMs: 120_000,
      },
    },
    memory: {
      enabled: true,
      autoSpawn: true,
      autoRecord: true,
      autoInject: true,
      scope: "project",
      maxChars: 2000,
      summaries: {
        enabled: true,
        sessionMaxChars: 2000,
        projectMaxChars: 2000,
      },
      trim: {
        maxMessagesPerSession: 60,
        maxMessagesPerProject: 400,
        maxMessagesGlobal: 2000,
        maxProjectsGlobal: 25,
      },
      inject: {
        maxChars: 2000,
        maxEntries: 8,
        includeMessages: false,
        includeSessionSummary: true,
        includeProjectSummary: true,
        includeGlobal: true,
        maxGlobalEntries: 3,
      },
    },
    integrations: {
      linear: { enabled: true },
      neo4j: { enabled: false },
      monitoring: { enabled: false },
    },
    telemetry: {
      enabled: false,
    },
    profiles: [
      {
        id: "glm47-vision-demo",
        name: "GLM-4.7 Vision Demo",
        model: "zhipu/glm-4.7v",
        purpose: "Multimodal onboarding demo (vision + workflow).",
        whenToUse: "Use for the onboarding multimodal demo flow.",
        supportsVision: true,
        enabled: true,
      },
    ],
    workers: [], // No auto-spawn - orchestrator decides when to spawn workers
  };
}

```

---

## File: config/orchestrator/parse-extra.ts

```typescript
import { isPlainObject } from "../../helpers/format";
import type { OrchestratorConfig, OrchestratorConfigFile } from "../../types";

/**
 * Schema field definition for validation.
 * Each field specifies its expected type and optional allowed values for enums.
 */
type FieldSchema =
  | { type: "boolean" }
  | { type: "string" }
  | { type: "number" }
  | { type: "enum"; values: readonly string[] };

/**
 * Schema definition for an object with optional nested objects.
 */
type ObjectSchema = {
  fields?: Record<string, FieldSchema>;
  nested?: Record<string, ObjectSchema>;
};

/**
 * Validates and extracts fields from a source object based on a schema definition.
 * Only copies values that match the expected type.
 *
 * @param source - The source object to extract values from
 * @param schema - The schema defining expected fields and nested objects
 * @returns A validated object with only the fields that passed type checks
 */
function validateObject(source: Record<string, unknown>, schema: ObjectSchema): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Validate simple fields
  if (schema.fields) {
    for (const [key, fieldSchema] of Object.entries(schema.fields)) {
      const value = source[key];

      if (fieldSchema.type === "boolean" && typeof value === "boolean") {
        result[key] = value;
      } else if (fieldSchema.type === "string" && typeof value === "string") {
        result[key] = value;
      } else if (fieldSchema.type === "number" && typeof value === "number") {
        result[key] = value;
      } else if (fieldSchema.type === "enum" && fieldSchema.values.includes(value as string)) {
        result[key] = value;
      }
    }
  }

  // Validate nested objects
  if (schema.nested) {
    for (const [key, nestedSchema] of Object.entries(schema.nested)) {
      if (isPlainObject(source[key])) {
        const nestedResult = validateObject(source[key], nestedSchema);
        if (Object.keys(nestedResult).length > 0) {
          result[key] = nestedResult;
        }
      }
    }
  }

  return result;
}

// Schema definitions for each section

const memorySchema: ObjectSchema = {
  fields: {
    enabled: { type: "boolean" },
    autoSpawn: { type: "boolean" },
    autoRecord: { type: "boolean" },
    autoInject: { type: "boolean" },
    scope: { type: "enum", values: ["project", "global"] as const },
    maxChars: { type: "number" },
  },
  nested: {
    summaries: {
      fields: {
        enabled: { type: "boolean" },
        sessionMaxChars: { type: "number" },
        projectMaxChars: { type: "number" },
      },
    },
    trim: {
      fields: {
        maxMessagesPerSession: { type: "number" },
        maxMessagesPerProject: { type: "number" },
        maxMessagesGlobal: { type: "number" },
        maxProjectsGlobal: { type: "number" },
      },
    },
    inject: {
      fields: {
        maxChars: { type: "number" },
        maxEntries: { type: "number" },
        includeMessages: { type: "boolean" },
        includeSessionSummary: { type: "boolean" },
        includeProjectSummary: { type: "boolean" },
        includeGlobal: { type: "boolean" },
        maxGlobalEntries: { type: "number" },
      },
    },
  },
};

const integrationsSchema: ObjectSchema = {
  nested: {
    linear: {
      fields: {
        enabled: { type: "boolean" },
        apiKey: { type: "string" },
        teamId: { type: "string" },
        apiUrl: { type: "string" },
        projectPrefix: { type: "string" },
      },
    },
    neo4j: {
      fields: {
        enabled: { type: "boolean" },
        uri: { type: "string" },
        username: { type: "string" },
        password: { type: "string" },
        database: { type: "string" },
      },
    },
    monitoring: {
      fields: {
        enabled: { type: "boolean" },
        port: { type: "number" },
        metricsPath: { type: "string" },
      },
    },
  },
};

const telemetrySchema: ObjectSchema = {
  fields: {
    enabled: { type: "boolean" },
    apiKey: { type: "string" },
    host: { type: "string" },
  },
};

// Exported functions using the generic validation helpers

export function parseMemorySection(raw: Record<string, unknown>, partial: Partial<OrchestratorConfigFile>): void {
  if (!isPlainObject(raw.memory)) return;
  partial.memory = validateObject(raw.memory, memorySchema) as OrchestratorConfig["memory"];
}

export function parseIntegrationsSection(raw: Record<string, unknown>, partial: Partial<OrchestratorConfigFile>): void {
  if (!isPlainObject(raw.integrations)) return;
  const validated = validateObject(raw.integrations, integrationsSchema) as Record<string, unknown>;
  const passthrough = raw.integrations as Record<string, unknown>;
  const knownKeys = new Set(Object.keys(integrationsSchema.nested ?? {}));
  for (const [key, value] of Object.entries(passthrough)) {
    if (!knownKeys.has(key)) {
      validated[key] = value;
    }
  }
  partial.integrations = validated as OrchestratorConfig["integrations"];
}

export function parseTelemetrySection(raw: Record<string, unknown>, partial: Partial<OrchestratorConfigFile>): void {
  if (!isPlainObject(raw.telemetry)) return;
  partial.telemetry = validateObject(raw.telemetry, telemetrySchema) as OrchestratorConfig["telemetry"];
}

```

---

## File: config/orchestrator/parse-workers.ts

```typescript
import { asBooleanRecord, asStringArray, isPlainObject } from "../../helpers/format";
import type { OrchestratorConfigFile, SpawnPolicy, ToolPermissions, WorkerProfile } from "../../types";
import { resolveProfileInheritance, type WorkerProfileDefinition } from "../profile-inheritance";

const parsePermissions = (value: unknown): ToolPermissions | undefined => {
  if (!isPlainObject(value)) return undefined;
  const out: ToolPermissions = {};
  if (isPlainObject(value.categories)) {
    out.categories = {};
    if (
      value.categories.filesystem === "full" ||
      value.categories.filesystem === "read" ||
      value.categories.filesystem === "none"
    ) {
      out.categories.filesystem = value.categories.filesystem;
    }
    if (
      value.categories.execution === "full" ||
      value.categories.execution === "sandboxed" ||
      value.categories.execution === "none"
    ) {
      out.categories.execution = value.categories.execution;
    }
    if (
      value.categories.network === "full" ||
      value.categories.network === "localhost" ||
      value.categories.network === "none"
    ) {
      out.categories.network = value.categories.network;
    }
  }
  if (isPlainObject(value.tools)) {
    out.tools = {};
    for (const [toolName, cfg] of Object.entries(value.tools)) {
      if (!isPlainObject(cfg)) continue;
      if (typeof cfg.enabled !== "boolean") continue;
      out.tools[toolName] = {
        enabled: cfg.enabled,
        constraints: isPlainObject(cfg.constraints) ? cfg.constraints : undefined,
      };
    }
  }
  if (isPlainObject(value.paths)) {
    const allowed = asStringArray(value.paths.allowed);
    const denied = asStringArray(value.paths.denied);
    if (allowed || denied) out.paths = { allowed: allowed ?? undefined, denied: denied ?? undefined };
  }
  return out;
};

/** Parse a spawn policy object from config. */
export const parseSpawnPolicyEntry = (value: unknown): SpawnPolicy | undefined => {
  if (!isPlainObject(value)) return undefined;
  const out: SpawnPolicy = {};
  if (typeof value.autoSpawn === "boolean") out.autoSpawn = value.autoSpawn;
  if (typeof value.onDemand === "boolean") out.onDemand = value.onDemand;
  if (typeof value.allowManual === "boolean") out.allowManual = value.allowManual;
  if (typeof value.warmPool === "boolean") out.warmPool = value.warmPool;
  if (typeof value.reuseExisting === "boolean") out.reuseExisting = value.reuseExisting;
  return out;
};

const resolveWorkerEntry = (
  entry: unknown,
  baseProfiles: Record<string, WorkerProfile> = {},
): WorkerProfileDefinition | undefined => {
  if (typeof entry === "string") {
    return baseProfiles[entry] ?? ({ id: entry } as WorkerProfileDefinition);
  }
  if (!isPlainObject(entry)) return undefined;

  const id = typeof entry.id === "string" ? entry.id : undefined;
  if (!id) return undefined;

  const base = baseProfiles[id];
  const merged: Record<string, unknown> = { ...(base ?? {}), ...entry };

  if (typeof merged.id !== "string") return undefined;

  if ("tools" in merged) {
    const tools = asBooleanRecord(merged.tools);
    if (!tools) return undefined;
    merged.tools = tools;
  }

  if ("tags" in merged) {
    const tags = asStringArray(merged.tags);
    if (!tags) return undefined;
    merged.tags = tags;
  }

  if ("permissions" in merged) {
    merged.permissions = parsePermissions(merged.permissions);
  }

  if ("extends" in merged && typeof merged.extends !== "string") delete merged.extends;
  if ("compose" in merged) {
    const compose = asStringArray(merged.compose);
    merged.compose = compose;
  }

  return merged as unknown as WorkerProfileDefinition;
};

/** Normalize config arrays to a string or object list. */
export const asConfigArray = (value: unknown): Array<string | Record<string, unknown>> | undefined => {
  if (!Array.isArray(value)) return undefined;
  const out: Array<string | Record<string, unknown>> = [];
  for (const item of value) {
    if (typeof item === "string") out.push(item);
    else if (isPlainObject(item)) out.push(item);
  }
  return out;
};

/** Resolve profile overrides and spawn targets from orchestrator config. */
export const collectProfilesAndSpawn = (
  input: OrchestratorConfigFile,
  baseProfiles: Record<string, WorkerProfile> = {},
): {
  profiles: Record<string, WorkerProfile>;
  spawn: string[];
} => {
  const definitions: Record<string, WorkerProfileDefinition> = {};
  const spawn: string[] = [];
  const seen = new Set<string>();

  const registerProfile = (entry: unknown): WorkerProfileDefinition | undefined => {
    const resolved = resolveWorkerEntry(entry, baseProfiles);
    if (resolved) definitions[resolved.id] = resolved;
    return resolved;
  };

  const enqueueSpawn = (id: string | undefined) => {
    if (!id) return;
    if (seen.has(id)) return;
    seen.add(id);
    spawn.push(id);
  };

  for (const entry of input.profiles ?? []) {
    registerProfile(entry);
  }

  for (const entry of input.workers ?? []) {
    if (typeof entry === "string") {
      enqueueSpawn(entry);
      continue;
    }
    const resolved = registerProfile(entry);
    enqueueSpawn(resolved?.id);
  }

  const profiles = resolveProfileInheritance({ builtIns: baseProfiles, definitions });
  return { profiles, spawn };
};

```

---

## File: config/orchestrator/parse.ts

```typescript
import { isPlainObject } from "../../helpers/format";
import type { OrchestratorConfig, OrchestratorConfigFile, SpawnPolicy } from "../../types";
import { parseIntegrationsSection, parseMemorySection, parseTelemetrySection } from "./parse-extra";
import { asConfigArray, parseSpawnPolicyEntry } from "./parse-workers";

export { collectProfilesAndSpawn } from "./parse-workers";

/** Parse orchestrator.json into a partial typed config. */
export function parseOrchestratorConfigFile(raw: unknown): Partial<OrchestratorConfigFile> {
  if (!isPlainObject(raw)) return {};

  const partial: Partial<OrchestratorConfigFile> = {};

  if (typeof raw.basePort === "number") partial.basePort = raw.basePort;
  if (typeof raw.autoSpawn === "boolean") partial.autoSpawn = raw.autoSpawn;
  if (Array.isArray(raw.spawnOnDemand) && raw.spawnOnDemand.every((id: unknown) => typeof id === "string")) {
    partial.spawnOnDemand = raw.spawnOnDemand;
  }
  if (isPlainObject(raw.spawnPolicy)) {
    const spawnPolicy: Record<string, unknown> = {};
    if (isPlainObject(raw.spawnPolicy.default)) {
      const parsed = parseSpawnPolicyEntry(raw.spawnPolicy.default);
      if (parsed) spawnPolicy.default = parsed;
    }
    if (isPlainObject(raw.spawnPolicy.profiles)) {
      const profiles: Record<string, SpawnPolicy> = {};
      for (const [id, cfg] of Object.entries(raw.spawnPolicy.profiles)) {
        const parsed = parseSpawnPolicyEntry(cfg);
        if (parsed) profiles[id] = parsed;
      }
      spawnPolicy.profiles = profiles;
    }
    partial.spawnPolicy = spawnPolicy as OrchestratorConfig["spawnPolicy"];
  }
  if (typeof raw.startupTimeout === "number") partial.startupTimeout = raw.startupTimeout;
  if (typeof raw.healthCheckInterval === "number") partial.healthCheckInterval = raw.healthCheckInterval;
  if (isPlainObject(raw.healthCheck)) {
    const healthCheck: Record<string, unknown> = {};
    if (typeof raw.healthCheck.enabled === "boolean") healthCheck.enabled = raw.healthCheck.enabled;
    if (typeof raw.healthCheck.intervalMs === "number") healthCheck.intervalMs = raw.healthCheck.intervalMs;
    if (typeof raw.healthCheck.timeoutMs === "number") healthCheck.timeoutMs = raw.healthCheck.timeoutMs;
    if (typeof raw.healthCheck.maxRetries === "number") healthCheck.maxRetries = raw.healthCheck.maxRetries;
    partial.healthCheck = healthCheck as OrchestratorConfig["healthCheck"];
  }

  if (isPlainObject(raw.warmPool)) {
    const warmPool: Record<string, unknown> = {};
    if (typeof raw.warmPool.enabled === "boolean") warmPool.enabled = raw.warmPool.enabled;
    if (isPlainObject(raw.warmPool.profiles)) {
      const profiles: Record<string, unknown> = {};
      for (const [id, cfg] of Object.entries(raw.warmPool.profiles)) {
        if (!isPlainObject(cfg)) continue;
        const entry: Record<string, unknown> = {};
        if (typeof cfg.size === "number") entry.size = cfg.size;
        if (typeof cfg.idleTimeoutMs === "number") entry.idleTimeoutMs = cfg.idleTimeoutMs;
        profiles[id] = entry;
      }
      warmPool.profiles = profiles;
    }
    partial.warmPool = warmPool as OrchestratorConfig["warmPool"];
  }

  if (isPlainObject(raw.modelSelection)) {
    const modelSelection: Record<string, unknown> = {};
    if (
      raw.modelSelection.mode === "performance" ||
      raw.modelSelection.mode === "balanced" ||
      raw.modelSelection.mode === "economical"
    ) {
      modelSelection.mode = raw.modelSelection.mode;
    }
    if (typeof raw.modelSelection.maxCostPer1kTokens === "number")
      modelSelection.maxCostPer1kTokens = raw.modelSelection.maxCostPer1kTokens;
    if (
      Array.isArray(raw.modelSelection.preferredProviders) &&
      raw.modelSelection.preferredProviders.every((p: unknown) => typeof p === "string")
    ) {
      modelSelection.preferredProviders = raw.modelSelection.preferredProviders;
    }
    partial.modelSelection = modelSelection as OrchestratorConfig["modelSelection"];
  }

  if (isPlainObject(raw.modelAliases)) {
    const modelAliases: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw.modelAliases)) {
      if (typeof value === "string") modelAliases[key] = value;
    }
    partial.modelAliases = modelAliases;
  }

  if ("profiles" in raw) {
    const profiles = asConfigArray(raw.profiles);
    // profiles is Array<string | Record<string, unknown>> which matches OrchestratorConfigFile["profiles"]
    if (profiles) partial.profiles = profiles as OrchestratorConfigFile["profiles"];
  }

  if ("workers" in raw) {
    const workers = asConfigArray(raw.workers);
    // workers is Array<string | Record<string, unknown>> which matches OrchestratorConfigFile["workers"]
    if (workers) partial.workers = workers as OrchestratorConfigFile["workers"];
  }

  if (isPlainObject(raw.ui)) {
    const ui: Record<string, unknown> = {};
    if (typeof raw.ui.toasts === "boolean") ui.toasts = raw.ui.toasts;
    if (typeof raw.ui.injectSystemContext === "boolean") ui.injectSystemContext = raw.ui.injectSystemContext;
    if (typeof raw.ui.systemContextMaxWorkers === "number") ui.systemContextMaxWorkers = raw.ui.systemContextMaxWorkers;
    if (raw.ui.defaultListFormat === "markdown" || raw.ui.defaultListFormat === "json") {
      ui.defaultListFormat = raw.ui.defaultListFormat;
    }
    if (typeof raw.ui.debug === "boolean") ui.debug = raw.ui.debug;
    if (typeof raw.ui.logToConsole === "boolean") ui.logToConsole = raw.ui.logToConsole;
    if (typeof raw.ui.firstRunDemo === "boolean") ui.firstRunDemo = raw.ui.firstRunDemo;
    if (typeof raw.ui.wakeupInjection === "boolean") ui.wakeupInjection = raw.ui.wakeupInjection;
    partial.ui = ui as OrchestratorConfig["ui"];
  }

  if (isPlainObject(raw.notifications) && isPlainObject(raw.notifications.idle)) {
    const idle: Record<string, unknown> = {};
    if (typeof raw.notifications.idle.enabled === "boolean") idle.enabled = raw.notifications.idle.enabled;
    if (typeof raw.notifications.idle.title === "string") idle.title = raw.notifications.idle.title;
    if (typeof raw.notifications.idle.message === "string") idle.message = raw.notifications.idle.message;
    if (typeof raw.notifications.idle.delayMs === "number") idle.delayMs = raw.notifications.idle.delayMs;
    partial.notifications = { idle: idle as OrchestratorConfig["notifications"] extends { idle: infer T } ? T : never };
  }

  if (isPlainObject(raw.agent)) {
    const agent: Record<string, unknown> = {};
    if (typeof raw.agent.enabled === "boolean") agent.enabled = raw.agent.enabled;
    if (typeof raw.agent.name === "string") agent.name = raw.agent.name;
    if (typeof raw.agent.model === "string") agent.model = raw.agent.model;
    if (typeof raw.agent.prompt === "string") agent.prompt = raw.agent.prompt;
    if (raw.agent.mode === "primary" || raw.agent.mode === "subagent") agent.mode = raw.agent.mode;
    if (typeof raw.agent.color === "string") agent.color = raw.agent.color;
    if (typeof raw.agent.applyToBuild === "boolean") agent.applyToBuild = raw.agent.applyToBuild;
    partial.agent = agent as OrchestratorConfig["agent"];
  }

  if (isPlainObject(raw.commands)) {
    const commands: Record<string, unknown> = {};
    if (typeof raw.commands.enabled === "boolean") commands.enabled = raw.commands.enabled;
    if (typeof raw.commands.prefix === "string") commands.prefix = raw.commands.prefix;
    partial.commands = commands as OrchestratorConfig["commands"];
  }

  if (isPlainObject(raw.pruning)) {
    const pruning: Record<string, unknown> = {};
    if (typeof raw.pruning.enabled === "boolean") pruning.enabled = raw.pruning.enabled;
    if (typeof raw.pruning.maxToolOutputChars === "number") pruning.maxToolOutputChars = raw.pruning.maxToolOutputChars;
    if (typeof raw.pruning.maxToolInputChars === "number") pruning.maxToolInputChars = raw.pruning.maxToolInputChars;
    if (
      Array.isArray(raw.pruning.protectedTools) &&
      raw.pruning.protectedTools.every((t: unknown) => typeof t === "string")
    ) {
      pruning.protectedTools = raw.pruning.protectedTools;
    }
    partial.pruning = pruning as OrchestratorConfig["pruning"];
  }

  if (isPlainObject(raw.workflows)) {
    const workflows: Record<string, unknown> = {};
    if (typeof raw.workflows.enabled === "boolean") workflows.enabled = raw.workflows.enabled;
    if (isPlainObject(raw.workflows.roocodeBoomerang)) {
      const roocode: Record<string, unknown> = {};
      if (typeof raw.workflows.roocodeBoomerang.enabled === "boolean")
        roocode.enabled = raw.workflows.roocodeBoomerang.enabled;
      if (typeof raw.workflows.roocodeBoomerang.maxSteps === "number")
        roocode.maxSteps = raw.workflows.roocodeBoomerang.maxSteps;
      if (typeof raw.workflows.roocodeBoomerang.maxTaskChars === "number")
        roocode.maxTaskChars = raw.workflows.roocodeBoomerang.maxTaskChars;
      if (typeof raw.workflows.roocodeBoomerang.maxCarryChars === "number")
        roocode.maxCarryChars = raw.workflows.roocodeBoomerang.maxCarryChars;
      if (typeof raw.workflows.roocodeBoomerang.perStepTimeoutMs === "number") {
        roocode.perStepTimeoutMs = raw.workflows.roocodeBoomerang.perStepTimeoutMs;
      }
      if (Array.isArray(raw.workflows.roocodeBoomerang.steps)) {
        const steps = raw.workflows.roocodeBoomerang.steps
          .map((s: unknown) => {
            if (!isPlainObject(s)) return undefined;
            const id = typeof s.id === "string" ? s.id : undefined;
            if (!id) return undefined;
            const step: Record<string, unknown> = { id };
            if (typeof s.title === "string") step.title = s.title;
            if (typeof s.workerId === "string") step.workerId = s.workerId;
            if (typeof s.prompt === "string") step.prompt = s.prompt;
            if (typeof s.carry === "boolean") step.carry = s.carry;
            return step;
          })
          .filter(Boolean);
        if (steps.length > 0) roocode.steps = steps;
      }
      workflows.roocodeBoomerang = roocode;
    }
    partial.workflows = workflows as OrchestratorConfig["workflows"];
  }

  if (isPlainObject(raw.security)) {
    const security: Record<string, unknown> = {};
    if (isPlainObject(raw.security.workflows)) {
      const workflows: Record<string, unknown> = {};
      if (typeof raw.security.workflows.maxSteps === "number") workflows.maxSteps = raw.security.workflows.maxSteps;
      if (typeof raw.security.workflows.maxTaskChars === "number")
        workflows.maxTaskChars = raw.security.workflows.maxTaskChars;
      if (typeof raw.security.workflows.maxCarryChars === "number")
        workflows.maxCarryChars = raw.security.workflows.maxCarryChars;
      if (typeof raw.security.workflows.perStepTimeoutMs === "number") {
        workflows.perStepTimeoutMs = raw.security.workflows.perStepTimeoutMs;
      }
      security.workflows = workflows;
    }
    partial.security = security as OrchestratorConfig["security"];
  }

  parseMemorySection(raw, partial);
  parseIntegrationsSection(raw, partial);
  parseTelemetrySection(raw, partial);

  return partial;
}

/**
 * Collect profile overrides and spawn list from orchestrator.json config.
 *
 * Profiles are now primarily loaded from SKILL.md files in .opencode/skill/.
 * This function processes config file overrides and determines which workers to spawn.
 *
 * @param input - Parsed orchestrator.json config
 * @param baseProfiles - Profiles loaded from SKILL.md files (optional, for merging)
 */

```

---

## File: config/orchestrator/paths.ts

```typescript
import { join } from "node:path";
import { getUserConfigDir } from "../../helpers/format";

export function getDefaultGlobalOrchestratorConfigPath(): string {
  return join(getUserConfigDir(), "opencode", "orchestrator.json");
}

export function getDefaultGlobalOpenCodeConfigPath(): string {
  return join(getUserConfigDir(), "opencode", "opencode.json");
}

export function getDefaultProjectOrchestratorConfigPath(directory: string): string {
  return join(directory, ".opencode", "orchestrator.json");
}

```

---

## File: config/profile-inheritance.ts

```typescript
import { mergeToolPermissions } from "../permissions/validator";
import type { ToolPermissions, WorkerProfile } from "../types";

export type WorkerProfileDefinition = Partial<WorkerProfile> & {
  id: string;
  extends?: string;
  compose?: string[];
};

function mergeTags(base?: string[], override?: string[]): string[] | undefined {
  const merged = [...(base ?? []), ...(override ?? [])].filter((t) => typeof t === "string" && t.length > 0);
  if (merged.length === 0) return undefined;
  return Array.from(new Set(merged));
}

function mergeTools(
  base?: Record<string, boolean>,
  override?: Record<string, boolean>,
): Record<string, boolean> | undefined {
  if (!base && !override) return undefined;
  return { ...(base ?? {}), ...(override ?? {}) };
}

function mergeProfiles(base: WorkerProfile, override: WorkerProfileDefinition): WorkerProfile {
  return {
    ...base,
    ...override,
    tools: mergeTools(base.tools, override.tools),
    tags: mergeTags(base.tags, override.tags),
    permissions: mergeToolPermissions(base.permissions, override.permissions as ToolPermissions | undefined),
    id: override.id ?? base.id,
  };
}

export function resolveProfileInheritance(input: {
  builtIns: Record<string, WorkerProfile>;
  definitions: Record<string, WorkerProfileDefinition>;
}): Record<string, WorkerProfile> {
  const resolved = new Map<string, WorkerProfile>();
  const resolving = new Set<string>();

  const resolve = (id: string): WorkerProfile => {
    if (resolved.has(id)) return resolved.get(id)!;
    if (resolving.has(id)) throw new Error(`Profile inheritance cycle detected at "${id}"`);

    const def = input.definitions[id] ?? input.builtIns[id];
    if (!def) throw new Error(`Unknown profile "${id}"`);

    resolving.add(id);

    let merged: WorkerProfile | undefined;

    const composeList = Array.isArray(def.compose) ? def.compose : [];
    if (composeList.length > 0) {
      for (const baseId of composeList) {
        const base = resolve(baseId);
        merged = merged ? mergeProfiles(merged, base) : base;
      }
    }

    if (def.extends) {
      const base = resolve(def.extends);
      merged = merged ? mergeProfiles(merged, base) : base;
    }

    if (!merged) {
      merged = input.builtIns[id] ?? (def as WorkerProfile);
    }

    const finalProfile = mergeProfiles(merged, def);

    if (
      typeof finalProfile.id !== "string" ||
      typeof finalProfile.name !== "string" ||
      typeof finalProfile.model !== "string" ||
      typeof finalProfile.purpose !== "string" ||
      typeof finalProfile.whenToUse !== "string"
    ) {
      throw new Error(`Profile "${id}" is missing required fields (id, name, model, purpose, whenToUse).`);
    }

    resolved.set(id, finalProfile);
    resolving.delete(id);
    return finalProfile;
  };

  const output: Record<string, WorkerProfile> = {};
  const allIds = new Set<string>([...Object.keys(input.builtIns), ...Object.keys(input.definitions)]);
  for (const id of allIds) {
    output[id] = resolve(id);
  }

  return output;
}

```

---

## File: config/profiles.ts

```typescript
export type { WorkerProfile } from "../types";
export { builtInProfiles, getAllProfiles, getAllProfilesWithSkills, getProfile } from "../workers/profiles";

```

---

## File: core/container-profiles.ts

```typescript
import type { createDatabase } from "../db";
import { applyWorkerConfigOverrides } from "../db/overrides";
import type { WorkerProfile } from "../types";
import { getAllProfiles } from "../workers/profiles";

type ProfileMap = Record<string, WorkerProfile>;

interface ProfileSyncInput {
  projectDir: string;
  baseProfiles: ProfileMap;
  profiles: ProfileMap;
  database: ReturnType<typeof createDatabase>;
}

/** Create a profile refresh helper that merges SKILL.md profiles with config overrides. */
export const createProfileSync = (input: ProfileSyncInput) => {
  const syncProfiles = (next: ProfileMap) => {
    for (const key of Object.keys(input.profiles)) {
      delete input.profiles[key];
    }
    for (const [key, profile] of Object.entries(next)) {
      input.profiles[key] = profile;
    }
  };

  const refreshProfiles = async () => {
    const configProfilesArray = Object.values(input.baseProfiles).map((profile) => ({ ...profile }));
    const merged = await getAllProfiles(input.projectDir, configProfilesArray);
    const workerConfigs = input.database.getAllWorkerConfigs();
    syncProfiles(applyWorkerConfigOverrides(merged, workerConfigs));
  };

  return { refreshProfiles };
};

```

---

## File: core/container-toasts.ts

```typescript
import type { createApi } from "../api";
import type { createCommunication } from "../communication";
import type { OrchestratorConfig, WorkerInstance, WorkerProfile } from "../types";
import type { WorkerJob } from "../workers/jobs";

type ToastVariant = "info" | "success" | "warning" | "error";

interface ToastBody {
  title: string;
  message: string;
  variant: ToastVariant;
}

const formatJobToast = (job: WorkerJob, status: "created" | "succeeded" | "failed") => {
  const label = status === "created" ? "Job Queued" : status === "succeeded" ? "Job Complete" : "Job Failed";
  const type: ToastVariant = status === "failed" ? "error" : status === "succeeded" ? "success" : "info";
  return { title: `${label}: ${job.workerId}`, message: `Job ${job.id}`, variant: type } satisfies ToastBody;
};

/** Wire up toast notifications for orchestrator lifecycle events. */
export const registerCommunicationToasts = (input: {
  api: ReturnType<typeof createApi>;
  communication: ReturnType<typeof createCommunication>;
  profiles: Record<string, WorkerProfile>;
  config: OrchestratorConfig;
}) => {
  const { api, communication, profiles, config } = input;
  const toastsEnabled = config.ui?.toasts !== false;

  const showToast = (body: ToastBody) => {
    if (!toastsEnabled) return;
    api.tui.showToast({ body }).catch((err) => console.log("[Toast] Failed:", err));
  };

  const profileCount = Object.keys(profiles).length;
  const autoSpawn = config.spawn ?? [];

  showToast({
    title: "Orchestra Plugin Ready",
    message: `${profileCount} worker profiles loaded${autoSpawn.length > 0 ? `, auto-spawning: ${autoSpawn.join(", ")}` : ""}`,
    variant: "success",
  });

  communication.emit(
    "orchestra.started",
    { profileCount, autoSpawn, fallbackModel: undefined },
    { source: "orchestrator" },
  );

  communication.on("orchestra.model.resolved", (event) => {
    const { resolution } = event.data;
    showToast({
      title: `Model Resolved: ${resolution.profileId}`,
      message: `${resolution.from} → ${resolution.to}`,
      variant: "info",
    });
  });

  communication.on("orchestra.model.fallback", (event) => {
    const { profileId, model, reason } = event.data;
    showToast({
      title: `Model Fallback: ${profileId}`,
      message: `Using ${model} (${reason})`,
      variant: "warning",
    });
  });

  communication.on("orchestra.worker.spawned", (event: { data: { worker: WorkerInstance } }) => {
    const { worker } = event.data;
    showToast({
      title: `Spawning: ${worker.profile.name}`,
      message: `Model: ${worker.profile.model}`,
      variant: "info",
    });
  });

  communication.on("orchestra.worker.reused", (event: { data: { worker: WorkerInstance } }) => {
    const { worker } = event.data;
    showToast({
      title: `Reusing: ${worker.profile.name}`,
      message: `Port ${worker.port}`,
      variant: "info",
    });
  });

  communication.on("orchestra.worker.ready", (event: { data: { worker: WorkerInstance } }) => {
    const { worker } = event.data;
    showToast({
      title: `Ready: ${worker.profile.name}`,
      message: `Port ${worker.port}`,
      variant: "success",
    });
  });

  communication.on("orchestra.worker.error", (event: { data: { worker: WorkerInstance; error: unknown } }) => {
    const { worker, error } = event.data;
    showToast({
      title: `Worker Error: ${worker.profile.name}`,
      message: typeof error === "string" ? error : "Worker encountered an error",
      variant: "error",
    });
  });

  communication.on("orchestra.worker.stopped", (event: { data: { worker: WorkerInstance } }) => {
    const { worker } = event.data;
    showToast({
      title: `Stopped: ${worker.profile.name}`,
      message: `Port ${worker.port}`,
      variant: "warning",
    });
  });

  communication.on(
    "orchestra.worker.wakeup",
    (event: { data: { workerId: string; reason: string; summary?: string } }) => {
      const { workerId, reason, summary } = event.data;
      showToast({
        title: `Worker Wakeup: ${workerId}`,
        message: summary ? `${reason}: ${summary}` : reason,
        variant: "info",
      });
    },
  );

  communication.on(
    "orchestra.worker.job",
    (event: { data: { job: WorkerJob; status: "created" | "succeeded" | "failed" } }) => {
      showToast(formatJobToast(event.data.job, event.data.status));
    },
  );

  communication.on("orchestra.subagent.active", (event) => {
    const subagent = event.data.subagent;
    showToast({
      title: `Subagent Active: ${subagent.workerId}`,
      message: subagent.profile?.name ?? "Switching to worker session",
      variant: "info",
    });
  });

  communication.on("orchestra.subagent.closed", (event) => {
    const subagent = event.data.subagent;
    const error = event.data.result?.error;
    showToast({
      title: `Subagent Closed: ${subagent.workerId}`,
      message: error ?? "Returning to parent session",
      variant: error ? "error" : "success",
    });
  });

  communication.on("orchestra.vision.started", () => {
    showToast({
      title: "Analyzing Image",
      message: "Vision worker is processing your image...",
      variant: "info",
    });
  });

  communication.on(
    "orchestra.vision.completed",
    (event: { data: { success: boolean; error?: string; durationMs?: number } }) => {
      const { success, error, durationMs } = event.data;
      if (success) {
        const duration = durationMs ? ` (${(durationMs / 1000).toFixed(1)}s)` : "";
        showToast({
          title: "Image Analyzed",
          message: `Vision analysis complete${duration}`,
          variant: "success",
        });
      } else {
        showToast({
          title: "Vision Failed",
          message: error ?? "Could not analyze image",
          variant: "error",
        });
      }
    },
  );
};

```

---

## File: core/container-vision.ts

```typescript
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

type VisionLogEntry = Record<string, unknown>;

/** Resolve vision runtime settings (timeout, prompt, logging) from env and project dir. */
export const getVisionRuntimeConfig = (projectDir: string) => {
  const rawTimeout = process.env.OPENCODE_VISION_TIMEOUT_MS;
  const timeoutValue = rawTimeout ? Number(rawTimeout) : undefined;
  const timeoutMs =
    Number.isFinite(timeoutValue ?? NaN) && (timeoutValue as number) > 0 ? (timeoutValue as number) : 300_000;
  const prompt = process.env.OPENCODE_VISION_PROMPT?.trim() || undefined;

  const logSink = async (entry: VisionLogEntry) => {
    try {
      const logDir = join(projectDir, ".opencode", "vision");
      await mkdir(logDir, { recursive: true });
      const payload = { loggedAt: new Date().toISOString(), ...entry };
      await appendFile(join(logDir, "jobs.jsonl"), `${JSON.stringify(payload)}\n`);
    } catch {
      // ignore logging failures
    }
  };

  return { timeoutMs, prompt, logSink };
};

```

---

## File: core/container.ts

```typescript
import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import type { Config } from "@opencode-ai/sdk";
import { createApi } from "../api";
import { createSkillsApiServer } from "../api/skills-server";
import type { CommandRouter } from "../commands";
import { createCommandRouter } from "../commands";
import { createCommunication } from "../communication";
import { createDatabase } from "../db";
import { createMemoryStore } from "../memory";
import { ensureNeo4jRunning, setNeo4jIntegrationsConfig } from "../memory/neo4j";
import { createOrchestrator } from "../orchestrator";
import { createSkillsService } from "../skills/service";
import { createTools } from "../tools";
import type { Factory, OrchestratorConfig, ServiceLifecycle } from "../types";
import {
  createVisionRoutingState,
  routeVisionMessage,
  syncVisionProcessedMessages,
  type VisionChatInput,
  type VisionChatOutput,
} from "../ux/vision-routing";
import { createWorkerManager } from "../workers";
import { createWorkflowEngine } from "../workflows/factory";
import { createProfileSync } from "./container-profiles";
import { registerCommunicationToasts } from "./container-toasts";
import { getVisionRuntimeConfig } from "./container-vision";

export type CoreConfig = {
  ctx: PluginInput;
  config: OrchestratorConfig;
};

export type CoreHooks = Hooks & {
  "tui.command.execute": CommandRouter["execute"];
};

export type CoreService = ServiceLifecycle & {
  hooks: CoreHooks;
  services: {
    api: ReturnType<typeof createApi>;
    communication: ReturnType<typeof createCommunication>;
    database: ReturnType<typeof createDatabase>;
    memory: ReturnType<typeof createMemoryStore>;
    workers: ReturnType<typeof createWorkerManager>;
    workflows: ReturnType<typeof createWorkflowEngine>;
    orchestrator: ReturnType<typeof createOrchestrator>;
    tools: ReturnType<typeof createTools>;
    commands: ReturnType<typeof createCommandRouter>;
    skills: ReturnType<typeof createSkillsService>;
    skillsApi: ReturnType<typeof createSkillsApiServer>;
  };
};

/** Create the orchestrator core services, hooks, and lifecycle handlers. */
export const createCore: Factory<CoreConfig, Record<string, never>, CoreService> = ({ config }) => {
  setNeo4jIntegrationsConfig(config.config.integrations?.neo4j);

  const api = createApi({
    config: { directory: config.ctx.directory },
    deps: { client: config.ctx.client },
  });
  const communication = createCommunication({ config: {}, deps: { api } });
  const memory = createMemoryStore({ config: config.config.memory, deps: { api } });
  const baseProfiles = { ...config.config.profiles };
  const profiles = { ...baseProfiles };
  config.config.profiles = profiles;
  const projectDir = config.ctx.worktree && config.ctx.worktree !== "/" ? config.ctx.worktree : config.ctx.directory;
  const database = createDatabase({ config: { directory: projectDir }, deps: {} });
  const skills = createSkillsService(projectDir);
  const workers = createWorkerManager({
    config: {
      basePort: config.config.basePort,
      timeout: config.config.startupTimeout,
      directory: config.ctx.directory,
      profiles,
      modelSelection: config.config.modelSelection,
      modelAliases: config.config.modelAliases,
      integrations: config.config.integrations,
    },
    deps: { api, communication, memory, db: database },
  });
  const workflows = createWorkflowEngine({ config: config.config.workflows, deps: {} });
  const orchestrator = createOrchestrator({ config: config.config, deps: { api, workers, workflows, communication } });
  const tools = createTools({ config: config.config, deps: { orchestrator, workers, workflows } });
  const commands = createCommandRouter({
    api,
    orchestrator,
    workers,
    memory,
    config: config.config,
    projectDir,
  });
  const visionState = createVisionRoutingState();
  const { timeoutMs: visionTimeoutMs, prompt: visionPrompt, logSink } = getVisionRuntimeConfig(projectDir);

  const visionDeps = {
    workers,
    ensureWorker: (input: { workerId: string; reason: "manual" | "on-demand" }) => orchestrator.ensureWorker(input),
    profiles,
    communication,
    timeoutMs: visionTimeoutMs,
    ...(visionPrompt ? { prompt: visionPrompt } : {}),
    logSink,
  };
  const { refreshProfiles } = createProfileSync({
    projectDir,
    baseProfiles,
    profiles,
    database,
  });

  // Pre-load profiles synchronously so they're available for the config hook
  // The config hook runs before start(), so we need profiles loaded early
  let profilesLoaded = false;
  const ensureProfilesLoaded = async () => {
    if (profilesLoaded) return;
    profilesLoaded = true;
    await refreshProfiles();
  };

  // Eagerly load profiles (fire and forget, but block config hook if needed)
  const profilesLoadPromise = ensureProfilesLoaded();

  const skillsApi = createSkillsApiServer({
    config: { enabled: true },
    deps: {
      skills,
      workers,
      db: database,
      onWorkerConfigChanged: () => {
        void refreshProfiles().catch(() => {});
      },
      onPreferencesChanged: () => {},
    },
  });

  skills.events.on((event) => {
    if (event.type === "skill.created") {
      communication.emit("skill.created", { skill: event.skill }, { source: "orchestrator" });
    }
    if (event.type === "skill.updated") {
      communication.emit("skill.updated", { skill: event.skill }, { source: "orchestrator" });
    }
    if (event.type === "skill.deleted") {
      communication.emit("skill.deleted", { id: event.id, scope: event.scope }, { source: "orchestrator" });
    }
    void refreshProfiles().catch(() => {});
  });

  const start = async () => {
    await api.start();
    await communication.start();
    await database.start();

    // Auto-start Neo4j if configured (silent)
    const neo4jCfg = config.config.integrations?.neo4j;
    if (neo4jCfg && neo4jCfg.enabled !== false) {
      await ensureNeo4jRunning(neo4jCfg);
    }

    await memory.start();
    await ensureProfilesLoaded(); // Uses cached promise if already loaded by config hook
    await workers.start();
    await workflows.start();
    await orchestrator.start();

    // Start skills API in background (non-blocking, silent)
    skillsApi.start().catch(() => {});
    registerCommunicationToasts({
      api,
      communication,
      profiles,
      config: config.config,
    });
  };

  const stop = async () => {
    await orchestrator.stop();
    await workflows.stop();
    await workers.stop();
    await skillsApi.stop();
    await memory.stop();
    await database.stop();
    await communication.stop();
    await api.stop();
  };

  const hooks: CoreHooks = {
    tool: tools.tool,
    config: async (input: Config) => {
      // Ensure profiles are loaded before accessing them
      await profilesLoadPromise;

      // Inject the orchestrator agent if enabled in config
      const agentCfg = config.config.agent;
      if (agentCfg?.enabled !== false) {
        const agentName = agentCfg?.name ?? "orchestrator";
        input.agent = input.agent ?? {};
        input.agent[agentName] = {
          model: agentCfg?.model ?? "anthropic/claude-opus-4-5",
          mode: agentCfg?.mode ?? "primary",
          description: "OpenCode Orchestrator - Coordinates specialized AI workers for complex tasks",
          prompt: agentCfg?.prompt ?? undefined,
          ...(agentCfg?.color ? { color: agentCfg.color } : {}),
        };
      }

      // NOTE: Workers with skillPermissions: "inherit" are NOT registered as separate agents.
      // They remain as workers that the orchestrator can delegate to via ask_worker/delegate_task.
      // This prevents them from inheriting orchestrator-only tools like spawn_worker.
      // To interact with memory or other "agent-level" workers, use the orchestrator.

      const commandConfig = commands.commandConfig();
      if (Object.keys(commandConfig).length > 0) {
        input.command = { ...(input.command ?? {}), ...commandConfig };
      }
    },
    "tool.execute.before": tools.guard,
    "chat.message": async (input: VisionChatInput, output: VisionChatOutput) => {
      await routeVisionMessage(
        {
          sessionID: input.sessionID,
          agent: input.agent,
          messageID: input.messageID,
          role: output?.message?.role,
        },
        output,
        visionDeps,
        visionState,
      );
    },
    // tui.command.execute hook input type is defined by the SDK plugin system
    "tui.command.execute": async (input) => commands.execute(input),
    "experimental.chat.messages.transform": async (_input, output) => {
      syncVisionProcessedMessages(output, visionState);
    },
    "experimental.chat.system.transform": tools.systemTransform,
    "experimental.session.compacting": tools.compaction,
  };

  return {
    hooks,
    services: {
      api,
      communication,
      database,
      memory,
      workers,
      workflows,
      orchestrator,
      tools,
      commands,
      skills,
      skillsApi,
    },
    start,
    stop,
    health: async () => ({ ok: true }),
  };
};

```

---

## File: core/index.ts

```typescript
export { type CoreConfig, type CoreHooks, type CoreService, createCore } from "./container";

```

---

## File: core/jobs.ts

```typescript
import { WorkerJobRegistry } from "../workers/jobs";

export type { WorkerJob, WorkerJobReport, WorkerJobStatus } from "../workers/jobs";

export const workerJobs = new WorkerJobRegistry();

```

---

## File: core/spawn-policy.ts

```typescript
import type { SpawnPolicy, SpawnPolicyConfig } from "../types";

export function resolveSpawnPolicy(config: SpawnPolicyConfig | undefined, id: string): SpawnPolicy {
  const defaults = config?.default ?? {};
  const override = config?.profiles?.[id] ?? {};
  return { ...defaults, ...override };
}

export function canAutoSpawn(config: SpawnPolicyConfig | undefined, id: string): boolean {
  return resolveSpawnPolicy(config, id).autoSpawn !== false;
}

export function canSpawnOnDemand(config: SpawnPolicyConfig | undefined, id: string): boolean {
  return resolveSpawnPolicy(config, id).onDemand !== false;
}

export function canSpawnManually(config: SpawnPolicyConfig | undefined, id: string): boolean {
  return resolveSpawnPolicy(config, id).allowManual !== false;
}

export function canWarmPool(config: SpawnPolicyConfig | undefined, id: string): boolean {
  return resolveSpawnPolicy(config, id).warmPool !== false;
}

export function canReuseExisting(config: SpawnPolicyConfig | undefined, id: string): boolean {
  return resolveSpawnPolicy(config, id).reuseExisting !== false;
}

```

---

## File: db/index.ts

```typescript
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Factory, ServiceLifecycle } from "../types";
import {
  CREATE_TABLES_SQL,
  type Preference,
  rowToUser,
  rowToWorkerConfig,
  rowToWorkerState,
  SCHEMA_VERSION,
  type User,
  type UserRow,
  type WorkerConfig,
  type WorkerConfigRow,
  type WorkerState,
  type WorkerStateRow,
} from "./schema";

export type DatabaseConfig = {
  directory: string;
  filename?: string;
};

export type DatabaseService = ServiceLifecycle & {
  // User operations
  getUser(): User | null;
  createUser(): User;
  markOnboarded(): User;

  // Preference operations
  getPreference(key: string): string | null;
  setPreference(key: string, value: string | null): void;
  getAllPreferences(): Record<string, string | null>;
  deletePreference(key: string): void;

  // Worker config operations
  getWorkerConfig(workerId: string): WorkerConfig | null;
  setWorkerConfig(
    workerId: string,
    config: Partial<Omit<WorkerConfig, "id" | "userId" | "workerId" | "updatedAt">>,
  ): void;
  getAllWorkerConfigs(): WorkerConfig[];
  clearWorkerConfig(workerId: string): void;

  // Worker state operations
  getWorkerState(workerId: string): WorkerState | null;
  setWorkerState(state: {
    workerId: string;
    profileName?: string | null;
    model?: string | null;
    serverUrl?: string | null;
    sessionId?: string | null;
    uiSessionId?: string | null;
    status?: string | null;
    sessionMode?: string | null;
    parentSessionId?: string | null;
    startedAt?: Date | null;
    lastActivity?: Date | null;
    currentTask?: string | null;
    lastResult?: WorkerState["lastResult"] | null;
    lastResultAt?: Date | null;
    lastResultJobId?: string | null;
    lastResultDurationMs?: number | null;
    error?: string | null;
    warning?: string | null;
  }): void;
  getAllWorkerStates(): WorkerState[];
  clearWorkerState(workerId: string): void;

  // Utility
  isOnboarded(): boolean;
  getDbPath(): string;
};

export const createDatabase: Factory<DatabaseConfig, Record<string, never>, DatabaseService> = ({ config }) => {
  const dbPath = join(config.directory, ".opencode", config.filename ?? "user.db");
  let db: Database | null = null;

  const ensureUser = (): string => {
    if (!db) throw new Error("Database not initialized");

    const existing = db.prepare("SELECT id FROM users LIMIT 1").get() as { id: string } | undefined;
    if (existing) return existing.id;

    const id = crypto.randomUUID().replace(/-/g, "");
    db.prepare("INSERT INTO users (id) VALUES (?)").run(id);
    return id;
  };

  const getUserId = (): string => {
    if (!db) throw new Error("Database not initialized");
    const row = db.prepare("SELECT id FROM users LIMIT 1").get() as { id: string } | undefined;
    if (!row) throw new Error("No user found");
    return row.id;
  };

  const getUser = (): User | null => {
    if (!db) return null;
    const row = db.prepare("SELECT * FROM users LIMIT 1").get() as UserRow | undefined;
    return row ? rowToUser(row) : null;
  };

  const createUser = (): User => {
    if (!db) throw new Error("Database not initialized");
    const id = ensureUser();
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow;
    return rowToUser(row);
  };

  const markOnboarded = (): User => {
    if (!db) throw new Error("Database not initialized");
    const userId = getUserId();
    db.prepare(`
      UPDATE users
      SET onboarded = 1, onboarded_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(userId);
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as UserRow;
    return rowToUser(row);
  };

  const getPreference = (key: string): string | null => {
    if (!db) return null;
    const userId = getUserId();
    const row = db.prepare("SELECT value FROM preferences WHERE user_id = ? AND key = ?").get(userId, key) as
      | { value: string | null }
      | undefined;
    return row?.value ?? null;
  };

  const setPreference = (key: string, value: string | null): void => {
    if (!db) throw new Error("Database not initialized");
    const userId = getUserId();
    db.prepare(`
      INSERT INTO preferences (id, user_id, key, value)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `).run(crypto.randomUUID().replace(/-/g, ""), userId, key, value);
  };

  const getAllPreferences = (): Record<string, string | null> => {
    if (!db) return {};
    const userId = getUserId();
    const rows = db.prepare("SELECT key, value FROM preferences WHERE user_id = ?").all(userId) as Array<{
      key: string;
      value: string | null;
    }>;
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  };

  const deletePreference = (key: string): void => {
    if (!db) throw new Error("Database not initialized");
    const userId = getUserId();
    db.prepare("DELETE FROM preferences WHERE user_id = ? AND key = ?").run(userId, key);
  };

  const getWorkerConfig = (workerId: string): WorkerConfig | null => {
    if (!db) return null;
    const userId = getUserId();
    const row = db.prepare("SELECT * FROM worker_config WHERE user_id = ? AND worker_id = ?").get(userId, workerId) as
      | WorkerConfigRow
      | undefined;
    return row ? rowToWorkerConfig(row) : null;
  };

  const setWorkerConfig = (
    workerId: string,
    cfg: Partial<Omit<WorkerConfig, "id" | "userId" | "workerId" | "updatedAt">>,
  ): void => {
    if (!db) throw new Error("Database not initialized");
    const userId = getUserId();

    const existing = db
      .prepare("SELECT id FROM worker_config WHERE user_id = ? AND worker_id = ?")
      .get(userId, workerId) as { id: string } | undefined;

    if (existing) {
      const updates: string[] = [];
      const values: Array<string | number | null> = [];

      if (cfg.model !== undefined) {
        updates.push("model = ?");
        values.push(cfg.model);
      }
      if (cfg.temperature !== undefined) {
        updates.push("temperature = ?");
        values.push(cfg.temperature);
      }
      if (cfg.maxTokens !== undefined) {
        updates.push("max_tokens = ?");
        values.push(cfg.maxTokens);
      }
      if (cfg.enabled !== undefined) {
        updates.push("enabled = ?");
        values.push(cfg.enabled ? 1 : 0);
      }

      if (updates.length > 0) {
        updates.push("updated_at = datetime('now')");
        db.prepare(`UPDATE worker_config SET ${updates.join(", ")} WHERE id = ?`).run(...values, existing.id);
      }
    } else {
      db.prepare(`
        INSERT INTO worker_config (id, user_id, worker_id, model, temperature, max_tokens, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID().replace(/-/g, ""),
        userId,
        workerId,
        cfg.model ?? null,
        cfg.temperature ?? null,
        cfg.maxTokens ?? null,
        cfg.enabled !== false ? 1 : 0,
      );
    }
  };

  const getAllWorkerConfigs = (): WorkerConfig[] => {
    if (!db) return [];
    const userId = getUserId();
    const rows = db.prepare("SELECT * FROM worker_config WHERE user_id = ?").all(userId) as WorkerConfigRow[];
    return rows.map(rowToWorkerConfig);
  };

  const clearWorkerConfig = (workerId: string): void => {
    if (!db) throw new Error("Database not initialized");
    const userId = getUserId();
    db.prepare("DELETE FROM worker_config WHERE user_id = ? AND worker_id = ?").run(userId, workerId);
  };

  const getWorkerState = (workerId: string): WorkerState | null => {
    if (!db) return null;
    const userId = getUserId();
    const row = db.prepare("SELECT * FROM worker_state WHERE user_id = ? AND worker_id = ?").get(userId, workerId) as
      | WorkerStateRow
      | undefined;
    return row ? rowToWorkerState(row) : null;
  };

  const setWorkerState = (state: {
    workerId: string;
    profileName?: string | null;
    model?: string | null;
    serverUrl?: string | null;
    sessionId?: string | null;
    uiSessionId?: string | null;
    status?: string | null;
    sessionMode?: string | null;
    parentSessionId?: string | null;
    startedAt?: Date | null;
    lastActivity?: Date | null;
    currentTask?: string | null;
    lastResult?: WorkerState["lastResult"] | null;
    lastResultAt?: Date | null;
    lastResultJobId?: string | null;
    lastResultDurationMs?: number | null;
    error?: string | null;
    warning?: string | null;
  }): void => {
    if (!db) throw new Error("Database not initialized");
    const userId = getUserId();
    const serializedResult = state.lastResult ? JSON.stringify(state.lastResult) : null;
    db.prepare(
      `
        INSERT INTO worker_state (
          id,
          user_id,
          worker_id,
          profile_name,
          model,
          server_url,
          session_id,
          ui_session_id,
          status,
          session_mode,
          parent_session_id,
          started_at,
          last_activity,
          current_task,
          last_result,
          last_result_at,
          last_result_job_id,
          last_result_duration_ms,
          error,
          warning
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, worker_id) DO UPDATE SET
          profile_name = excluded.profile_name,
          model = excluded.model,
          server_url = excluded.server_url,
          session_id = excluded.session_id,
          ui_session_id = excluded.ui_session_id,
          status = excluded.status,
          session_mode = excluded.session_mode,
          parent_session_id = excluded.parent_session_id,
          started_at = excluded.started_at,
          last_activity = excluded.last_activity,
          current_task = excluded.current_task,
          last_result = excluded.last_result,
          last_result_at = excluded.last_result_at,
          last_result_job_id = excluded.last_result_job_id,
          last_result_duration_ms = excluded.last_result_duration_ms,
          error = excluded.error,
          warning = excluded.warning,
          updated_at = datetime('now')
      `,
    ).run(
      crypto.randomUUID().replace(/-/g, ""),
      userId,
      state.workerId,
      state.profileName ?? null,
      state.model ?? null,
      state.serverUrl ?? null,
      state.sessionId ?? null,
      state.uiSessionId ?? null,
      state.status ?? null,
      state.sessionMode ?? null,
      state.parentSessionId ?? null,
      state.startedAt ? state.startedAt.toISOString() : null,
      state.lastActivity ? state.lastActivity.toISOString() : null,
      state.currentTask ?? null,
      serializedResult,
      state.lastResultAt ? state.lastResultAt.toISOString() : null,
      state.lastResultJobId ?? null,
      state.lastResultDurationMs ?? null,
      state.error ?? null,
      state.warning ?? null,
    );
  };

  const getAllWorkerStates = (): WorkerState[] => {
    if (!db) return [];
    const userId = getUserId();
    const rows = db.prepare("SELECT * FROM worker_state WHERE user_id = ?").all(userId) as WorkerStateRow[];
    return rows.map(rowToWorkerState);
  };

  const clearWorkerState = (workerId: string): void => {
    if (!db) throw new Error("Database not initialized");
    const userId = getUserId();
    db.prepare("DELETE FROM worker_state WHERE user_id = ? AND worker_id = ?").run(userId, workerId);
  };

  const isOnboarded = (): boolean => {
    const user = getUser();
    return user?.onboarded ?? false;
  };

  const start = async () => {
    const dbDir = join(config.directory, ".opencode");
    if (!existsSync(dbDir)) {
      await mkdir(dbDir, { recursive: true });
    }

    db = new Database(dbPath, { create: true });
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");

    // Run schema creation
    db.exec(CREATE_TABLES_SQL);

    // Check/update schema version
    const versionRow = db.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1").get() as
      | { version: number }
      | undefined;
    const currentVersion = versionRow?.version ?? 0;

    if (currentVersion < SCHEMA_VERSION) {
      // Run migrations if needed (for now, just record the version)
      db.prepare("INSERT OR REPLACE INTO schema_version (version) VALUES (?)").run(SCHEMA_VERSION);
    }

    // Ensure a user exists
    ensureUser();
  };

  const stop = async () => {
    if (db) {
      db.close();
      db = null;
    }
  };

  return {
    start,
    stop,
    health: async () => ({ ok: db !== null }),
    getUser,
    createUser,
    markOnboarded,
    getPreference,
    setPreference,
    getAllPreferences,
    deletePreference,
    getWorkerConfig,
    setWorkerConfig,
    getAllWorkerConfigs,
    clearWorkerConfig,
    getWorkerState,
    setWorkerState,
    getAllWorkerStates,
    clearWorkerState,
    isOnboarded,
    getDbPath: () => dbPath,
  };
};

export type { User, Preference, WorkerConfig, WorkerState };

```

---

## File: db/overrides.ts

```typescript
import type { WorkerProfile } from "../types";
import type { WorkerConfig } from "./index";

export function applyWorkerConfigOverrides(
  profiles: Record<string, WorkerProfile>,
  configs: WorkerConfig[],
): Record<string, WorkerProfile> {
  if (!configs.length) return profiles;

  const next: Record<string, WorkerProfile> = {};
  for (const [id, profile] of Object.entries(profiles)) {
    next[id] = { ...profile };
  }

  for (const config of configs) {
    const profile = next[config.workerId];
    if (!profile) continue;

    if (config.model !== null && config.model !== undefined) {
      profile.model = config.model;
    }
    if (config.temperature !== null && config.temperature !== undefined) {
      profile.temperature = config.temperature;
    }
    if (config.maxTokens !== null && config.maxTokens !== undefined) {
      profile.maxTokens = config.maxTokens;
    }
    if (typeof config.enabled === "boolean") {
      profile.enabled = config.enabled;
    }
  }

  return next;
}

```

---

## File: db/schema.ts

```typescript
/**
 * Database schema for OpenCode Orchestra
 *
 * Tables:
 * - users: Tracks onboarding status and user metadata
 * - preferences: Key-value store for user preferences
 * - worker_config: Per-worker model and settings overrides
 */

export const SCHEMA_VERSION = 2;

export const CREATE_TABLES_SQL = `
-- Users table: tracks onboarding status
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  onboarded INTEGER DEFAULT 0,
  onboarded_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Preferences table: key-value store for user settings
CREATE TABLE IF NOT EXISTS preferences (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, key)
);

-- Worker config table: per-worker model and settings
CREATE TABLE IF NOT EXISTS worker_config (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  worker_id TEXT NOT NULL,
  model TEXT,
  temperature REAL,
  max_tokens INTEGER,
  enabled INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, worker_id)
);

-- Worker state table: runtime status for active workers
CREATE TABLE IF NOT EXISTS worker_state (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  worker_id TEXT NOT NULL,
  profile_name TEXT,
  model TEXT,
  server_url TEXT,
  session_id TEXT,
  ui_session_id TEXT,
  status TEXT,
  session_mode TEXT,
  parent_session_id TEXT,
  started_at TEXT,
  last_activity TEXT,
  current_task TEXT,
  last_result TEXT,
  last_result_at TEXT,
  last_result_job_id TEXT,
  last_result_duration_ms INTEGER,
  error TEXT,
  warning TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, worker_id)
);

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_preferences_user_key ON preferences(user_id, key);
CREATE INDEX IF NOT EXISTS idx_worker_config_user ON worker_config(user_id);
CREATE INDEX IF NOT EXISTS idx_worker_config_worker ON worker_config(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_state_user ON worker_state(user_id);
CREATE INDEX IF NOT EXISTS idx_worker_state_worker ON worker_state(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_state_session ON worker_state(session_id);
`;

export type UserRow = {
  id: string;
  onboarded: number;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PreferenceRow = {
  id: string;
  user_id: string;
  key: string;
  value: string | null;
  updated_at: string;
};

export type WorkerConfigRow = {
  id: string;
  user_id: string;
  worker_id: string;
  model: string | null;
  temperature: number | null;
  max_tokens: number | null;
  enabled: number;
  updated_at: string;
};

export type WorkerStateRow = {
  id: string;
  user_id: string;
  worker_id: string;
  profile_name: string | null;
  model: string | null;
  server_url: string | null;
  session_id: string | null;
  ui_session_id: string | null;
  status: string | null;
  session_mode: string | null;
  parent_session_id: string | null;
  started_at: string | null;
  last_activity: string | null;
  current_task: string | null;
  last_result: string | null;
  last_result_at: string | null;
  last_result_job_id: string | null;
  last_result_duration_ms: number | null;
  error: string | null;
  warning: string | null;
  updated_at: string;
};

export type User = {
  id: string;
  onboarded: boolean;
  onboardedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Preference = {
  id: string;
  userId: string;
  key: string;
  value: string | null;
  updatedAt: Date;
};

export type WorkerConfig = {
  id: string;
  userId: string;
  workerId: string;
  model: string | null;
  temperature: number | null;
  maxTokens: number | null;
  enabled: boolean;
  updatedAt: Date;
};

export type WorkerState = {
  id: string;
  userId: string;
  workerId: string;
  profileName: string | null;
  model: string | null;
  serverUrl: string | null;
  sessionId: string | null;
  uiSessionId: string | null;
  status: string | null;
  sessionMode: string | null;
  parentSessionId: string | null;
  startedAt: Date | null;
  lastActivity: Date | null;
  currentTask: string | null;
  lastResult: {
    at?: string;
    jobId?: string;
    response?: string;
    report?: {
      summary?: string;
      details?: string;
      issues?: string[];
      notes?: string;
    };
    durationMs?: number;
  } | null;
  lastResultAt: Date | null;
  lastResultJobId: string | null;
  lastResultDurationMs: number | null;
  error: string | null;
  warning: string | null;
  updatedAt: Date;
};

export function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    onboarded: row.onboarded === 1,
    onboardedAt: row.onboarded_at ? new Date(row.onboarded_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function rowToPreference(row: PreferenceRow): Preference {
  return {
    id: row.id,
    userId: row.user_id,
    key: row.key,
    value: row.value,
    updatedAt: new Date(row.updated_at),
  };
}

export function rowToWorkerConfig(row: WorkerConfigRow): WorkerConfig {
  return {
    id: row.id,
    userId: row.user_id,
    workerId: row.worker_id,
    model: row.model,
    temperature: row.temperature,
    maxTokens: row.max_tokens,
    enabled: row.enabled === 1,
    updatedAt: new Date(row.updated_at),
  };
}

export function rowToWorkerState(row: WorkerStateRow): WorkerState {
  let parsedResult: WorkerState["lastResult"] = null;
  if (row.last_result) {
    try {
      parsedResult = JSON.parse(row.last_result) as WorkerState["lastResult"];
    } catch {
      parsedResult = null;
    }
  }
  return {
    id: row.id,
    userId: row.user_id,
    workerId: row.worker_id,
    profileName: row.profile_name,
    model: row.model,
    serverUrl: row.server_url,
    sessionId: row.session_id,
    uiSessionId: row.ui_session_id,
    status: row.status,
    sessionMode: row.session_mode,
    parentSessionId: row.parent_session_id,
    startedAt: row.started_at ? new Date(row.started_at) : null,
    lastActivity: row.last_activity ? new Date(row.last_activity) : null,
    currentTask: row.current_task,
    lastResult: parsedResult,
    lastResultAt: row.last_result_at ? new Date(row.last_result_at) : null,
    lastResultJobId: row.last_result_job_id,
    lastResultDurationMs: row.last_result_duration_ms,
    error: row.error,
    warning: row.warning,
    updatedAt: new Date(row.updated_at),
  };
}

```

---

## File: helpers/advanced-util.ts

```typescript
import { debuglog, format, inspect } from "node:util";
import type { WorkerInstance } from "../types";

// Enhanced debugging for worker states
export const workerDebug = debuglog("opencode:worker");

// Type checking utilities
export const isWorkerInstance = (obj: unknown): obj is WorkerInstance => {
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof (obj as WorkerInstance).profile === "object" &&
    typeof (obj as WorkerInstance).status === "string"
  );
};

// Formatted worker status reporting
export const formatWorkerStatus = (worker: WorkerInstance): string => {
  return format(
    "Worker %s: %s (pid: %s, port: %s)",
    worker.profile.id,
    worker.status,
    worker.pid || "unknown",
    worker.port || "unknown",
  );
};

// Enhanced inspection for worker objects
export const inspectWorker = (worker: WorkerInstance, depth: number = 2): string => {
  return inspect(worker, {
    depth,
    colors: process.stdout.isTTY,
    compact: false,
    showHidden: false,
  });
};

// Safe JSON parsing with error handling
export const safeJsonParse = <T = unknown>(str: string, fallback: T): T => {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
};

// Timeout utility for async operations
export const withTimeout = <T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError: Error = new Error("Operation timed out"),
): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(timeoutError), timeoutMs);
    }),
  ]);
};

// Retry utility with exponential backoff
export const retry = async <T>(fn: () => Promise<T>, maxAttempts: number = 3, baseDelay: number = 1000): Promise<T> => {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxAttempts) {
        throw lastError;
      }

      const delay = baseDelay * 2 ** (attempt - 1);
      workerDebug(`Attempt ${attempt} failed, retrying in ${delay}ms: ${lastError.message}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
};

// Memory usage formatting
export const formatMemoryUsage = (bytes: number): string => {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
};

// Performance timer utility
export const createTimer = () => {
  const start = process.hrtime.bigint();

  return {
    elapsed: (): number => {
      const end = process.hrtime.bigint();
      return Number(end - start) / 1000000; // Convert to milliseconds
    },

    elapsedMicros: (): number => {
      const end = process.hrtime.bigint();
      return Number(end - start) / 1000; // Convert to microseconds
    },
  };
};

// Safe process exit handling
export const gracefulShutdown = (cleanup: () => Promise<void> | void) => {
  const shutdown = async (signal: string) => {
    workerDebug(`Received ${signal}, starting graceful shutdown`);
    try {
      await cleanup();
      workerDebug("Cleanup completed, exiting");
      process.exit(0);
    } catch (error) {
      workerDebug(`Cleanup failed: ${error}`);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGUSR2", () => shutdown("SIGUSR2")); // For nodemon
};

```

---

## File: helpers/format.ts

```typescript
import { homedir } from "node:os";
import { join } from "node:path";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asBooleanRecord(value: unknown): Record<string, boolean> | undefined {
  if (!isPlainObject(value)) return undefined;
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v !== "boolean") return undefined;
    out[k] = v;
  }
  return out;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (value.every((v) => typeof v === "string")) return value;
  return undefined;
}

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (Array.isArray(v)) {
      out[k] = v;
    } else if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = deepMerge(out[k] as Record<string, unknown>, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function getUserConfigDir(): string {
  // Linux/macOS: respect XDG_CONFIG_HOME; Windows best-effort.
  if (process.platform === "win32") {
    return process.env.APPDATA || join(homedir(), "AppData", "Roaming");
  }
  return process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
}

export { isPlainObject, asBooleanRecord, asStringArray, deepMerge, getUserConfigDir };

```

---

## File: helpers/fs.ts

```typescript
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

type WriteJsonAtomicOptions = {
  tmpPrefix?: string;
  fs?: {
    mkdir?: typeof mkdir;
    rename?: typeof rename;
    unlink?: typeof unlink;
    writeFile?: typeof writeFile;
  };
};

/**
 * Write JSON data atomically using a temp file and rename.
 *
 * Uses a temp file in the same directory as the target to ensure rename is atomic
 * (same filesystem). Falls back to direct write only if same-directory temp fails,
 * with a warning that atomicity is not guaranteed.
 */
export async function writeJsonAtomic(path: string, data: unknown, options?: WriteJsonAtomicOptions): Promise<void> {
  const fs = {
    mkdir: options?.fs?.mkdir ?? mkdir,
    rename: options?.fs?.rename ?? rename,
    unlink: options?.fs?.unlink ?? unlink,
    writeFile: options?.fs?.writeFile ?? writeFile,
  };

  const targetDir = dirname(path);
  await fs.mkdir(targetDir, { recursive: true }).catch(() => {});

  // Use temp file in same directory to ensure atomic rename (same filesystem)
  const tmpName = `.${options?.tmpPrefix ?? "opencode-orch"}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`;
  const tmp = join(targetDir, tmpName);

  try {
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tmp, path);
  } catch (_renameError) {
    // Clean up temp file if it exists
    await fs.unlink(tmp).catch(() => {});

    // Last resort: direct write (not atomic, but better than failing)
    // This should rarely happen since temp is in same directory
    console.warn(
      `[writeJsonAtomic] Atomic rename failed for ${path}, falling back to direct write. ` +
        `Data integrity is not guaranteed if process crashes during write.`,
    );
    await fs.writeFile(path, JSON.stringify(data, null, 2), "utf8");
  }
}

```

---

## File: helpers/process.ts

```typescript
type IsProcessAliveOptions = {
  treatEpermAsAlive?: boolean;
};

export function isProcessAlive(pid: number, options?: IsProcessAliveOptions): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    if (
      options?.treatEpermAsAlive &&
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "EPERM"
    ) {
      return true;
    }
    return false;
  }
}

```

---

## File: index.ts

```typescript
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Hooks, Plugin } from "@opencode-ai/plugin";
import { loadOrchestratorConfig } from "./config/orchestrator";
import { createCore } from "./core";
import { cleanupStaleWorkers } from "./workers/pid-tracker";

/** Load .env file from a directory into process.env (silent, no overwrites). */
function loadEnvFile(directory: string): void {
  const envPath = join(directory, ".env");
  if (!existsSync(envPath)) return;
  try {
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      // Don't overwrite existing env vars
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // Silently ignore .env load failures
  }
}

const GLOBAL_KEY = "__opencode_orchestra_core__";

type GlobalCoreState = {
  core?: ReturnType<typeof createCore>;
  hooks?: Hooks;
  startPromise?: Promise<void>;
  exitHandlersSet?: boolean;
};

const globalStore = globalThis as unknown as Record<string, GlobalCoreState | undefined>;
const existingState = globalStore[GLOBAL_KEY];
const globalState = existingState ?? {};
if (existingState === undefined || existingState === null) {
  globalStore[GLOBAL_KEY] = globalState;
}

export const OrchestratorPlugin: Plugin = async (ctx) => {
  // Load .env from project directory (before any other initialization)
  loadEnvFile(ctx.directory);

  if (process.env.OPENCODE_ORCHESTRATOR_WORKER === "1") {
    return {};
  }

  if (globalState.hooks) {
    return globalState.hooks;
  }

  if (globalState.startPromise) {
    await globalState.startPromise;
    return globalState.hooks ?? {};
  }

  globalState.startPromise = (async () => {
    // Clean up stale worker entries from previous sessions (silent)
    await cleanupStaleWorkers();

    const { config } = await loadOrchestratorConfig({
      directory: ctx.directory,
      worktree: ctx.worktree || undefined,
    });
    const core = createCore({ config: { ctx, config }, deps: {} });
    await core.start();
    globalState.core = core;
    globalState.hooks = core.hooks;

    if (!globalState.exitHandlersSet) {
      globalState.exitHandlersSet = true;
      const onExit = async () => {
        await core.stop().catch(() => {});
      };
      process.once("beforeExit", () => {
        void onExit();
      });
      process.once("SIGINT", () => {
        void onExit();
        process.exit(130);
      });
      process.once("SIGTERM", () => {
        void onExit();
        process.exit(143);
      });
    }
  })();

  await globalState.startPromise;
  return globalState.hooks ?? {};
};

export default OrchestratorPlugin;
export { createCommandRouter } from "./commands";

```

---

## File: integrations/linear-config.ts

```typescript
import type { LinearIntegrationConfig } from "../types";
import type { LinearConfig } from "./linear-types";

const DEFAULT_API_URL = "https://api.linear.app/graphql";

/** Load Linear config from environment variables, if available. */
export const loadLinearConfigFromEnv = (): LinearConfig | undefined => {
  const apiKey = process.env.LINEAR_API_KEY;
  const teamId = process.env.LINEAR_TEAM_ID;
  if (!apiKey || !teamId) return undefined;
  return {
    apiKey,
    teamId,
    apiUrl: process.env.LINEAR_API_URL || DEFAULT_API_URL,
    projectPrefix: process.env.LINEAR_PROJECT_PREFIX || undefined,
  };
};

/** Resolve Linear config from integration settings and environment variables. */
export const resolveLinearConfig = (input?: LinearIntegrationConfig): LinearConfig => {
  if (input?.enabled === false) {
    throw new Error("Linear integration is disabled.");
  }

  const apiKey = input?.apiKey || process.env.LINEAR_API_KEY;
  const teamId = input?.teamId || process.env.LINEAR_TEAM_ID;
  if (!apiKey || !teamId) {
    throw new Error("Missing Linear credentials. Set LINEAR_API_KEY and LINEAR_TEAM_ID.");
  }

  return {
    apiKey,
    teamId,
    apiUrl: input?.apiUrl || process.env.LINEAR_API_URL || DEFAULT_API_URL,
    projectPrefix: input?.projectPrefix || process.env.LINEAR_PROJECT_PREFIX || undefined,
  };
};

```

---

## File: integrations/linear-issues.ts

```typescript
import { linearRequest } from "./linear-request";
import { getTeamStates, normalizeStatus } from "./linear-teams";
import type { LinearConfig, LinearIssue } from "./linear-types";

/** Create a new issue in Linear. */
export const createIssue = async (input: {
  cfg: LinearConfig;
  title: string;
  description?: string;
  projectId?: string;
  priority?: number;
  estimate?: number;
}): Promise<{ issueId: string; identifier?: string; url?: string }> => {
  const data = await linearRequest<{
    issueCreate: { success: boolean; issue?: LinearIssue };
  }>(
    input.cfg,
    `mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier url }
      }
    }`,
    {
      input: {
        title: input.title,
        description: input.description,
        teamId: input.cfg.teamId,
        projectId: input.projectId,
        priority: input.priority,
        estimate: input.estimate,
      },
    },
  );

  const issue = data.issueCreate.issue;
  if (!issue?.id) throw new Error("Linear API error: Issue not created.");
  return { issueId: issue.id, identifier: issue.identifier, url: issue.url ?? undefined };
};

/** Update fields on an existing Linear issue. */
export const updateIssue = async (input: {
  cfg: LinearConfig;
  issueId: string;
  title?: string;
  description?: string;
  stateId?: string;
  priority?: number;
  estimate?: number;
  labelIds?: string[];
  projectId?: string;
  assigneeId?: string;
}): Promise<{ issueId: string; title?: string; url?: string }> => {
  const data = await linearRequest<{
    issueUpdate: { success: boolean; issue?: LinearIssue };
  }>(
    input.cfg,
    `mutation UpdateIssue($input: IssueUpdateInput!) {
      issueUpdate(input: $input) {
        success
        issue { id title url }
      }
    }`,
    {
      input: {
        id: input.issueId,
        title: input.title,
        description: input.description,
        stateId: input.stateId,
        priority: input.priority,
        estimate: input.estimate,
        labelIds: input.labelIds,
        projectId: input.projectId,
        assigneeId: input.assigneeId,
      },
    },
  );

  const issue = data.issueUpdate.issue;
  if (!issue?.id) throw new Error("Linear API error: Issue not updated.");
  return { issueId: issue.id, title: issue.title, url: issue.url ?? undefined };
};

/** Add a comment to a Linear issue. */
export const addComment = async (input: {
  cfg: LinearConfig;
  issueId: string;
  body: string;
}): Promise<{ commentId: string; url?: string }> => {
  const data = await linearRequest<{
    commentCreate: { success: boolean; comment?: { id: string; url?: string } };
  }>(
    input.cfg,
    `mutation AddComment($input: CommentCreateInput!) {
      commentCreate(input: $input) {
        success
        comment { id url }
      }
    }`,
    {
      input: {
        issueId: input.issueId,
        body: input.body,
      },
    },
  );

  const comment = data.commentCreate.comment;
  if (!comment?.id) throw new Error("Linear API error: Comment not created.");
  return { commentId: comment.id, url: comment.url ?? undefined };
};

/** Fetch a Linear issue by ID. */
export const getIssue = async (input: { cfg: LinearConfig; issueId: string }): Promise<LinearIssue> => {
  const data = await linearRequest<{ issue: LinearIssue }>(
    input.cfg,
    `query GetIssue($id: String!) {
      issue(id: $id) {
        id
        identifier
        title
        description
        url
        priority
        estimate
        state { id name type }
        labels { nodes { id name } }
        assignee { id name }
        project { id name }
      }
    }`,
    { id: input.issueId },
  );

  if (!data.issue?.id) throw new Error("Linear API error: Issue not found.");
  return data.issue;
};

/** Fetch label IDs currently applied to a Linear issue. */
export const getIssueLabelIds = async (input: { cfg: LinearConfig; issueId: string }): Promise<string[]> => {
  const data = await linearRequest<{
    issue: { labels: { nodes: Array<{ id: string }> } };
  }>(
    input.cfg,
    `query IssueLabels($id: ID!) {
      issue(id: $id) {
        labels { nodes { id } }
      }
    }`,
    { id: input.issueId },
  );

  return data.issue?.labels?.nodes?.map((label) => label.id) ?? [];
};

/** Add a label to a Linear issue, preserving existing labels. */
export const addLabel = async (input: {
  cfg: LinearConfig;
  issueId: string;
  labelId: string;
}): Promise<{ issueId: string; labelIds: string[] }> => {
  const existing = await getIssueLabelIds({ cfg: input.cfg, issueId: input.issueId });
  const next = Array.from(new Set([...existing, input.labelId]));
  await updateIssue({ cfg: input.cfg, issueId: input.issueId, labelIds: next });
  return { issueId: input.issueId, labelIds: next };
};

/** Set an estimate on a Linear issue. */
export const setEstimate = async (input: {
  cfg: LinearConfig;
  issueId: string;
  estimate: number;
}): Promise<{ issueId: string; estimate: number }> => {
  await updateIssue({ cfg: input.cfg, issueId: input.issueId, estimate: input.estimate });
  return { issueId: input.issueId, estimate: input.estimate };
};

/** Map a status label to a Linear workflow state and update the issue. */
export const syncTaskStatus = async (input: {
  cfg: LinearConfig;
  issueId: string;
  status: string;
}): Promise<{ issueId: string; stateId: string }> => {
  const states = await getTeamStates({ cfg: input.cfg });
  const desired = normalizeStatus(input.status);

  const typeMap: Record<string, string> = {
    backlog: "backlog",
    todo: "unstarted",
    unstarted: "unstarted",
    in_progress: "started",
    started: "started",
    review: "started",
    done: "completed",
    completed: "completed",
    canceled: "canceled",
  };

  const desiredType = typeMap[desired];
  const byType = desiredType ? states.find((state) => state.type?.toLowerCase() === desiredType) : undefined;
  const byName = states.find((state) => normalizeStatus(state.name || "") === desired);
  const chosen = byType || byName;
  if (!chosen?.id) {
    throw new Error(`Linear API error: No matching state for status '${input.status}'.`);
  }

  await updateIssue({ cfg: input.cfg, issueId: input.issueId, stateId: chosen.id });
  return { issueId: input.issueId, stateId: chosen.id };
};

```

---

## File: integrations/linear-projects.ts

```typescript
import { linearRequest } from "./linear-request";
import type { LinearConfig, LinearProject, LinearProjectStatus } from "./linear-types";

const applyProjectPrefix = (cfg: LinearConfig, name: string): string => {
  const prefix = cfg.projectPrefix;
  if (!prefix) return name;
  const normalized = `${prefix}-`;
  if (name.startsWith(normalized)) return name;
  return `${normalized}${name}`;
};

/** Fetch the current Linear viewer identity. */
export const getViewer = async (cfg: LinearConfig): Promise<{ id: string; name?: string; email?: string }> => {
  const data = await linearRequest<{ viewer: { id: string; name?: string; email?: string } }>(
    cfg,
    "query Viewer { viewer { id name email } }",
  );
  return data.viewer;
};

/** Create a new Linear project. */
export const createProject = async (input: {
  cfg: LinearConfig;
  name: string;
  description?: string;
  teamId?: string;
}): Promise<{ projectId: string; name?: string; url?: string }> => {
  const name = applyProjectPrefix(input.cfg, input.name);
  const data = await linearRequest<{
    projectCreate: { success: boolean; project?: LinearProject };
  }>(
    input.cfg,
    `mutation CreateProject($input: ProjectCreateInput!) {
      projectCreate(input: $input) {
        success
        project { id name url }
      }
    }`,
    {
      input: {
        name,
        description: input.description,
        teamId: input.teamId ?? input.cfg.teamId,
      },
    },
  );

  const project = data.projectCreate.project;
  if (!project?.id) throw new Error("Linear API error: Project not created.");
  return { projectId: project.id, name: project.name, url: project.url ?? undefined };
};

/** Fetch status fields for a Linear project. */
export const getProjectStatus = async (input: {
  cfg: LinearConfig;
  projectId: string;
}): Promise<LinearProjectStatus> => {
  const data = await linearRequest<{ project: LinearProject }>(
    input.cfg,
    `query ProjectStatus($id: ID!) {
      project(id: $id) {
        id
        name
        state
        url
        progress
        issueCount
        completedIssueCount
      }
    }`,
    { id: input.projectId },
  );

  if (!data.project?.id) throw new Error("Linear API error: Project not found.");
  return { project: data.project };
};

```

---

## File: integrations/linear-request.ts

```typescript
import type { LinearConfig } from "./linear-types";

type LinearGraphQLError = {
  message: string;
};

type LinearGraphQLResponse<T> = {
  data?: T;
  errors?: LinearGraphQLError[];
};

export const linearRequest = async <T>(
  cfg: LinearConfig,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> => {
  const response = await fetch(cfg.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: cfg.apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Linear API error: HTTP ${response.status} ${response.statusText}`);
  }

  let payload: LinearGraphQLResponse<T>;
  try {
    payload = JSON.parse(text) as LinearGraphQLResponse<T>;
  } catch {
    throw new Error("Linear API error: Invalid JSON response.");
  }

  if (payload.errors && payload.errors.length > 0) {
    throw new Error(`Linear API error: ${payload.errors.map((e) => e.message).join("; ")}`);
  }
  if (!payload.data) {
    throw new Error("Linear API error: Missing response data.");
  }
  return payload.data;
};

```

---

## File: integrations/linear-teams.ts

```typescript
import { linearRequest } from "./linear-request";
import type { LinearConfig, LinearTeamState } from "./linear-types";

/** Fetch workflow states for a Linear team. */
export const getTeamStates = async (input: { cfg: LinearConfig; teamId?: string }): Promise<LinearTeamState[]> => {
  const data = await linearRequest<{
    team: { states: { nodes: LinearTeamState[] } };
  }>(
    input.cfg,
    `query TeamStates($id: ID!) {
      team(id: $id) {
        states {
          nodes { id name type }
        }
      }
    }`,
    { id: input.teamId ?? input.cfg.teamId },
  );

  return data.team?.states?.nodes ?? [];
};

/** Normalize a status string to a slug-friendly format. */
export const normalizeStatus = (status: string): string => status.trim().toLowerCase().replace(/\s+/g, "_");

```

---

## File: integrations/linear-types.ts

```typescript
export type LinearConfig = {
  apiKey: string;
  teamId: string;
  apiUrl: string;
  projectPrefix?: string;
};

export type LinearIssue = {
  id: string;
  title?: string;
  url?: string;
  identifier?: string;
};

export type LinearProject = {
  id: string;
  name?: string;
  state?: string;
  url?: string;
  progress?: number | null;
  issueCount?: number | null;
  completedIssueCount?: number | null;
};

export type LinearProjectStatus = {
  project: LinearProject;
};

export type LinearTeamState = {
  id: string;
  name?: string;
  type?: string;
};

```

---

## File: integrations/linear.ts

```typescript
export { loadLinearConfigFromEnv, resolveLinearConfig } from "./linear-config";
export {
  addComment,
  addLabel,
  createIssue,
  getIssue,
  getIssueLabelIds,
  setEstimate,
  syncTaskStatus,
  updateIssue,
} from "./linear-issues";
export { createProject, getProjectStatus, getViewer } from "./linear-projects";
export { getTeamStates } from "./linear-teams";
export type {
  LinearConfig,
  LinearIssue,
  LinearProject,
  LinearProjectStatus,
  LinearTeamState,
} from "./linear-types";

```

---

## File: integrations/registry.ts

```typescript
import type { ToolDefinition } from "@opencode-ai/plugin";
import { isPlainObject } from "../helpers/format";
import { createLinearTools } from "../tools/linear-tools";
import type { IntegrationsConfig, LinearIntegrationConfig } from "../types";
import { resolveLinearConfig } from "./linear-config";
import type { LinearConfig } from "./linear-types";

export type IntegrationToolGroup = {
  orchestrator?: Record<string, ToolDefinition>;
  workers?: Record<string, ToolDefinition>;
};

export type IntegrationDefinition = {
  key: string;
  resolveConfig?: (config: unknown) => unknown | undefined;
  toEnv?: (config: unknown) => Record<string, string>;
  tools?: (input: { config: unknown }) => IntegrationToolGroup;
};

const registry = new Map<string, IntegrationDefinition>();

export const registerIntegration = (definition: IntegrationDefinition): void => {
  registry.set(definition.key, definition);
};

const resolveConfigSafe = (definition: IntegrationDefinition, config: unknown): unknown | undefined => {
  if (!definition.resolveConfig) return config;
  try {
    return definition.resolveConfig(config);
  } catch {
    return undefined;
  }
};

export const getIntegrationTools = (
  integrations?: IntegrationsConfig,
): { orchestrator: Record<string, ToolDefinition>; workers: Record<string, ToolDefinition> } => {
  const raw = (integrations ?? {}) as Record<string, unknown>;
  const orchestrator: Record<string, ToolDefinition> = {};
  const workers: Record<string, ToolDefinition> = {};

  for (const definition of registry.values()) {
    if (!definition.tools) continue;
    const resolved = resolveConfigSafe(definition, raw[definition.key]);
    if (resolved === undefined) continue;

    const tools = definition.tools({ config: raw[definition.key] });
    if (tools.orchestrator) Object.assign(orchestrator, tools.orchestrator);
    if (tools.workers) Object.assign(workers, tools.workers);
  }

  return { orchestrator, workers };
};

export const getIntegrationEnv = (integrations: Record<string, unknown>): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const definition of registry.values()) {
    if (!definition.toEnv) continue;
    const resolved = resolveConfigSafe(definition, integrations[definition.key]);
    if (resolved === undefined) continue;
    Object.assign(env, definition.toEnv(resolved));
  }
  return env;
};

const toLinearEnv = (cfg: LinearConfig): Record<string, string> => {
  const env: Record<string, string> = {};
  if (cfg.apiKey) env.LINEAR_API_KEY = cfg.apiKey;
  if (cfg.teamId) env.LINEAR_TEAM_ID = cfg.teamId;
  if (cfg.apiUrl) env.LINEAR_API_URL = cfg.apiUrl;
  if (cfg.projectPrefix) env.LINEAR_PROJECT_PREFIX = cfg.projectPrefix;
  return env;
};

registerIntegration({
  key: "linear",
  resolveConfig: (config) => resolveLinearConfig(config as LinearIntegrationConfig | undefined),
  toEnv: (config) => toLinearEnv(config as LinearConfig),
  tools: (input) => createLinearTools({ config: input.config as LinearIntegrationConfig }),
});

registerIntegration({
  key: "neo4j",
  resolveConfig: (config) => {
    if (!isPlainObject(config)) return undefined;
    if (config.enabled === false) return undefined;
    return config;
  },
  toEnv: (config) => {
    if (!isPlainObject(config)) return {};
    const env: Record<string, string> = {};
    if (typeof config.uri === "string") env.OPENCODE_NEO4J_URI = config.uri;
    if (typeof config.username === "string") env.OPENCODE_NEO4J_USERNAME = config.username;
    if (typeof config.password === "string") env.OPENCODE_NEO4J_PASSWORD = config.password;
    if (typeof config.database === "string") env.OPENCODE_NEO4J_DATABASE = config.database;
    return env;
  },
});

```

---

## File: integrations/selection.ts

```typescript
import type { IntegrationsConfig, WorkerProfile } from "../types";

export const resolveIntegrationsForProfile = (
  profile: WorkerProfile,
  globalIntegrations?: IntegrationsConfig,
): Record<string, unknown> => {
  const selection = profile.integrations;
  if (!selection) return {};

  const integrations = (globalIntegrations ?? {}) as Record<string, unknown>;
  const resolved: Record<string, unknown> = {};

  if (selection.inheritAll) {
    for (const [key, value] of Object.entries(integrations)) {
      if (value !== undefined) resolved[key] = value;
    }
  }

  if (selection.include && selection.include.length > 0) {
    for (const key of selection.include) {
      if (key in integrations) resolved[key] = integrations[key];
    }
  }

  if (selection.exclude && selection.exclude.length > 0) {
    for (const key of selection.exclude) {
      delete resolved[key];
    }
  }

  return resolved;
};

```

---

## File: memory/auto.ts

```typescript
import type { MemoryNode } from "./graph/shared";
import { loadNeo4jConfig, type Neo4jConfig } from "./neo4j";
import type { MemoryScope } from "./store";
import { getMemoryByKey, linkMemory, trimGlobalMessageProjects, trimMemoryByKeyPrefix, upsertMemory } from "./store";
import { appendRollingSummary, normalizeForMemory } from "./text";

export type MessageMemoryInput = {
  cfg?: Neo4jConfig;
  text: string;
  sessionId?: string;
  messageId?: string;
  role?: string;
  userId?: string;
  scope: MemoryScope;
  projectId?: string;
  maxChars?: number;
  deps?: {
    loadNeo4jConfig?: typeof loadNeo4jConfig;
    upsertMemory?: typeof upsertMemory;
    linkMemory?: typeof linkMemory;
    getMemoryByKey?: typeof getMemoryByKey;
    trimMemoryByKeyPrefix?: typeof trimMemoryByKeyPrefix;
    trimGlobalMessageProjects?: typeof trimGlobalMessageProjects;
  };
  summaries?: {
    enabled?: boolean;
    sessionMaxChars?: number;
    projectMaxChars?: number;
  };
  trim?: {
    maxMessagesPerSession?: number;
    maxMessagesPerProject?: number;
    maxMessagesGlobal?: number;
    maxProjectsGlobal?: number;
  };
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export async function recordMessageMemory(input: MessageMemoryInput): Promise<void> {
  const deps = input.deps ?? {};
  const loadNeo4jConfigFn = deps.loadNeo4jConfig ?? loadNeo4jConfig;
  const upsertMemoryFn = deps.upsertMemory ?? upsertMemory;
  const linkMemoryFn = deps.linkMemory ?? linkMemory;
  const getMemoryByKeyFn = deps.getMemoryByKey ?? getMemoryByKey;
  const trimMemoryByKeyPrefixFn = deps.trimMemoryByKeyPrefix ?? trimMemoryByKeyPrefix;
  const trimGlobalMessageProjectsFn = deps.trimGlobalMessageProjects ?? trimGlobalMessageProjects;

  const cfg = input.cfg ?? loadNeo4jConfigFn();

  const text = input.text.trim();
  if (!text) return;

  const maxChars = clamp(input.maxChars ?? 2000, 100, 8000);
  const keyBase = input.messageId ?? `${Date.now()}`;
  const session = input.sessionId ?? "unknown";
  const role = input.role ?? "unknown";
  const userId = input.userId ?? "unknown";
  const projectId = input.projectId;
  const key =
    input.scope === "global"
      ? `message:${projectId ?? "unknown"}:${session}:${keyBase}`
      : `message:${session}:${keyBase}`;

  const tags = ["message", role, `session:${session}`, `user:${userId}`];
  if (projectId) tags.push(`project:${projectId}`);

  try {
    await upsertMemoryFn({
      cfg,
      scope: input.scope,
      projectId: input.scope === "project" ? input.projectId : undefined,
      key,
      value: normalizeForMemory(text, maxChars),
      tags,
    });
  } catch {}

  const projectKey = projectId ? `project:${projectId}` : undefined;
  const userKey = `user:${userId}`;

  try {
    await upsertMemoryFn({
      cfg,
      scope: input.scope,
      projectId: input.scope === "project" ? projectId : undefined,
      key: userKey,
      value: `User ${userId}`,
      tags: ["user"],
    });
  } catch {}

  // Also keep a lightweight global index of known users/projects for cross-project retrieval.
  try {
    await upsertMemoryFn({
      cfg,
      scope: "global",
      key: userKey,
      value: `User ${userId}`,
      tags: ["user"],
    });
  } catch {}

  if (projectKey) {
    try {
      await upsertMemoryFn({
        cfg,
        scope: input.scope === "project" ? "project" : "global",
        ...(input.scope === "project" ? { projectId } : {}),
        key: projectKey,
        value: `Project ${projectId}`,
        tags: ["project"],
      });
    } catch {}

    try {
      await upsertMemoryFn({
        cfg,
        scope: "global",
        key: projectKey,
        value: `Project ${projectId}`,
        tags: ["project"],
      });
    } catch {}
  }

  try {
    await linkMemoryFn({
      cfg,
      scope: input.scope,
      projectId: input.scope === "project" ? projectId : undefined,
      fromKey: key,
      toKey: userKey,
      type: "belongs_to_user",
    });
  } catch {}

  if (projectKey) {
    try {
      await linkMemoryFn({
        cfg,
        scope: input.scope,
        projectId: input.scope === "project" ? projectId : undefined,
        fromKey: key,
        toKey: projectKey,
        type: "belongs_to_project",
      });
    } catch {}
  }

  const summariesEnabled = input.summaries?.enabled !== false;
  if (summariesEnabled && projectId) {
    const entrySnippet = normalizeForMemory(text, 420);
    const entry = `- ${new Date().toISOString()} [${role}/${userId}] ${entrySnippet}`;

    const projectMaxChars = clamp(input.summaries?.projectMaxChars ?? 2000, 200, 20000);
    const globalProjectSummaryKey = `summary:project:${projectId}`;

    if (input.scope === "project") {
      let prev: MemoryNode | undefined;
      try {
        prev = await getMemoryByKeyFn({ cfg, scope: "project", projectId, key: "summary:project" });
      } catch {
        prev = undefined;
      }
      const next = appendRollingSummary(prev?.value, entry, projectMaxChars);
      try {
        await upsertMemoryFn({
          cfg,
          scope: "project",
          projectId,
          key: "summary:project",
          value: next,
          tags: ["summary", "project"],
        });
      } catch {}

      const sessionMaxChars = clamp(input.summaries?.sessionMaxChars ?? 2000, 200, 20000);
      const sessionKey = `summary:session:${session}`;
      let prevSession: MemoryNode | undefined;
      try {
        prevSession = await getMemoryByKeyFn({ cfg, scope: "project", projectId, key: sessionKey });
      } catch {
        prevSession = undefined;
      }
      const nextSession = appendRollingSummary(prevSession?.value, entry, sessionMaxChars);
      try {
        await upsertMemoryFn({
          cfg,
          scope: "project",
          projectId,
          key: sessionKey,
          value: nextSession,
          tags: ["summary", "session", `session:${session}`],
        });
      } catch {}
    }

    // Always update a global per-project summary for cross-project retrieval.
    let prevGlobal: MemoryNode | undefined;
    try {
      prevGlobal = await getMemoryByKeyFn({ cfg, scope: "global", key: globalProjectSummaryKey });
    } catch {
      prevGlobal = undefined;
    }
    const nextGlobal = appendRollingSummary(prevGlobal?.value, entry, projectMaxChars);
    try {
      await upsertMemoryFn({
        cfg,
        scope: "global",
        key: globalProjectSummaryKey,
        value: nextGlobal,
        tags: ["summary", "project", `project:${projectId}`],
      });
    } catch {}
  }

  // Trimming: keep memory bounded.
  const maxPerSession = input.trim?.maxMessagesPerSession;
  const maxPerProject = input.trim?.maxMessagesPerProject;
  const maxGlobal = input.trim?.maxMessagesGlobal;
  const maxProjectsGlobal = input.trim?.maxProjectsGlobal;

  const sessionLimit = typeof maxPerSession === "number" ? clamp(maxPerSession, 0, 10000) : undefined;
  const projectLimit = typeof maxPerProject === "number" ? clamp(maxPerProject, 0, 100000) : undefined;
  const globalLimit = typeof maxGlobal === "number" ? clamp(maxGlobal, 0, 200000) : undefined;
  const projectsLimit = typeof maxProjectsGlobal === "number" ? clamp(maxProjectsGlobal, 0, 10000) : undefined;

  if (sessionLimit !== undefined) {
    const prefix = input.scope === "global" ? `message:${projectId ?? "unknown"}:${session}:` : `message:${session}:`;
    try {
      await trimMemoryByKeyPrefixFn({
        cfg,
        scope: input.scope,
        projectId: input.scope === "project" ? projectId : undefined,
        keyPrefix: prefix,
        keepLatest: sessionLimit,
      });
    } catch {}
  }

  if (projectLimit !== undefined && projectId) {
    const prefix = input.scope === "global" ? `message:${projectId}:` : "message:";
    try {
      await trimMemoryByKeyPrefixFn({
        cfg,
        scope: input.scope,
        projectId: input.scope === "project" ? projectId : undefined,
        keyPrefix: prefix,
        keepLatest: projectLimit,
      });
    } catch {}
  }

  if (input.scope === "global" && globalLimit !== undefined) {
    try {
      await trimMemoryByKeyPrefixFn({ cfg, scope: "global", keyPrefix: "message:", keepLatest: globalLimit });
    } catch {}
  }

  if (input.scope === "global" && projectsLimit !== undefined) {
    try {
      await trimGlobalMessageProjectsFn({ cfg, keepProjects: projectsLimit });
    } catch {}
  }
}

```

---

## File: memory/graph.ts

```typescript
import type { Record } from "neo4j-driver";
import type { MemoryNode, MemoryRecordShape, MemoryScope } from "./graph/shared";
import { requireProjectId, toNode } from "./graph/shared";
import type { Neo4jConfig } from "./neo4j";
import { withNeo4jSession } from "./neo4j";

export async function upsertMemory(input: {
  cfg: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  key: string;
  value: string;
  tags?: string[];
  deps?: { withSession?: typeof withNeo4jSession };
}): Promise<MemoryNode> {
  const scope = input.scope;
  const projectId = requireProjectId(scope, input.projectId);
  const withSession = input.deps?.withSession ?? withNeo4jSession;

  return await withSession(input.cfg, async (session) => {
    const mergePattern =
      scope === "project" ? `{ scope: $scope, projectId: $projectId, key: $key }` : `{ scope: $scope, key: $key }`;
    const res = await session.run(
      `
MERGE (n:Memory ${mergePattern})
ON CREATE SET n.createdAt = timestamp()
SET n.value = $value,
    n.tags = $tags,
    n.updatedAt = timestamp()
RETURN n
      `.trim(),
      {
        scope,
        ...(scope === "project" ? { projectId } : {}),
        key: input.key,
        value: input.value,
        tags: input.tags ?? [],
      },
    );
    const rec = res.records?.[0] as Record<MemoryRecordShape> | undefined;
    if (!rec) throw new Error("No record returned from Neo4j");
    return toNode(rec);
  });
}

export async function linkMemory(input: {
  cfg: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  fromKey: string;
  toKey: string;
  type?: string;
  deps?: { withSession?: typeof withNeo4jSession };
}): Promise<{ ok: true }> {
  const scope = input.scope;
  const projectId = requireProjectId(scope, input.projectId);
  const type = input.type ?? "relates_to";
  const withSession = input.deps?.withSession ?? withNeo4jSession;

  await withSession(input.cfg, async (session) => {
    await session.run(
      `
MATCH (a:Memory ${scope === "project" ? `{ scope: $scope, projectId: $projectId, key: $fromKey }` : `{ scope: $scope, key: $fromKey }`})
MATCH (b:Memory ${scope === "project" ? `{ scope: $scope, projectId: $projectId, key: $toKey }` : `{ scope: $scope, key: $toKey }`})
MERGE (a)-[r:RELATES_TO { type: $type }]->(b)
SET r.updatedAt = timestamp()
RETURN r
      `.trim(),
      {
        scope,
        ...(scope === "project" ? { projectId } : {}),
        fromKey: input.fromKey,
        toKey: input.toKey,
        type,
      },
    );
  });

  return { ok: true };
}

export async function getMemoryByKey(input: {
  cfg: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  key: string;
  deps?: { withSession?: typeof withNeo4jSession };
}): Promise<MemoryNode | undefined> {
  const scope = input.scope;
  const projectId = requireProjectId(scope, input.projectId);
  const withSession = input.deps?.withSession ?? withNeo4jSession;

  return await withSession(input.cfg, async (session) => {
    const matchPattern =
      scope === "project" ? `{ scope: $scope, projectId: $projectId, key: $key }` : `{ scope: $scope, key: $key }`;
    const res = await session.run(
      `
MATCH (n:Memory ${matchPattern})
RETURN n
LIMIT 1
      `.trim(),
      {
        scope,
        ...(scope === "project" ? { projectId } : {}),
        key: input.key,
      },
    );
    const rec = res.records?.[0] as Record<MemoryRecordShape> | undefined;
    if (!rec) return undefined;
    return toNode(rec);
  });
}

export async function searchMemory(input: {
  cfg: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  query: string;
  limit?: number;
  deps?: { withSession?: typeof withNeo4jSession };
}): Promise<MemoryNode[]> {
  const scope = input.scope;
  const projectId = requireProjectId(scope, input.projectId);
  const limit = Math.floor(Math.max(1, Math.min(50, input.limit ?? 10)));
  const withSession = input.deps?.withSession ?? withNeo4jSession;

  return await withSession(input.cfg, async (session) => {
    const matchPattern = scope === "project" ? `{ scope: $scope, projectId: $projectId }` : `{ scope: $scope }`;
    const res = await session.run(
      `
MATCH (n:Memory ${matchPattern})
WHERE toLower(n.key) CONTAINS toLower($q)
   OR toLower(n.value) CONTAINS toLower($q)
   OR any(t IN coalesce(n.tags, []) WHERE toLower(t) CONTAINS toLower($q))
RETURN n
ORDER BY n.updatedAt DESC
LIMIT toInteger($limit)
      `.trim(),
      {
        scope,
        ...(scope === "project" ? { projectId } : {}),
        q: input.query,
        limit,
      },
    );
    return res.records.map((r) => toNode(r as Record<MemoryRecordShape>));
  });
}

export async function recentMemory(input: {
  cfg: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  limit?: number;
  deps?: { withSession?: typeof withNeo4jSession };
}): Promise<MemoryNode[]> {
  const scope = input.scope;
  const projectId = requireProjectId(scope, input.projectId);
  const limit = Math.floor(Math.max(1, Math.min(50, input.limit ?? 10)));
  const withSession = input.deps?.withSession ?? withNeo4jSession;

  return await withSession(input.cfg, async (session) => {
    const matchPattern = scope === "project" ? `{ scope: $scope, projectId: $projectId }` : `{ scope: $scope }`;
    const res = await session.run(
      `
MATCH (n:Memory ${matchPattern})
RETURN n
ORDER BY n.updatedAt DESC
LIMIT toInteger($limit)
      `.trim(),
      {
        scope,
        ...(scope === "project" ? { projectId } : {}),
        limit,
      },
    );
    return res.records.map((r) => toNode(r as Record<MemoryRecordShape>));
  });
}

export type { MemoryNode, MemoryScope };
export { trimGlobalMessageProjects, trimMemoryByKeyPrefix } from "./graph/trim";

```

---

## File: memory/graph/shared.ts

```typescript
import type { Node, Record } from "neo4j-driver";

export type MemoryScope = "global" | "project";

/**
 * Properties stored on a Memory node in Neo4j.
 */
export type MemoryNodeProperties = {
  scope: string;
  projectId?: string;
  key: string;
  value: string;
  tags?: string[];
  createdAt?: number;
  updatedAt?: number;
};

/**
 * The shape of a Neo4j record containing a Memory node under key "n".
 */
export type MemoryRecordShape = {
  n: Node<number, MemoryNodeProperties>;
};

export type MemoryNode = {
  scope: MemoryScope;
  projectId?: string;
  key: string;
  value: string;
  tags: string[];
  createdAt?: number;
  updatedAt?: number;
};

export function requireProjectId(scope: MemoryScope, projectId: string | undefined): string | undefined {
  if (scope !== "project") return undefined;
  if (!projectId) throw new Error("projectId is required for project scope");
  return projectId;
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((t) => typeof t === "string")
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Convert a Neo4j Record containing a Memory node to a MemoryNode object.
 */
export function toNode(record: Record<MemoryRecordShape>): MemoryNode {
  const n = record.get("n");
  const p = n?.properties ?? {};
  return {
    scope: (p.scope as MemoryScope) ?? "project",
    projectId: typeof p.projectId === "string" ? p.projectId : undefined,
    key: String(p.key ?? ""),
    value: String(p.value ?? ""),
    tags: normalizeTags(p.tags),
    createdAt: typeof p.createdAt === "number" ? p.createdAt : undefined,
    updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : undefined,
  };
}

```

---

## File: memory/graph/trim.ts

```typescript
import type { Record } from "neo4j-driver";
import type { Neo4jConfig } from "../neo4j";
import { withNeo4jSession } from "../neo4j";
import type { MemoryScope } from "./shared";
import { requireProjectId } from "./shared";

/**
 * Record shape for queries returning a deleted count.
 */
type DeletedCountRecord = { deleted: number };

/**
 * Record shape for queries returning project drop statistics.
 */
type TrimProjectsRecord = { projectsDropped: number; messagesDeleted: number };

export async function trimMemoryByKeyPrefix(input: {
  cfg: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  keyPrefix: string;
  keepLatest: number;
  deps?: { withSession?: typeof withNeo4jSession };
}): Promise<{ deleted: number }> {
  const scope = input.scope;
  const projectId = requireProjectId(scope, input.projectId);
  const keepLatest = Math.max(0, Math.floor(input.keepLatest));
  const withSession = input.deps?.withSession ?? withNeo4jSession;

  if (keepLatest === 0) {
    const deleted = await withSession(input.cfg, async (session) => {
      const matchPattern = scope === "project" ? `{ scope: $scope, projectId: $projectId }` : `{ scope: $scope }`;
      const res = await session.run(
        `
MATCH (n:Memory ${matchPattern})
WHERE n.key STARTS WITH $prefix
WITH collect(n) AS nodes
FOREACH (x IN nodes | DETACH DELETE x)
RETURN size(nodes) AS deleted
        `.trim(),
        {
          scope,
          ...(scope === "project" ? { projectId } : {}),
          prefix: input.keyPrefix,
        },
      );
      const rec = res.records?.[0] as Record<DeletedCountRecord> | undefined;
      return rec ? rec.get("deleted") : 0;
    });
    return { deleted };
  }

  const deleted = await withSession(input.cfg, async (session) => {
    const matchPattern = scope === "project" ? `{ scope: $scope, projectId: $projectId }` : `{ scope: $scope }`;
    const res = await session.run(
      `
MATCH (n:Memory ${matchPattern})
WHERE n.key STARTS WITH $prefix
WITH n ORDER BY n.updatedAt DESC
WITH collect(n) AS nodes
WITH nodes[toInteger($keepLatest)..] AS toDelete
FOREACH (x IN toDelete | DETACH DELETE x)
RETURN size(toDelete) AS deleted
      `.trim(),
      {
        scope,
        ...(scope === "project" ? { projectId } : {}),
        prefix: input.keyPrefix,
        keepLatest,
      },
    );
    const rec = res.records?.[0] as Record<DeletedCountRecord> | undefined;
    return rec ? rec.get("deleted") : 0;
  });

  return { deleted };
}

export async function trimGlobalMessageProjects(input: {
  cfg: Neo4jConfig;
  keepProjects: number;
  deps?: { withSession?: typeof withNeo4jSession };
}): Promise<{ projectsDropped: number; messagesDeleted: number }> {
  const keepProjects = Math.max(0, Math.floor(input.keepProjects));
  if (keepProjects <= 0) {
    const { deleted } = await trimMemoryByKeyPrefix({
      cfg: input.cfg,
      scope: "global",
      keyPrefix: "message:",
      keepLatest: 0,
      deps: input.deps,
    });
    return { projectsDropped: 0, messagesDeleted: deleted };
  }

  const withSession = input.deps?.withSession ?? withNeo4jSession;

  return await withSession(input.cfg, async (session) => {
    const res = await session.run(
      `
MATCH (n:Memory { scope: $scope })
WHERE n.key STARTS WITH $prefix
WITH split(n.key, ':')[1] AS projectId, max(n.updatedAt) AS lastUpdated
ORDER BY lastUpdated DESC
WITH collect(projectId) AS projects
WITH projects[toInteger($keepProjects)..] AS toDrop
MATCH (m:Memory { scope: $scope })
WHERE m.key STARTS WITH $prefix AND split(m.key, ':')[1] IN toDrop
WITH toDrop, collect(m) AS toDelete
FOREACH (x IN toDelete | DETACH DELETE x)
RETURN size(toDrop) AS projectsDropped, size(toDelete) AS messagesDeleted
      `.trim(),
      { keepProjects, scope: "global", prefix: "message:" },
    );
    const rec = res.records?.[0] as Record<TrimProjectsRecord> | undefined;
    return {
      projectsDropped: rec ? rec.get("projectsDropped") : 0,
      messagesDeleted: rec ? rec.get("messagesDeleted") : 0,
    };
  });
}

```

---

## File: memory/index.ts

```typescript
import type { TextPartInput } from "@opencode-ai/sdk";
import type { ApiService } from "../api";
import type { Factory, MemoryConfig, ServiceLifecycle } from "../types";
import { recordMessageMemory } from "./auto";
import { buildMemoryInjection } from "./inject";
import { loadNeo4jConfig, type Neo4jConfig } from "./neo4j";
import type { MemoryScope } from "./store";

type SessionPromptArgs = {
  path: { id: string };
  body: {
    noReply?: boolean;
    parts: TextPartInput[];
  };
  query?: { directory?: string };
};

type SessionClient = {
  session: {
    prompt: (args: SessionPromptArgs) => Promise<unknown>;
  };
};

export type MemoryDeps = {
  api?: ApiService;
  memory?: {
    recordMessageMemory?: typeof recordMessageMemory;
    buildMemoryInjection?: typeof buildMemoryInjection;
    loadNeo4jConfig?: typeof loadNeo4jConfig;
  };
};

export type MemoryService = ServiceLifecycle & {
  enabled: boolean;
  getScope: () => MemoryScope;
  getProjectId: () => string | undefined;
  inject: (input: { client: SessionClient; sessionId: string; directory?: string }) => Promise<boolean>;
  record: (input: {
    text: string;
    sessionId?: string;
    messageId?: string;
    role?: string;
    userId?: string;
  }) => Promise<void>;
};

export const createMemoryStore: Factory<MemoryConfig | undefined, MemoryDeps, MemoryService> = ({ config, deps }) => {
  const cfg: MemoryConfig = config ?? {};
  const enabled = cfg.enabled !== false;
  const autoRecord = cfg.autoRecord !== false;
  const autoInject = cfg.autoInject !== false;
  const requestedScope: MemoryScope = cfg.scope ?? "project";
  const memoryDeps = deps.memory ?? {};
  const recordMessage = memoryDeps.recordMessageMemory ?? recordMessageMemory;
  const buildInjection = memoryDeps.buildMemoryInjection ?? buildMemoryInjection;
  const loadConfig = memoryDeps.loadNeo4jConfig ?? loadNeo4jConfig;
  const neo4j: Neo4jConfig | undefined = loadConfig();

  let projectId: string | undefined;
  let projectResolved = false;

  const resolveProjectId = async () => {
    if (projectResolved) return projectId;
    projectResolved = true;
    if (!deps.api || requestedScope !== "project") return projectId;
    try {
      const res = await deps.api.project.current({});
      // SDK response type has complex conditional generics - use type assertion for data extraction
      const data = (res as { data?: { id?: string } })?.data ?? (res as { id?: string });
      if (data?.id) projectId = data.id;
    } catch {}
    return projectId;
  };

  const resolveScope = async (): Promise<MemoryScope> => {
    if (requestedScope !== "project") return requestedScope;
    const pid = await resolveProjectId();
    return pid ? "project" : "global";
  };

  const resolveProjectForScope = async (): Promise<{ scope: MemoryScope; projectId?: string }> => {
    const scope = await resolveScope();
    if (scope !== "project") return { scope };
    return { scope, projectId: await resolveProjectId() };
  };

  return {
    enabled,
    getScope: () => requestedScope,
    getProjectId: () => projectId,
    inject: async ({ client, sessionId, directory }) => {
      if (!enabled || !autoInject) return false;
      const { scope, projectId: pid } = await resolveProjectForScope();
      const injection = await buildInjection({
        enabled: true,
        cfg: neo4j,
        scope,
        projectId: pid,
        sessionId,
        inject: cfg.inject,
      });
      if (!injection) return false;
      try {
        await client.session.prompt({
          path: { id: sessionId },
          body: {
            noReply: true,
            parts: [{ type: "text", text: injection }],
          },
          ...(directory ? { query: { directory } } : {}),
        });
        return true;
      } catch {
        return false;
      }
    },
    record: async (input) => {
      if (!enabled || !autoRecord) return;
      const { scope, projectId: pid } = await resolveProjectForScope();
      try {
        await recordMessage({
          cfg: neo4j,
          text: input.text,
          sessionId: input.sessionId,
          messageId: input.messageId,
          role: input.role,
          userId: input.userId,
          scope,
          projectId: pid,
          maxChars: cfg.maxChars,
          summaries: cfg.summaries,
          trim: cfg.trim,
        });
      } catch {}
    },
    start: async () => {
      if (!enabled) return;
      // Don't block startup - resolve project ID in background
      void resolveProjectId();
    },
    stop: async () => {},
    health: async () => ({
      ok: true,
      info: {
        enabled,
        scope: requestedScope,
        projectId,
      },
    }),
  };
};

```

---

## File: memory/inject.ts

```typescript
import { loadNeo4jConfig, type Neo4jConfig } from "./neo4j";
import { getMemoryByKey, type MemoryNode, type MemoryScope, recentMemory } from "./store";
import { shortenWithMarker } from "./text";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function shorten(text: string, maxChars: number): string {
  return shortenWithMarker(text, maxChars, { headRatio: 0.4 });
}

function isMessageLike(node: MemoryNode): boolean {
  if (node.key.startsWith("message:")) return true;
  if (node.tags.includes("message")) return true;
  return false;
}

function isAutoScaffold(node: MemoryNode): boolean {
  if (node.key.startsWith("summary:")) return true;
  if (node.key.startsWith("project:")) return true;
  if (node.key.startsWith("user:")) return true;
  return false;
}

function renderEntry(node: MemoryNode): string {
  const value = node.value.replace(/\s+/g, " ").trim();
  return `- \`${node.key}\` ${value}`;
}

export async function buildMemoryInjection(input: {
  enabled: boolean;
  cfg?: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  sessionId?: string;
  inject?: {
    maxChars?: number;
    maxEntries?: number;
    includeMessages?: boolean;
    includeSessionSummary?: boolean;
    includeProjectSummary?: boolean;
    includeGlobal?: boolean;
    maxGlobalEntries?: number;
  };
  deps?: {
    loadNeo4jConfig?: typeof loadNeo4jConfig;
    getMemoryByKey?: typeof getMemoryByKey;
    recentMemory?: typeof recentMemory;
  };
}): Promise<string | undefined> {
  if (!input.enabled) return undefined;
  const loadConfig = input.deps?.loadNeo4jConfig ?? loadNeo4jConfig;
  const getByKey = input.deps?.getMemoryByKey ?? getMemoryByKey;
  const recent = input.deps?.recentMemory ?? recentMemory;
  const cfg = input.cfg ?? loadConfig();

  const maxChars = clamp(input.inject?.maxChars ?? 2000, 200, 20000);
  const maxEntries = clamp(input.inject?.maxEntries ?? 8, 0, 50);
  const includeMessages = input.inject?.includeMessages === true;
  const includeSessionSummary = input.inject?.includeSessionSummary !== false;
  const includeProjectSummary = input.inject?.includeProjectSummary !== false;
  const includeGlobal = input.inject?.includeGlobal !== false;
  const maxGlobalEntries = clamp(input.inject?.maxGlobalEntries ?? 3, 0, 20);

  const scope = input.scope;
  const projectId = input.projectId;
  const sessionId = input.sessionId;

  const lines: string[] = ["## Memory (auto)", ""];

  const projectSummaryKey =
    scope === "project" ? "summary:project" : projectId ? `summary:project:${projectId}` : undefined;
  const sessionSummaryKey = sessionId ? `summary:session:${sessionId}` : undefined;

  if (includeProjectSummary && projectSummaryKey) {
    let node: MemoryNode | undefined;
    try {
      node = await getByKey({
        cfg,
        scope,
        projectId: scope === "project" ? projectId : undefined,
        key: projectSummaryKey,
      });
    } catch {
      node = undefined;
    }
    if (node?.value?.trim()) {
      lines.push("### Project");
      lines.push(shorten(node.value.trim(), clamp(Math.floor(maxChars * 0.5), 200, 6000)));
      lines.push("");
    }
  }

  if (includeSessionSummary && scope === "project" && projectId && sessionSummaryKey) {
    let node: MemoryNode | undefined;
    try {
      node = await getByKey({ cfg, scope: "project", projectId, key: sessionSummaryKey });
    } catch {
      node = undefined;
    }
    if (node?.value?.trim()) {
      lines.push("### Session");
      lines.push(shorten(node.value.trim(), clamp(Math.floor(maxChars * 0.35), 200, 4000)));
      lines.push("");
    }
  }

  const gather = async (
    scopeToRead: MemoryScope,
    projectIdToRead: string | undefined,
    limit: number,
  ): Promise<MemoryNode[]> => {
    let nodes: MemoryNode[] = [];
    try {
      nodes = await recent({ cfg, scope: scopeToRead, projectId: projectIdToRead, limit });
    } catch {
      nodes = [];
    }
    const filtered = nodes.filter((n) => {
      if (!includeMessages && isMessageLike(n)) return false;
      if (isAutoScaffold(n)) return false;
      return true;
    });
    return filtered;
  };

  const mainNodes = await gather(scope, scope === "project" ? projectId : undefined, 50);
  const extras: string[] = [];
  for (const node of mainNodes.slice(0, maxEntries)) {
    extras.push(renderEntry(node));
  }

  if (includeGlobal && scope === "project" && maxGlobalEntries > 0) {
    const globalNodes = await gather("global", undefined, 50);
    for (const node of globalNodes.slice(0, maxGlobalEntries)) {
      extras.push(renderEntry(node));
    }
  }

  if (extras.length > 0) {
    lines.push("### Notes");
    lines.push(...extras);
    lines.push("");
  }

  if (lines.length <= 2) return undefined;
  return shorten(lines.join("\n").trim(), maxChars);
}

```

---

## File: memory/neo4j-config.ts

```typescript
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Neo4jIntegrationConfig } from "../types";
import type { OrchestratorConfigFile } from "../types/config";

export const NEO4J_CONTAINER_NAME = "opencode-neo4j";
export const NEO4J_DEFAULT_IMAGE = "neo4j:community";
export const NEO4J_STARTUP_TIMEOUT_MS = 30_000;
export const NEO4J_HEALTH_CHECK_INTERVAL_MS = 1_000;

export type Neo4jConfig = {
  uri: string;
  username: string;
  password: string;
  database?: string;
};

let integrationsNeo4jConfig: Neo4jIntegrationConfig | undefined;

/** Cache the orchestrator-provided Neo4j integration config. */
export function setNeo4jIntegrationsConfig(cfg: Neo4jIntegrationConfig | undefined): void {
  integrationsNeo4jConfig = cfg;
}

/** Return the cached Neo4j integration config, if any. */
export function getNeo4jIntegrationsConfig(): Neo4jIntegrationConfig | undefined {
  return integrationsNeo4jConfig;
}

const loadNeo4jConfigFromFile = (): Neo4jConfig | undefined => {
  const projectDir = process.env.OPENCODE_ORCH_PROJECT_DIR || process.cwd();

  const pathsToTry: string[] = [];

  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  if (homeDir) {
    pathsToTry.push(join(homeDir, ".opencode", "orchestrator.json"));
  }

  pathsToTry.push(join(projectDir, ".opencode", "orchestrator.json"));

  for (const configPath of pathsToTry) {
    try {
      if (!existsSync(configPath)) continue;

      const content = readFileSync(configPath, "utf8");
      const config = JSON.parse(content) as OrchestratorConfigFile;
      const neo4j = config?.integrations?.neo4j;

      if (neo4j?.enabled !== false && neo4j?.uri && neo4j?.username && neo4j?.password) {
        return {
          uri: neo4j.uri,
          username: neo4j.username,
          password: neo4j.password,
          database: neo4j.database,
        };
      }
    } catch {
      // Ignore errors, try next path
    }
  }

  return undefined;
};

/** Load Neo4j config from environment variables. */
export const loadNeo4jConfigFromEnv = (): Neo4jConfig | undefined => {
  const uri = process.env.OPENCODE_NEO4J_URI;
  const username = process.env.OPENCODE_NEO4J_USERNAME;
  const password = process.env.OPENCODE_NEO4J_PASSWORD;
  const database = process.env.OPENCODE_NEO4J_DATABASE;

  if (!uri || !username || !password) return undefined;
  return { uri, username, password, database };
};

/** Load Neo4j config from orchestrator integration settings. */
export const loadNeo4jConfigFromIntegrations = (): Neo4jConfig | undefined => {
  const cfg = integrationsNeo4jConfig;
  if (cfg) {
    if (cfg.enabled === false) return undefined;
    const uri = cfg.uri;
    const username = cfg.username;
    const password = cfg.password;
    const database = cfg.database;
    if (!uri || !username || !password) return undefined;
    return { uri, username, password, database };
  }

  return loadNeo4jConfigFromFile();
};

/** Load Neo4j config using env-first precedence. */
export const loadNeo4jConfig = (): Neo4jConfig | undefined => {
  const fromEnv = loadNeo4jConfigFromEnv();
  if (fromEnv) return fromEnv;

  return loadNeo4jConfigFromIntegrations();
};

```

---

## File: memory/neo4j-docker.ts

```typescript
/* c8 ignore file */
import { execSync, spawn, spawnSync } from "node:child_process";
import neo4j from "neo4j-driver";
import type { Neo4jIntegrationConfig } from "../types";
import {
  getNeo4jIntegrationsConfig,
  loadNeo4jConfig,
  NEO4J_CONTAINER_NAME,
  NEO4J_DEFAULT_IMAGE,
  NEO4J_HEALTH_CHECK_INTERVAL_MS,
  NEO4J_STARTUP_TIMEOUT_MS,
  type Neo4jConfig,
} from "./neo4j-config";
import { isNeo4jAccessible } from "./neo4j-driver";

export type Neo4jDockerDeps = {
  execSync?: typeof execSync;
  spawn?: typeof spawn;
  spawnSync?: typeof spawnSync;
  neo4j?: typeof neo4j;
  isNeo4jAccessible?: typeof isNeo4jAccessible;
};

/**
 * Validate Docker image name to prevent command injection.
 * Allows: alphanumeric, slashes, colons, hyphens, underscores, periods, @
 * Examples: "neo4j:5.15", "library/neo4j:latest", "ghcr.io/org/neo4j@sha256:abc123"
 */
function isValidDockerImage(image: string): boolean {
  if (!image || typeof image !== "string") return false;
  // Max 256 chars, must match Docker image naming convention
  if (image.length > 256) return false;
  // Allow: alphanumeric, /, :, -, _, ., @
  // Must start with alphanumeric or allowed registry prefix
  const validPattern = /^[a-zA-Z0-9][a-zA-Z0-9._\-/:@]*$/;
  return validPattern.test(image);
}

/**
 * Sanitize container name for shell commands.
 * Only allows alphanumeric, hyphens, and underscores.
 */
function sanitizeContainerName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "");
}

const isDockerAvailable = (deps?: Neo4jDockerDeps): boolean => {
  try {
    const exec = deps?.execSync ?? execSync;
    exec("docker --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const containerExists = (deps?: Neo4jDockerDeps): boolean => {
  try {
    const safeName = sanitizeContainerName(NEO4J_CONTAINER_NAME);
    // Use spawnSync with array args to avoid shell injection
    const spawnSyncFn = deps?.spawnSync ?? spawnSync;
    const result = spawnSyncFn("docker", ["ps", "-a", "--filter", `name=^${safeName}$`, "--format", "{{.Names}}"], {
      encoding: "utf8",
    });
    if (result.error) return false;
    return result.stdout.trim() === safeName;
  } catch {
    return false;
  }
};

const isContainerRunning = (deps?: Neo4jDockerDeps): boolean => {
  try {
    const safeName = sanitizeContainerName(NEO4J_CONTAINER_NAME);
    // Use spawnSync with array args to avoid shell injection
    const spawnSyncFn = deps?.spawnSync ?? spawnSync;
    const result = spawnSyncFn("docker", ["ps", "--filter", `name=^${safeName}$`, "--format", "{{.Names}}"], {
      encoding: "utf8",
    });
    if (result.error) return false;
    return result.stdout.trim() === safeName;
  } catch {
    return false;
  }
};

const startContainer = (deps?: Neo4jDockerDeps): void => {
  const safeName = sanitizeContainerName(NEO4J_CONTAINER_NAME);
  // Use spawnSync with array args to avoid shell injection
  const spawnSyncFn = deps?.spawnSync ?? spawnSync;
  const result = spawnSyncFn("docker", ["start", safeName], { stdio: "ignore" });
  if (result.error) throw result.error;
};

const createContainer = (cfg: Neo4jIntegrationConfig, deps?: Neo4jDockerDeps): void => {
  const username = cfg.username ?? "neo4j";
  const password = cfg.password ?? "opencode123";
  const image = cfg.image ?? NEO4J_DEFAULT_IMAGE;

  // Validate image name to prevent command injection
  if (!isValidDockerImage(image)) {
    throw new Error(`Invalid Docker image name: ${image}. Image must match Docker naming conventions.`);
  }

  const uri = cfg.uri ?? "bolt://localhost:7687";
  const portMatch = uri.match(/:([^/]+)(?:\/|$)/);
  const boltPort = portMatch ? portMatch[1] : "7687";

  // Validate port is numeric
  if (!/^\d+$/.test(boltPort)) {
    throw new Error(`Invalid port in URI: ${uri}`);
  }

  const safeName = sanitizeContainerName(NEO4J_CONTAINER_NAME);

  const args = [
    "run",
    "-d",
    "--name",
    safeName,
    "-p",
    `${boltPort}:7687`,
    "-p",
    "7474:7474",
    "-e",
    `NEO4J_AUTH=${username}/${password}`,
    "-e",
    "NEO4J_PLUGINS=[]",
    "--restart",
    "unless-stopped",
    image,
  ];

  // spawn with array args is safe from shell injection
  const spawnFn = deps?.spawn ?? spawn;
  spawnFn("docker", args, { stdio: "ignore", detached: true }).unref();
};

const waitForNeo4j = async (
  cfg: Neo4jConfig,
  timeoutMs: number = NEO4J_STARTUP_TIMEOUT_MS,
  deps?: Neo4jDockerDeps,
): Promise<boolean> => {
  const start = Date.now();
  const neo4jDriver = deps?.neo4j ?? neo4j;

  while (Date.now() - start < timeoutMs) {
    try {
      const testDriver = neo4jDriver.driver(cfg.uri, neo4jDriver.auth.basic(cfg.username, cfg.password));
      const session = testDriver.session();
      try {
        await session.run("RETURN 1");
        await session.close();
        await testDriver.close();
        return true;
      } catch {
        await session.close();
        await testDriver.close();
      }
    } catch {
      // Connection failed, keep waiting
    }

    await new Promise((resolve) => setTimeout(resolve, NEO4J_HEALTH_CHECK_INTERVAL_MS));
  }

  return false;
};

export type EnsureNeo4jResult = {
  status: "already_running" | "started" | "created" | "failed" | "disabled" | "no_docker" | "no_config";
  message: string;
};

/** Ensure Neo4j is running, optionally starting a Docker container. */
export const ensureNeo4jRunning = async (
  integrationsCfg?: Neo4jIntegrationConfig,
  deps?: Neo4jDockerDeps,
): Promise<EnsureNeo4jResult> => {
  const accessibleFn = deps?.isNeo4jAccessible ?? isNeo4jAccessible;
  const cfg = integrationsCfg ?? getNeo4jIntegrationsConfig();

  if (cfg?.enabled === false) {
    return { status: "disabled", message: "Neo4j integration is disabled" };
  }

  if (cfg?.autoStart === false) {
    return { status: "disabled", message: "Neo4j autoStart is disabled" };
  }

  const neo4jCfg = loadNeo4jConfig();
  if (!neo4jCfg) {
    return { status: "no_config", message: "No Neo4j configuration found" };
  }

  if (await accessibleFn(neo4jCfg)) {
    return { status: "already_running", message: "Neo4j is already running" };
  }

  if (!isDockerAvailable(deps)) {
    return { status: "no_docker", message: "Docker is not available - cannot auto-start Neo4j" };
  }

  try {
    if (containerExists(deps)) {
      if (!isContainerRunning(deps)) {
        startContainer(deps);
      }
      const ready = await waitForNeo4j(neo4jCfg, NEO4J_STARTUP_TIMEOUT_MS, deps);
      if (ready) {
        return { status: "started", message: `Started existing Neo4j container '${NEO4J_CONTAINER_NAME}'` };
      }
      return { status: "failed", message: "Neo4j container started but failed to become responsive" };
    }

    createContainer(cfg ?? {}, deps);

    const ready = await waitForNeo4j(neo4jCfg, NEO4J_STARTUP_TIMEOUT_MS, deps);
    if (ready) {
      return { status: "created", message: `Created and started Neo4j container '${NEO4J_CONTAINER_NAME}'` };
    }

    return { status: "failed", message: "Neo4j container created but failed to become responsive" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "failed", message: `Failed to start Neo4j: ${msg}` };
  }
};

```

---

## File: memory/neo4j-driver.ts

```typescript
/* c8 ignore file */
import neo4j, { type Driver, type Session } from "neo4j-driver";
import { loadNeo4jConfig, type Neo4jConfig } from "./neo4j-config";

let driver: Driver | undefined;
let driverKey: string | undefined;

const keyOf = (cfg: Neo4jConfig): string => `${cfg.uri}|${cfg.username}|${cfg.database ?? ""}`;

/** Return a cached Neo4j driver for the given config. */
export const getNeo4jDriver = (cfg: Neo4jConfig): Driver => {
  const nextKey = keyOf(cfg);
  if (driver && driverKey === nextKey) return driver;

  if (driver) {
    try {
      void driver.close();
    } catch {
      // ignore
    }
  }

  driver = neo4j.driver(cfg.uri, neo4j.auth.basic(cfg.username, cfg.password), {
    disableLosslessIntegers: true,
  });
  driverKey = nextKey;
  return driver;
};

/** Open a Neo4j session, run a callback, and close the session. */
export const withNeo4jSession = async <T>(cfg: Neo4jConfig, fn: (session: Session) => Promise<T>): Promise<T> => {
  const d = getNeo4jDriver(cfg);
  const session = d.session(cfg.database ? { database: cfg.database } : undefined);
  try {
    return await fn(session);
  } finally {
    await session.close();
  }
};

/** Check whether Neo4j is reachable with the provided config. */
export const isNeo4jAccessible = async (cfg?: Neo4jConfig): Promise<boolean> => {
  const config = cfg ?? loadNeo4jConfig();
  if (!config) return false;

  try {
    const testDriver = neo4j.driver(config.uri, neo4j.auth.basic(config.username, config.password));
    const session = testDriver.session();
    try {
      await session.run("RETURN 1");
      return true;
    } finally {
      await session.close();
      await testDriver.close();
    }
  } catch {
    return false;
  }
};

```

---

## File: memory/neo4j.ts

```typescript
export type { Neo4jConfig } from "./neo4j-config";
export {
  getNeo4jIntegrationsConfig,
  loadNeo4jConfig,
  loadNeo4jConfigFromEnv,
  loadNeo4jConfigFromIntegrations,
  setNeo4jIntegrationsConfig,
} from "./neo4j-config";
export type { EnsureNeo4jResult } from "./neo4j-docker";
export { ensureNeo4jRunning } from "./neo4j-docker";
export { getNeo4jDriver, isNeo4jAccessible, withNeo4jSession } from "./neo4j-driver";

```

---

## File: memory/store-file.ts

```typescript
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getUserConfigDir } from "../helpers/format";
import { writeJsonAtomic } from "../helpers/fs";
import type { MemoryNode, MemoryScope } from "./graph";

type MemoryLink = {
  fromKey: string;
  toKey: string;
  type: string;
  createdAt: number;
  updatedAt: number;
};

type MemoryFile = {
  version: 1;
  updatedAt: number;
  nodes: MemoryNode[];
  links: MemoryLink[];
};

function requireProjectId(scope: MemoryScope, projectId: string | undefined): string | undefined {
  if (scope !== "project") return undefined;
  if (!projectId) throw new Error("projectId is required for project scope");
  return projectId;
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((t) => typeof t === "string")
    .map((t) => t.trim())
    .filter(Boolean);
}

function safeProjectId(projectId: string): string {
  return encodeURIComponent(projectId);
}

function getMemoryFilePath(scope: MemoryScope, projectId: string | undefined): string {
  const base = join(getUserConfigDir(), "opencode", "orchestrator-memory");
  if (scope === "global") {
    return join(base, "global.json");
  }
  const safe = safeProjectId(requireProjectId(scope, projectId) ?? "unknown");
  return join(base, "projects", `${safe}.json`);
}

async function readMemoryFile(path: string): Promise<MemoryFile> {
  if (!existsSync(path)) {
    return { version: 1, updatedAt: Date.now(), nodes: [], links: [] };
  }
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as Partial<MemoryFile>;
    const nodes = Array.isArray(raw.nodes) ? (raw.nodes as MemoryNode[]) : [];
    const links = Array.isArray(raw.links) ? (raw.links as MemoryLink[]) : [];
    return {
      version: 1,
      updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
      nodes,
      links,
    };
  } catch {
    return { version: 1, updatedAt: Date.now(), nodes: [], links: [] };
  }
}

async function writeMemoryFile(path: string, file: MemoryFile): Promise<void> {
  await writeJsonAtomic(path, file, { tmpPrefix: "opencode-orch-memory" });
}

export async function upsertMemory(input: {
  scope: MemoryScope;
  projectId?: string;
  key: string;
  value: string;
  tags?: string[];
}): Promise<MemoryNode> {
  const scope = input.scope;
  const projectId = requireProjectId(scope, input.projectId);
  const path = getMemoryFilePath(scope, projectId);
  const file = await readMemoryFile(path);
  const now = Date.now();

  const idx = file.nodes.findIndex((n) => n.key === input.key);
  const next: MemoryNode = {
    scope,
    ...(scope === "project" ? { projectId } : {}),
    key: input.key,
    value: input.value,
    tags: normalizeTags(input.tags),
    createdAt: idx >= 0 ? file.nodes[idx].createdAt : now,
    updatedAt: now,
  };

  if (idx >= 0) file.nodes[idx] = next;
  else file.nodes.push(next);

  file.updatedAt = now;
  await writeMemoryFile(path, file);
  return next;
}

export async function linkMemory(input: {
  scope: MemoryScope;
  projectId?: string;
  fromKey: string;
  toKey: string;
  type?: string;
}): Promise<{ ok: true }> {
  const scope = input.scope;
  const projectId = requireProjectId(scope, input.projectId);
  const path = getMemoryFilePath(scope, projectId);
  const file = await readMemoryFile(path);
  const now = Date.now();
  const type = input.type ?? "relates_to";

  const idx = file.links.findIndex((l) => l.fromKey === input.fromKey && l.toKey === input.toKey && l.type === type);
  if (idx >= 0) {
    file.links[idx].updatedAt = now;
  } else {
    file.links.push({
      fromKey: input.fromKey,
      toKey: input.toKey,
      type,
      createdAt: now,
      updatedAt: now,
    });
  }

  file.updatedAt = now;
  await writeMemoryFile(path, file);
  return { ok: true };
}

export async function getMemoryByKey(input: {
  scope: MemoryScope;
  projectId?: string;
  key: string;
}): Promise<MemoryNode | undefined> {
  const scope = input.scope;
  const projectId = requireProjectId(scope, input.projectId);
  const path = getMemoryFilePath(scope, projectId);
  const file = await readMemoryFile(path);
  return file.nodes.find((n) => n.key === input.key);
}

export async function searchMemory(input: {
  scope: MemoryScope;
  projectId?: string;
  query: string;
  limit?: number;
}): Promise<MemoryNode[]> {
  const scope = input.scope;
  const projectId = requireProjectId(scope, input.projectId);
  const path = getMemoryFilePath(scope, projectId);
  const file = await readMemoryFile(path);
  const limit = Math.floor(Math.max(1, Math.min(50, input.limit ?? 10)));
  const q = input.query.toLowerCase();

  return file.nodes
    .filter((n) => {
      if (n.key.toLowerCase().includes(q)) return true;
      if (n.value.toLowerCase().includes(q)) return true;
      return n.tags.some((t) => t.toLowerCase().includes(q));
    })
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, limit);
}

export async function recentMemory(input: {
  scope: MemoryScope;
  projectId?: string;
  limit?: number;
}): Promise<MemoryNode[]> {
  const scope = input.scope;
  const projectId = requireProjectId(scope, input.projectId);
  const path = getMemoryFilePath(scope, projectId);
  const file = await readMemoryFile(path);
  const limit = Math.floor(Math.max(1, Math.min(50, input.limit ?? 10)));

  return file.nodes
    .slice()
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, limit);
}

export async function trimMemoryByKeyPrefix(input: {
  scope: MemoryScope;
  projectId?: string;
  keyPrefix: string;
  keepLatest: number;
}): Promise<{ deleted: number }> {
  const scope = input.scope;
  const projectId = requireProjectId(scope, input.projectId);
  const path = getMemoryFilePath(scope, projectId);
  const file = await readMemoryFile(path);
  const keepLatest = Math.max(0, Math.floor(input.keepLatest));

  const matches = file.nodes.filter((n) => n.key.startsWith(input.keyPrefix));
  if (matches.length === 0) return { deleted: 0 };

  let keep = new Set<string>();
  if (keepLatest > 0) {
    const sorted = matches.slice().sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    keep = new Set(sorted.slice(0, keepLatest).map((n) => n.key));
  }

  const before = file.nodes.length;
  file.nodes = file.nodes.filter((n) => !n.key.startsWith(input.keyPrefix) || keep.has(n.key));
  const deleted = before - file.nodes.length;
  if (deleted > 0) {
    file.updatedAt = Date.now();
    await writeMemoryFile(path, file);
  }
  return { deleted };
}

export async function trimGlobalMessageProjects(input: {
  keepProjects: number;
}): Promise<{ projectsDropped: number; messagesDeleted: number }> {
  const keepProjects = Math.max(0, Math.floor(input.keepProjects));
  const path = getMemoryFilePath("global", undefined);
  const file = await readMemoryFile(path);

  const messageNodes = file.nodes.filter((n) => n.key.startsWith("message:"));
  if (messageNodes.length === 0) return { projectsDropped: 0, messagesDeleted: 0 };

  if (keepProjects <= 0) {
    const before = file.nodes.length;
    file.nodes = file.nodes.filter((n) => !n.key.startsWith("message:"));
    const deleted = before - file.nodes.length;
    if (deleted > 0) {
      file.updatedAt = Date.now();
      await writeMemoryFile(path, file);
    }
    return { projectsDropped: 0, messagesDeleted: deleted };
  }

  const projectLastUpdated = new Map<string, number>();
  for (const node of messageNodes) {
    const parts = node.key.split(":");
    const projectId = parts.length > 1 ? parts[1] : "unknown";
    const updated = node.updatedAt ?? 0;
    const prev = projectLastUpdated.get(projectId) ?? 0;
    if (updated > prev) projectLastUpdated.set(projectId, updated);
  }

  const ordered = [...projectLastUpdated.entries()].sort((a, b) => b[1] - a[1]);
  const drop = new Set(ordered.slice(keepProjects).map(([id]) => id));

  if (drop.size === 0) return { projectsDropped: 0, messagesDeleted: 0 };

  const before = file.nodes.length;
  file.nodes = file.nodes.filter((n) => {
    if (!n.key.startsWith("message:")) return true;
    const parts = n.key.split(":");
    const projectId = parts.length > 1 ? parts[1] : "unknown";
    return !drop.has(projectId);
  });
  const deleted = before - file.nodes.length;
  if (deleted > 0) {
    file.updatedAt = Date.now();
    await writeMemoryFile(path, file);
  }
  return { projectsDropped: drop.size, messagesDeleted: deleted };
}

```

---

## File: memory/store.ts

```typescript
import type { MemoryNode, MemoryScope } from "./graph";
import * as graph from "./graph";
import type { Neo4jConfig } from "./neo4j";
import { loadNeo4jConfig } from "./neo4j";
import * as fileStore from "./store-file";

export type MemoryBackend = "neo4j" | "file";
export type { MemoryNode, MemoryScope };

type MemoryStoreDeps = {
  loadNeo4jConfig?: typeof loadNeo4jConfig;
  graph?: typeof graph;
  fileStore?: typeof fileStore;
};

function resolveBackend(cfg?: Neo4jConfig, deps?: MemoryStoreDeps): { backend: MemoryBackend; cfg?: Neo4jConfig } {
  const resolved = cfg ?? (deps?.loadNeo4jConfig ?? loadNeo4jConfig)();
  if (resolved) return { backend: "neo4j", cfg: resolved };
  return { backend: "file" };
}

export function getMemoryBackend(cfg?: Neo4jConfig, deps?: MemoryStoreDeps): MemoryBackend {
  return resolveBackend(cfg, deps).backend;
}

export async function upsertMemory(input: {
  cfg?: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  key: string;
  value: string;
  tags?: string[];
  deps?: MemoryStoreDeps;
}): Promise<MemoryNode> {
  const { backend, cfg } = resolveBackend(input.cfg, input.deps);
  const graphApi = input.deps?.graph ?? graph;
  const fileApi = input.deps?.fileStore ?? fileStore;
  if (backend === "neo4j") {
    return await graphApi.upsertMemory({
      cfg: cfg!,
      scope: input.scope,
      projectId: input.projectId,
      key: input.key,
      value: input.value,
      tags: input.tags ?? [],
    });
  }
  return await fileApi.upsertMemory({
    scope: input.scope,
    projectId: input.projectId,
    key: input.key,
    value: input.value,
    tags: input.tags ?? [],
  });
}

export async function linkMemory(input: {
  cfg?: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  fromKey: string;
  toKey: string;
  type?: string;
  deps?: MemoryStoreDeps;
}): Promise<{ ok: true }> {
  const { backend, cfg } = resolveBackend(input.cfg, input.deps);
  const graphApi = input.deps?.graph ?? graph;
  const fileApi = input.deps?.fileStore ?? fileStore;
  if (backend === "neo4j") {
    return await graphApi.linkMemory({
      cfg: cfg!,
      scope: input.scope,
      projectId: input.projectId,
      fromKey: input.fromKey,
      toKey: input.toKey,
      type: input.type,
    });
  }
  return await fileApi.linkMemory({
    scope: input.scope,
    projectId: input.projectId,
    fromKey: input.fromKey,
    toKey: input.toKey,
    type: input.type,
  });
}

export async function getMemoryByKey(input: {
  cfg?: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  key: string;
  deps?: MemoryStoreDeps;
}): Promise<MemoryNode | undefined> {
  const { backend, cfg } = resolveBackend(input.cfg, input.deps);
  const graphApi = input.deps?.graph ?? graph;
  const fileApi = input.deps?.fileStore ?? fileStore;
  if (backend === "neo4j") {
    return await graphApi.getMemoryByKey({
      cfg: cfg!,
      scope: input.scope,
      projectId: input.projectId,
      key: input.key,
    });
  }
  return await fileApi.getMemoryByKey({
    scope: input.scope,
    projectId: input.projectId,
    key: input.key,
  });
}

export async function searchMemory(input: {
  cfg?: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  query: string;
  limit?: number;
  deps?: MemoryStoreDeps;
}): Promise<MemoryNode[]> {
  const { backend, cfg } = resolveBackend(input.cfg, input.deps);
  const graphApi = input.deps?.graph ?? graph;
  const fileApi = input.deps?.fileStore ?? fileStore;
  if (backend === "neo4j") {
    return await graphApi.searchMemory({
      cfg: cfg!,
      scope: input.scope,
      projectId: input.projectId,
      query: input.query,
      limit: input.limit,
    });
  }
  return await fileApi.searchMemory({
    scope: input.scope,
    projectId: input.projectId,
    query: input.query,
    limit: input.limit,
  });
}

export async function recentMemory(input: {
  cfg?: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  limit?: number;
  deps?: MemoryStoreDeps;
}): Promise<MemoryNode[]> {
  const { backend, cfg } = resolveBackend(input.cfg, input.deps);
  const graphApi = input.deps?.graph ?? graph;
  const fileApi = input.deps?.fileStore ?? fileStore;
  if (backend === "neo4j") {
    return await graphApi.recentMemory({
      cfg: cfg!,
      scope: input.scope,
      projectId: input.projectId,
      limit: input.limit,
    });
  }
  return await fileApi.recentMemory({
    scope: input.scope,
    projectId: input.projectId,
    limit: input.limit,
  });
}

export async function trimMemoryByKeyPrefix(input: {
  cfg?: Neo4jConfig;
  scope: MemoryScope;
  projectId?: string;
  keyPrefix: string;
  keepLatest: number;
  deps?: MemoryStoreDeps;
}): Promise<{ deleted: number }> {
  const { backend, cfg } = resolveBackend(input.cfg, input.deps);
  const graphApi = input.deps?.graph ?? graph;
  const fileApi = input.deps?.fileStore ?? fileStore;
  if (backend === "neo4j") {
    return await graphApi.trimMemoryByKeyPrefix({
      cfg: cfg!,
      scope: input.scope,
      projectId: input.projectId,
      keyPrefix: input.keyPrefix,
      keepLatest: input.keepLatest,
    });
  }
  return await fileApi.trimMemoryByKeyPrefix({
    scope: input.scope,
    projectId: input.projectId,
    keyPrefix: input.keyPrefix,
    keepLatest: input.keepLatest,
  });
}

export async function trimGlobalMessageProjects(input: {
  cfg?: Neo4jConfig;
  keepProjects: number;
  deps?: MemoryStoreDeps;
}): Promise<{ projectsDropped: number; messagesDeleted: number }> {
  const { backend, cfg } = resolveBackend(input.cfg, input.deps);
  const graphApi = input.deps?.graph ?? graph;
  const fileApi = input.deps?.fileStore ?? fileStore;
  if (backend === "neo4j") {
    return await graphApi.trimGlobalMessageProjects({
      cfg: cfg!,
      keepProjects: input.keepProjects,
    });
  }
  return await fileApi.trimGlobalMessageProjects({
    keepProjects: input.keepProjects,
  });
}

```

---

## File: memory/text.ts

```typescript
export function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

export function stripCodeBlocks(input: string): string {
  return input.replace(/```[\s\S]*?```/g, "[code omitted]");
}

export function redactSecrets(input: string): string {
  const patterns: RegExp[] = [
    /\bsk-[a-zA-Z0-9]{16,}\b/g, // common API key prefix
    /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key
    /\bAIza[0-9A-Za-z\-_]{20,}\b/g, // Google API key
    /\bghp_[A-Za-z0-9]{20,}\b/g, // GitHub token
    /\b(xox[baprs]-[0-9A-Za-z-]{10,})\b/g, // Slack token
    /\b-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----\b/g,
  ];
  let out = input;
  for (const re of patterns) out = out.replace(re, "[REDACTED]");
  return out;
}

export function normalizeForMemory(input: string, maxChars: number): string {
  const cleaned = redactSecrets(stripCodeBlocks(input)).replace(/\s+/g, " ").trim();
  return truncate(cleaned, maxChars);
}

export function shortenWithMarker(text: string, maxChars: number, options?: { headRatio?: number }): string {
  if (text.length <= maxChars) return text;
  const headRatio = typeof options?.headRatio === "number" ? options.headRatio : 0.4;
  const marker = `\n\n[... trimmed ${text.length - maxChars} chars ...]\n\n`;
  const budget = Math.max(0, maxChars - marker.length);
  const keepHead = Math.floor(budget * headRatio);
  const keepTail = budget - keepHead;
  return `${text.slice(0, keepHead)}${marker}${text.slice(text.length - keepTail)}`;
}

export function appendRollingSummary(prev: string | undefined, entry: string, maxChars: number): string {
  const next = prev && prev.trim().length > 0 ? `${prev.trim()}\n${entry}` : entry;
  return shortenWithMarker(next, maxChars, { headRatio: 0.35 });
}

```

---

## File: models/aliases.ts

```typescript
export type ModelAliasMap = Record<string, string>;

export function normalizeAliases(input?: ModelAliasMap): ModelAliasMap {
  const out: ModelAliasMap = {};
  if (!input) return out;
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== "string") continue;
    out[key.toLowerCase()] = value;
  }
  return out;
}

export function resolveAlias(input: string, aliases?: ModelAliasMap): string | undefined {
  if (!aliases) return undefined;
  const normalized = input.trim().toLowerCase();
  return aliases[normalized];
}

```

---

## File: models/capabilities.ts

```typescript
import type { Model } from "@opencode-ai/sdk";

export interface ModelCapabilities {
  supportsVision: boolean;
  supportsTools: boolean;
  supportsStreaming: boolean;
  contextWindow: number;
  maxOutputTokens: number;
  supportsReasoning: boolean;
  supportsWebSearch: boolean;
  supportsPDFAnalysis: boolean;
  supportsCodeExecution: boolean;
  inputCostPer1kTokens?: number;
  outputCostPer1kTokens?: number;
  averageLatencyMs?: number;
  throughputTokensPerSecond?: number;
}

/**
 * Minimal model shape needed for capability derivation.
 * This allows the function to handle both SDK Model type and raw objects.
 */
type ModelLike = {
  capabilities?: {
    attachment?: boolean;
    toolcall?: boolean;
    tools?: boolean;
    function_calling?: boolean;
    streaming?: boolean;
    stream?: boolean;
    reasoning?: boolean;
    web?: boolean;
    input?: { image?: boolean; pdf?: boolean };
    output?: { pdf?: boolean };
  };
  limit?: { context?: number; output?: number };
  cost?: { input?: number; output?: number };
  latency?: number;
  throughput?: number;
};

function inferFromName(name: string): Partial<ModelCapabilities> {
  const lower = name.toLowerCase();
  return {
    supportsReasoning: /reasoning|thinking|r1|deepthink/.test(lower),
    supportsVision: /vision|multimodal|image/.test(lower),
    supportsWebSearch: /search|browse|web/.test(lower),
    supportsPDFAnalysis: /pdf/.test(lower),
  };
}

export function deriveModelCapabilities(input: {
  model: Model | Record<string, unknown> | undefined;
  modelId: string;
  modelName?: string;
  overrides?: Partial<ModelCapabilities>;
}): ModelCapabilities {
  // Use ModelLike for safe property access - the function handles any shape of model object
  const model = input.model as ModelLike | undefined;
  const capabilities = model?.capabilities ?? {};
  const inputCaps = capabilities?.input ?? {};
  const outputCaps = capabilities?.output ?? {};

  const inferred = inferFromName(`${input.modelName ?? ""} ${input.modelId}`.trim());

  const base: ModelCapabilities = {
    supportsVision: Boolean(capabilities?.attachment || inputCaps?.image) || Boolean(inferred.supportsVision),
    supportsTools: Boolean(capabilities?.toolcall || capabilities?.tools || capabilities?.function_calling),
    supportsStreaming: capabilities?.streaming ?? capabilities?.stream ?? true,
    contextWindow: Number(model?.limit?.context ?? 0),
    maxOutputTokens: Number(model?.limit?.output ?? 0),
    supportsReasoning: Boolean(capabilities?.reasoning) || Boolean(inferred.supportsReasoning),
    supportsWebSearch: Boolean(capabilities?.web) || Boolean(inferred.supportsWebSearch),
    supportsPDFAnalysis: Boolean(inputCaps?.pdf || outputCaps?.pdf) || Boolean(inferred.supportsPDFAnalysis),
    supportsCodeExecution: Boolean(capabilities?.toolcall || capabilities?.function_calling),
    inputCostPer1kTokens: typeof model?.cost?.input === "number" ? model.cost.input : undefined,
    outputCostPer1kTokens: typeof model?.cost?.output === "number" ? model.cost.output : undefined,
    averageLatencyMs: typeof model?.latency === "number" ? model.latency : undefined,
    throughputTokensPerSecond: typeof model?.throughput === "number" ? model.throughput : undefined,
  };

  return {
    ...base,
    ...(input.overrides ?? {}),
  };
}

```

---

## File: models/capability-overrides.ts

```typescript
import type { ModelCapabilities } from "./capabilities";

export type CapabilityOverrideMap = Record<string, Partial<ModelCapabilities>>;

export function resolveCapabilityOverride(
  modelFullId: string,
  overrides?: CapabilityOverrideMap,
): Partial<ModelCapabilities> | undefined {
  if (!overrides) return undefined;
  if (overrides[modelFullId]) return overrides[modelFullId];
  const lowered = modelFullId.toLowerCase();
  const match = Object.entries(overrides).find(([key]) => key.toLowerCase() === lowered);
  return match ? match[1] : undefined;
}

```

---

## File: models/catalog.ts

```typescript
import type { Config, Model, Provider } from "@opencode-ai/sdk";
import { resolveModel } from "./resolver";

export type ModelCatalogEntry = {
  /** Full ID in provider/model format */
  full: string;
  providerID: string;
  modelID: string;
  name: string;
  status: Model["status"];
  capabilities: Model["capabilities"];
  limit: Model["limit"];
  cost: Model["cost"];
  providerSource: Provider["source"];
};

/**
 * Type guard to treat a provider model entry as a full Model type.
 * The SDK's Provider.models type is Record<string, Model>, but Object.entries
 * loses the Model typing. This helper restores it.
 */
function asModel(model: unknown): Model {
  return model as Model;
}

export function isFullModelID(value: string): boolean {
  return value.includes("/");
}

export function parseFullModelID(value: string): { providerID: string; modelID: string } {
  const [providerID, ...rest] = value.split("/");
  return { providerID, modelID: rest.join("/") };
}

export function fullModelID(providerID: string, modelID: string): string {
  return `${providerID}/${modelID}`;
}

export function flattenProviders(providers: Provider[]): ModelCatalogEntry[] {
  const out: ModelCatalogEntry[] = [];
  for (const provider of providers) {
    const models = provider.models ?? {};
    for (const [modelID, modelEntry] of Object.entries(models)) {
      const model = asModel(modelEntry);
      out.push({
        full: fullModelID(provider.id, modelID),
        providerID: provider.id,
        modelID,
        name: model.name ?? modelID,
        status: model.status ?? "active",
        capabilities: model.capabilities ?? {
          temperature: true,
          reasoning: false,
          attachment: false,
          toolcall: false,
          input: { text: true, audio: false, image: false, video: false, pdf: false },
          output: { text: true, audio: false, image: false, video: false, pdf: false },
        },
        limit: model.limit ?? { context: 0, output: 0 },
        cost: model.cost ?? { input: 0, output: 0, cache: { read: 0, write: 0 } },
        providerSource: provider.source,
      });
    }
  }
  return out;
}

export function filterProviders(providers: Provider[], scope: "configured" | "all"): Provider[] {
  if (scope === "all") return providers;

  // Filter to only providers that are usable (have credentials or are explicitly configured).
  //
  // The SDK's Provider.source field tells us how the provider was registered:
  //   - "config": Explicitly configured in opencode.json
  //   - "custom": Custom provider (npm package, explicitly configured)
  //   - "env": Auto-detected from environment variables (e.g., ANTHROPIC_API_KEY)
  //   - "api": From SDK's built-in API catalog (may or may not have credentials)
  //
  // For "configured" scope, we include:
  //   - "config" and "custom" sources (explicitly configured)
  //   - "env" sources (have environment-based credentials)
  //   - "api" sources that have a `key` set (connected via /connect)
  // The "opencode" provider is special and always available.
  return providers.filter((p) => {
    if (p.id === "opencode") return true;

    // Include explicitly configured providers
    if (p.source === "config" || p.source === "custom") return true;

    // Include environment-detected providers (they have API keys set)
    if (p.source === "env") return true;

    // For API catalog providers, check if they have credentials set.
    // The SDK's Provider type has an optional `key` field that's populated when
    // credentials are available (set via /connect command which stores in auth.json).
    if (p.source === "api" && p.key) return true;

    return false;
  });
}

export function resolveModelRef(
  input: string,
  providers: Provider[],
): { full: string; providerID: string; modelID: string } | { error: string; suggestions?: string[] } {
  const resolved = resolveModel(input, { providers });
  if ("error" in resolved) return resolved;
  return { full: resolved.full, providerID: resolved.providerID, modelID: resolved.modelID };
}

export function pickVisionModel(models: ModelCatalogEntry[]): ModelCatalogEntry | undefined {
  const score = (m: ModelCatalogEntry): number => {
    let s = 0;
    if (m.status === "deprecated") s -= 50;
    if (m.capabilities.toolcall) s += 10;
    if (m.capabilities.attachment) s += 10;
    if (m.capabilities.input?.image) s += 100;
    if (/\bvision\b/i.test(m.name) || /\bvision\b/i.test(m.modelID)) s += 20;
    if (/\bglm\b/i.test(m.modelID) && /4\\.6v/i.test(m.modelID)) s += 15;
    s += Math.min(Math.floor((m.limit?.context ?? 0) / 32000), 10);
    return s;
  };

  const candidates = models
    .filter((m) => m.capabilities?.attachment || m.capabilities?.input?.image)
    .sort((a, b) => score(b) - score(a));
  return candidates[0];
}

export function pickFastModel(models: ModelCatalogEntry[]): ModelCatalogEntry | undefined {
  const score = (m: ModelCatalogEntry): number => {
    let s = 0;
    if (m.status === "deprecated") s -= 50;
    if (m.capabilities.toolcall) s += 5;
    if (/(mini|small|flash|fast|haiku)/i.test(m.modelID) || /(mini|small|flash|fast|haiku)/i.test(m.name)) s += 10;
    if ((m.cost?.input ?? 0) > 0) s -= Math.min(m.cost.input, 5);
    if ((m.limit?.context ?? 0) > 0) s += Math.min(Math.floor(m.limit.context / 64000), 3);
    return s;
  };
  return [...models].sort((a, b) => score(b) - score(a))[0];
}

export function pickDocsModel(models: ModelCatalogEntry[]): ModelCatalogEntry | undefined {
  const score = (m: ModelCatalogEntry): number => {
    let s = 0;
    if (m.status === "deprecated") s -= 50;
    if (m.capabilities.toolcall) s += 10;
    if (m.capabilities.reasoning) s += 3;
    if (/minimax/i.test(m.modelID) || /minimax/i.test(m.name)) s += 8;
    if (/m2/i.test(m.modelID) || /m2/i.test(m.name)) s += 3;
    s += Math.min(Math.floor((m.limit?.context ?? 0) / 64000), 10);
    return s;
  };
  return [...models].sort((a, b) => score(b) - score(a))[0];
}

/**
 * Expected shape of the config.providers response.
 * The SDK response type is complex, so we define the expected data shape here.
 */
type ProvidersResponseData = {
  providers?: Provider[];
  default?: Record<string, string>;
};

export type CatalogClient = {
  config: {
    get: (args: { query: { directory: string } }) => Promise<{ data?: Config }>;
    providers: (args: { query: { directory: string } }) => Promise<{ data?: ProvidersResponseData }>;
  };
};

export async function fetchOpencodeConfig(client: CatalogClient, directory: string): Promise<Config | undefined> {
  const res = await client.config.get({ query: { directory } }).catch(() => undefined);
  return res?.data;
}

export async function fetchProviders(
  client: CatalogClient,
  directory: string,
): Promise<{ providers: Provider[]; defaults: Record<string, string> }> {
  const res = await client.config.providers({ query: { directory } });
  return { providers: res.data?.providers ?? [], defaults: res.data?.default ?? {} };
}

```

---

## File: models/cost.ts

```typescript
import type { OrchestratorConfig } from "../types";
import type { ModelCapabilities } from "./capabilities";

export function averageCostPer1kTokens(cap: ModelCapabilities): number | undefined {
  const input = cap.inputCostPer1kTokens;
  const output = cap.outputCostPer1kTokens;
  if (typeof input !== "number" && typeof output !== "number") return undefined;
  if (typeof input === "number" && typeof output === "number") return (input + output) / 2;
  return typeof input === "number" ? input : output;
}

export function scoreCost(
  cap: ModelCapabilities,
  selection?: OrchestratorConfig["modelSelection"],
): {
  score: number;
  tooExpensive: boolean;
} {
  const mode = selection?.mode ?? "performance";
  const avg = averageCostPer1kTokens(cap);
  const max = selection?.maxCostPer1kTokens;

  if (typeof max === "number" && typeof avg === "number" && avg > max) {
    return { score: -100, tooExpensive: true };
  }

  if (mode === "performance") {
    return { score: 0, tooExpensive: false };
  }

  if (typeof avg !== "number") {
    return { score: mode === "economical" ? -20 : -5, tooExpensive: false };
  }

  const penalty = mode === "economical" ? avg * 100 : avg * 40;
  return { score: -penalty, tooExpensive: false };
}

```

---

## File: models/hydrate.ts

```typescript
import type { OrchestratorConfig, WorkerProfile } from "../types";
import { normalizeAliases } from "./aliases";
import type { CatalogClient } from "./catalog";
import { fetchOpencodeConfig, fetchProviders } from "./catalog";
import { resolveModel } from "./resolver";

export type ProfileModelHydrationChange = {
  profileId: string;
  from: string;
  to: string;
  reason: string;
};

export async function hydrateProfileModelsFromOpencode(input: {
  client: CatalogClient;
  directory: string;
  profiles: Record<string, WorkerProfile>;
  modelAliases?: OrchestratorConfig["modelAliases"];
  modelSelection?: OrchestratorConfig["modelSelection"];
}): Promise<{
  profiles: Record<string, WorkerProfile>;
  changes: ProfileModelHydrationChange[];
  fallbackModel?: string;
}> {
  const [cfg, providersRes] = await Promise.all([
    fetchOpencodeConfig(input.client, input.directory),
    fetchProviders(input.client, input.directory),
  ]);

  const providersAll = providersRes.providers;
  const aliases = normalizeAliases(input.modelAliases);

  const fallbackCandidate =
    cfg?.model ||
    (providersRes.defaults?.opencode ? `opencode/${providersRes.defaults.opencode}` : undefined) ||
    "opencode/gpt-5-nano";

  const resolvedFallback = resolveModel(fallbackCandidate, {
    providers: providersAll,
    aliases,
    selection: input.modelSelection,
    defaults: providersRes.defaults,
  });
  const fallbackModel = "error" in resolvedFallback ? fallbackCandidate : resolvedFallback.full;

  const changes: ProfileModelHydrationChange[] = [];

  const next: Record<string, WorkerProfile> = {};
  for (const [id, profile] of Object.entries(input.profiles)) {
    let desired = profile.model;
    let reason = "";

    const modelSpec = profile.model.trim();
    const isAutoTag = modelSpec.startsWith("auto") || modelSpec.startsWith("node");

    const resolved = resolveModel(modelSpec, {
      providers: providersAll,
      defaults: providersRes.defaults,
      aliases,
      selection: input.modelSelection,
    });

    if ("error" in resolved) {
      if (isAutoTag && !/vision/i.test(modelSpec)) {
        desired = fallbackModel;
        reason = `fallback to default model (${modelSpec})`;
      } else {
        const suffix = resolved.suggestions?.length ? `\nSuggestions:\n- ${resolved.suggestions.join("\n- ")}` : "";
        throw new Error(`Invalid model for profile "${profile.id}": ${resolved.error}${suffix}`);
      }
    } else {
      desired = resolved.full;
      reason = resolved.reason;
      if (profile.supportsVision && !resolved.capabilities.supportsVision) {
        throw new Error(
          `Profile "${profile.id}" requires vision, but selected model "${desired}" does not appear vision-capable. ` +
            `Choose a model with image input support.`,
        );
      }
    }

    next[id] = { ...profile, model: desired };

    if (desired !== profile.model) {
      changes.push({
        profileId: id,
        from: profile.model,
        to: desired,
        reason: reason || "resolved",
      });
    }
  }

  return { profiles: next, changes, fallbackModel };
}

```

---

## File: models/resolver.ts

```typescript
import type { Model, Provider } from "@opencode-ai/sdk";
import type { OrchestratorConfig } from "../types";
import { type ModelAliasMap, resolveAlias } from "./aliases";
import { deriveModelCapabilities, type ModelCapabilities } from "./capabilities";
import { type CapabilityOverrideMap, resolveCapabilityOverride } from "./capability-overrides";
import { filterProviders, fullModelID, isFullModelID, parseFullModelID } from "./catalog";
import { scoreCost } from "./cost";

/**
 * Type helper to treat a provider model entry as a full Model type.
 * The SDK's Provider.models type is Record<string, Model>, but Object.entries
 * loses the Model typing. This helper restores it.
 */
function asModel(model: unknown): Model {
  return model as Model;
}

export type ModelResolutionContext = {
  providers: Provider[];
  defaults?: Record<string, string>;
  aliases?: ModelAliasMap;
  selection?: OrchestratorConfig["modelSelection"];
  capabilityOverrides?: CapabilityOverrideMap;
};

export type ModelResolutionResult = {
  full: string;
  providerID: string;
  modelID: string;
  capabilities: ModelCapabilities;
  reason: string;
  score: number;
};

export type ModelResolutionError = {
  error: string;
  suggestions?: string[];
};

function normalizeAutoTag(raw: string): string | undefined {
  const value = raw.trim().toLowerCase();
  if (!value) return undefined;
  if (value === "auto" || value === "node") return "auto";
  if (value.startsWith("auto:")) return value;
  if (value.startsWith("node:")) return `auto:${value.slice(5)}`;
  return undefined;
}

function providerPreferenceScore(providerId: string, selection?: OrchestratorConfig["modelSelection"]): number {
  const preferred = selection?.preferredProviders ?? [];
  const idx = preferred.findIndex((id) => id.toLowerCase() === providerId.toLowerCase());
  return idx >= 0 ? 15 - idx : 0;
}

function rankForTag(tag: string, modelId: string, modelName?: string): number {
  const text = `${modelId} ${modelName ?? ""}`.toLowerCase();
  if (tag === "auto:fast") {
    if (/(mini|small|flash|fast|haiku)/i.test(text)) return 10;
  }
  if (tag === "auto:vision") {
    if (/vision|multimodal|image/i.test(text)) return 8;
  }
  if (tag === "auto:docs") {
    if (/doc|research|long|context/i.test(text)) return 6;
  }
  if (tag === "auto:code") {
    if (/code|coder|instruct/i.test(text)) return 5;
  }
  return 0;
}

function capabilityRequirements(tag: string): {
  requiresVision?: boolean;
  requiresTools?: boolean;
  requiresReasoning?: boolean;
  minContext?: number;
  maxContext?: number;
} {
  switch (tag) {
    case "auto:vision":
      return { requiresVision: true };
    case "auto:fast":
      return { maxContext: 32_000 };
    case "auto:docs":
      return { requiresReasoning: true, minContext: 64_000 };
    case "auto:code":
      return { requiresTools: true, minContext: 16_000 };
    case "auto:reasoning":
      return { requiresReasoning: true };
    default:
      return {};
  }
}

function matchesRequirements(cap: ModelCapabilities, requirements: ReturnType<typeof capabilityRequirements>): boolean {
  if (requirements.requiresVision && !cap.supportsVision) return false;
  if (requirements.requiresTools && !cap.supportsTools) return false;
  if (requirements.requiresReasoning && !cap.supportsReasoning) return false;
  if (requirements.minContext && cap.contextWindow > 0 && cap.contextWindow < requirements.minContext) return false;
  if (requirements.maxContext && cap.contextWindow > 0 && cap.contextWindow > requirements.maxContext) return false;
  return true;
}

function pickDefaultModel(
  providers: Provider[],
  defaults?: Record<string, string>,
  selection?: OrchestratorConfig["modelSelection"],
): ModelResolutionResult | undefined {
  if (!defaults) return undefined;
  const preferred = selection?.preferredProviders ?? [];
  const candidates = preferred.length > 0 ? preferred : Object.keys(defaults);
  for (const providerId of candidates) {
    const modelId = defaults[providerId];
    if (!modelId) continue;
    const provider = providers.find((p) => p.id === providerId);
    if (!provider || !(modelId in (provider.models ?? {}))) continue;
    const model = asModel(provider.models?.[modelId]);
    const capabilities = deriveModelCapabilities({ model, modelId, modelName: model?.name });
    return {
      full: fullModelID(providerId, modelId),
      providerID: providerId,
      modelID: modelId,
      capabilities,
      reason: "default provider model",
      score: 0,
    };
  }
  return undefined;
}

function collectSuggestions(providers: Provider[], query: string): string[] {
  const needle = query.toLowerCase();
  const out: string[] = [];
  for (const provider of providers) {
    for (const [modelId, modelEntry] of Object.entries(provider.models ?? {})) {
      const model = asModel(modelEntry);
      const name = model?.name ?? "";
      const full = fullModelID(provider.id, modelId);
      if (
        modelId.toLowerCase().includes(needle) ||
        provider.id.toLowerCase().includes(needle) ||
        name.toLowerCase().includes(needle) ||
        full.toLowerCase().includes(needle)
      ) {
        out.push(full);
      }
    }
  }
  return out.slice(0, 20);
}

export function resolveModel(input: string, ctx: ModelResolutionContext): ModelResolutionResult | ModelResolutionError {
  const raw = input.trim();
  if (!raw) return { error: "Model is required." };

  const aliasTarget = resolveAlias(raw, ctx.aliases);
  const normalizedInput = aliasTarget ?? raw;

  const autoTag = normalizeAutoTag(normalizedInput);
  const providersAll = ctx.providers;

  if (autoTag) {
    if (autoTag === "auto") {
      const providerScope = filterProviders(providersAll, "configured");
      const defaultPick = pickDefaultModel(providerScope, ctx.defaults, ctx.selection);
      if (defaultPick) return defaultPick;
    }

    const providerScope = filterProviders(providersAll, "configured");
    const requirements = capabilityRequirements(autoTag);

    const candidates: ModelResolutionResult[] = [];

    for (const provider of providerScope) {
      for (const [modelId, modelEntry] of Object.entries(provider.models ?? {})) {
        const model = asModel(modelEntry);
        const full = fullModelID(provider.id, modelId);
        const overrides = resolveCapabilityOverride(full, ctx.capabilityOverrides);
        const caps = deriveModelCapabilities({
          model,
          modelId,
          modelName: model?.name,
          overrides,
        });
        if (!matchesRequirements(caps, requirements)) continue;

        let score = 0;
        if (model?.status === "deprecated") score -= 50;
        score += rankForTag(autoTag, modelId, model?.name);

        if (caps.contextWindow > 0) {
          if (autoTag === "auto:docs") score += Math.min(Math.floor(caps.contextWindow / 64_000), 10);
          if (autoTag === "auto:fast") score -= Math.min(Math.floor(caps.contextWindow / 32_000), 5);
          if (autoTag === "auto:code") score += Math.min(Math.floor(caps.contextWindow / 32_000), 5);
        }

        if (autoTag === "auto:cheap") {
          score += 5;
        }

        score += providerPreferenceScore(provider.id, ctx.selection);

        const costScore = scoreCost(caps, ctx.selection);
        if (costScore.tooExpensive) continue;
        score += costScore.score;

        candidates.push({
          full,
          providerID: provider.id,
          modelID: modelId,
          capabilities: caps,
          reason: `auto-selected (${autoTag})`,
          score,
        });
      }
    }

    if (candidates.length === 0) {
      return {
        error: `No models matched ${autoTag}. Configure a compatible model or set an explicit provider/model ID.`,
        suggestions: collectSuggestions(providerScope, autoTag),
      };
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0];
  }

  if (isFullModelID(normalizedInput)) {
    const parsed = parseFullModelID(normalizedInput);
    const provider = providersAll.find((p) => p.id === parsed.providerID);
    if (!provider) {
      return {
        error: `Unknown provider "${parsed.providerID}".`,
        suggestions: providersAll.map((p) => p.id).slice(0, 20),
      };
    }
    const modelEntry = provider.models?.[parsed.modelID];
    if (!modelEntry) {
      return {
        error: `Model "${parsed.modelID}" not found for provider "${provider.id}".`,
        suggestions: collectSuggestions([provider], parsed.modelID),
      };
    }
    const model = asModel(modelEntry);
    const overrides = resolveCapabilityOverride(normalizedInput, ctx.capabilityOverrides);
    const caps = deriveModelCapabilities({
      model,
      modelId: parsed.modelID,
      modelName: model?.name,
      overrides,
    });
    return {
      full: normalizedInput,
      providerID: parsed.providerID,
      modelID: parsed.modelID,
      capabilities: caps,
      reason: aliasTarget ? `alias (${raw})` : "explicit",
      score: 0,
    };
  }

  const matches: ModelResolutionResult[] = [];
  for (const provider of providersAll) {
    for (const [modelId, modelEntry] of Object.entries(provider.models ?? {})) {
      if (modelId !== normalizedInput) continue;
      const model = asModel(modelEntry);
      const full = fullModelID(provider.id, modelId);
      const overrides = resolveCapabilityOverride(full, ctx.capabilityOverrides);
      const caps = deriveModelCapabilities({
        model,
        modelId,
        modelName: model?.name,
        overrides,
      });
      matches.push({
        full,
        providerID: provider.id,
        modelID: modelId,
        capabilities: caps,
        reason: "exact match",
        score: providerPreferenceScore(provider.id, ctx.selection),
      });
    }
  }

  if (matches.length > 0) {
    matches.sort((a, b) => b.score - a.score);
    return matches[0];
  }

  const suggestions = collectSuggestions(providersAll, normalizedInput);
  return {
    error: `Model "${normalizedInput}" not found.`,
    suggestions,
  };
}

```

---

## File: orchestrator/index.ts

```typescript
import type { ApiService } from "../api";
import type { CommunicationService } from "../communication";
import { canAutoSpawn, canSpawnManually, canSpawnOnDemand } from "../core/spawn-policy";
import type { Factory, OrchestratorConfig, ServiceLifecycle, WorkerInstance } from "../types";
import type { WorkerManager } from "../workers";
import type { WorkerAttachment } from "../workers/prompt";
import type { WorkflowEngine } from "../workflows/factory";
import type { WorkflowRunResult } from "../workflows/types";
import { selectWorkerId } from "./router";

export type OrchestratorDeps = {
  api: ApiService;
  workers: WorkerManager;
  workflows?: WorkflowEngine;
  communication?: CommunicationService;
};

export type OrchestratorService = ServiceLifecycle & {
  ensureWorker: (input: {
    workerId: string;
    reason: "manual" | "on-demand";
    parentSessionId?: string;
  }) => Promise<WorkerInstance>;
  delegateTask: (input: {
    task: string;
    attachments?: WorkerAttachment[];
    autoSpawn?: boolean;
    parentSessionId?: string;
  }) => Promise<{ workerId: string; response: string }>;
  runWorkflow: (input: {
    workflowId: string;
    task: string;
    attachments?: WorkerAttachment[];
    autoSpawn?: boolean;
  }) => Promise<WorkflowRunResult>;
};

export const createOrchestrator: Factory<OrchestratorConfig, OrchestratorDeps, OrchestratorService> = ({
  config,
  deps,
}) => {
  const ensureWorker = async (input: {
    workerId: string;
    reason: "manual" | "on-demand";
    parentSessionId?: string;
  }) => {
    const existing = deps.workers.getWorker(input.workerId);
    if (existing) return existing;

    const allowedByPolicy =
      input.reason === "manual"
        ? canSpawnManually(config.spawnPolicy, input.workerId)
        : canSpawnOnDemand(config.spawnPolicy, input.workerId);
    if (!allowedByPolicy) {
      throw new Error(`Spawning worker "${input.workerId}" is disabled by spawnPolicy.`);
    }

    // Note: Removed redundant spawnOnDemand whitelist check.
    // The spawnPolicy check above already controls on-demand spawning.
    // Vision and other workers should be spawnable on-demand by default.

    return await deps.workers.spawnById(input.workerId, { parentSessionId: input.parentSessionId });
  };

  const delegateTask = async (input: {
    task: string;
    attachments?: WorkerAttachment[];
    autoSpawn?: boolean;
    parentSessionId?: string;
  }) => {
    const workerId = selectWorkerId({
      task: input.task,
      profiles: config.profiles,
      attachments: input.attachments,
    });
    if (!workerId) throw new Error("No worker available for this task.");

    const instance =
      input.autoSpawn === false
        ? deps.workers.getWorker(workerId)
        : await ensureWorker({ workerId, reason: "on-demand" });

    if (!instance) {
      throw new Error(`Worker "${workerId}" is not running.`);
    }

    const res = await deps.workers.send(workerId, input.task, {
      attachments: input.attachments,
      sessionId: input.parentSessionId,
    });
    if (!res.success || !res.response) {
      throw new Error(res.error ?? "Worker request failed");
    }

    return { workerId, response: res.response };
  };

  const runWorkflow = async (input: {
    workflowId: string;
    task: string;
    attachments?: WorkerAttachment[];
    autoSpawn?: boolean;
  }) => {
    if (!deps.workflows) throw new Error("Workflows are not enabled.");
    return await deps.workflows.run(
      {
        workflowId: input.workflowId,
        task: input.task,
        attachments: input.attachments,
        autoSpawn: input.autoSpawn,
        limits: {
          maxSteps: config.workflows?.roocodeBoomerang?.maxSteps ?? 6,
          maxTaskChars: config.workflows?.roocodeBoomerang?.maxTaskChars ?? 4000,
          maxCarryChars: config.workflows?.roocodeBoomerang?.maxCarryChars ?? 8000,
          perStepTimeoutMs: config.workflows?.roocodeBoomerang?.perStepTimeoutMs ?? 300_000,
        },
      },
      {
        resolveWorker: async (workerId, autoSpawn) => {
          if (autoSpawn === false) return workerId;
          await ensureWorker({ workerId, reason: "on-demand" });
          return workerId;
        },
        sendToWorker: async (workerId, message, options) =>
          deps.workers.send(workerId, message, {
            attachments: options.attachments,
            timeout: options.timeoutMs,
          }),
      },
    );
  };

  const start = async () => {
    if (!config.autoSpawn) return;
    const spawnIds = config.spawn ?? [];
    // Don't block startup - spawn workers in background
    if (spawnIds.length > 0) {
      setTimeout(() => {
        for (const id of spawnIds) {
          if (!canAutoSpawn(config.spawnPolicy, id)) continue;
          deps.workers.spawnById(id).catch(() => {});
        }
      }, 100);
    }
  };

  const stop = async () => {
    const workers = deps.workers.listWorkers();
    await Promise.allSettled(workers.map((w) => deps.workers.stopWorker(w.profile.id)));
  };

  return {
    ensureWorker,
    delegateTask,
    runWorkflow,
    start,
    stop,
    health: async () => ({ ok: true }),
  };
};

```

---

## File: orchestrator/router.ts

```typescript
import { findProfile } from "../profiles/discovery";
import type { WorkerProfile } from "../types";
import type { WorkerAttachment } from "../workers/prompt";

export function selectWorkerId(input: {
  task: string;
  profiles: Record<string, WorkerProfile>;
  attachments?: WorkerAttachment[];
}): string | undefined {
  const hasVision = input.attachments?.some((att) => att.type === "image");
  if (hasVision && input.profiles.vision) return "vision";

  const suggested = findProfile(input.task, input.profiles);
  if (suggested) return suggested;

  if (input.profiles.coder) return "coder";
  return Object.keys(input.profiles)[0];
}

```

---

## File: permissions/schema.ts

```typescript
import type { ToolPermissions } from "../types";

export type { ToolPermissions };

export type PermissionCategory = "full" | "read" | "none";
export type ExecutionPermission = "full" | "sandboxed" | "none";
export type NetworkPermission = "full" | "localhost" | "none";

export const defaultToolPermissions: ToolPermissions = {};

```

---

## File: permissions/validator.ts

```typescript
import type { ToolPermissions } from "../types";

const FILESYSTEM_READ_TOOLS = ["read", "ls", "glob", "rg", "search", "stat"];
const FILESYSTEM_WRITE_TOOLS = ["write", "edit", "patch", "delete", "mv", "cp", "mkdir", "rmdir"];
const EXECUTION_TOOLS = ["bash", "exec", "command", "shell", "run", "process"];
const NETWORK_TOOLS = ["fetch", "curl", "wget", "http", "browser", "web_search", "web"];

function mergeArrays(base?: string[], override?: string[]): string[] | undefined {
  const merged = [...(base ?? []), ...(override ?? [])].filter(
    (value) => typeof value === "string" && value.length > 0,
  );
  if (merged.length === 0) return undefined;
  return Array.from(new Set(merged));
}

export function mergeToolPermissions(base?: ToolPermissions, override?: ToolPermissions): ToolPermissions | undefined {
  if (!base && !override) return undefined;
  if (!base) return override;
  if (!override) return base;

  return {
    categories: { ...(base.categories ?? {}), ...(override.categories ?? {}) },
    tools: { ...(base.tools ?? {}), ...(override.tools ?? {}) },
    paths: {
      allowed: mergeArrays(base.paths?.allowed, override.paths?.allowed),
      denied: mergeArrays(base.paths?.denied, override.paths?.denied),
    },
  };
}

export function buildToolConfigFromPermissions(input?: {
  permissions?: ToolPermissions;
  baseTools?: Record<string, boolean>;
}): Record<string, boolean> | undefined {
  const permissions = input?.permissions;
  const baseTools = input?.baseTools;

  if (!permissions && !baseTools) return undefined;

  const resolved: Record<string, boolean> = { ...(baseTools ?? {}) };

  const filesystem = permissions?.categories?.filesystem;
  if (filesystem === "none") {
    for (const id of [...FILESYSTEM_READ_TOOLS, ...FILESYSTEM_WRITE_TOOLS]) {
      resolved[id] = false;
    }
  } else if (filesystem === "read") {
    for (const id of FILESYSTEM_WRITE_TOOLS) {
      resolved[id] = false;
    }
  }

  const execution = permissions?.categories?.execution;
  if (execution === "none") {
    for (const id of EXECUTION_TOOLS) {
      resolved[id] = false;
    }
  }

  const network = permissions?.categories?.network;
  if (network === "none") {
    for (const id of NETWORK_TOOLS) {
      resolved[id] = false;
    }
  }

  if (permissions?.tools) {
    for (const [toolId, rule] of Object.entries(permissions.tools)) {
      if (typeof rule?.enabled === "boolean") {
        resolved[toolId] = rule.enabled;
      }
    }
  }

  return resolved;
}

export function summarizePermissions(permissions?: ToolPermissions): string | undefined {
  if (!permissions) return undefined;

  const parts: string[] = [];
  if (permissions.categories?.filesystem) parts.push(`filesystem: ${permissions.categories.filesystem}`);
  if (permissions.categories?.execution) parts.push(`execution: ${permissions.categories.execution}`);
  if (permissions.categories?.network) parts.push(`network: ${permissions.categories.network}`);

  if (permissions.paths?.allowed?.length) parts.push(`allowed paths: ${permissions.paths.allowed.join(", ")}`);
  if (permissions.paths?.denied?.length) parts.push(`denied paths: ${permissions.paths.denied.join(", ")}`);

  if (permissions.tools) {
    const overrides = Object.entries(permissions.tools)
      .map(([toolId, rule]) => `${toolId}: ${rule.enabled ? "enabled" : "disabled"}`)
      .join(", ");
    if (overrides) parts.push(`tool overrides: ${overrides}`);
  }

  if (parts.length === 0) return undefined;
  return parts.join("; ");
}

```

---

## File: profiles/discovery.ts

```typescript
import type { WorkerProfile } from "../types";

export type ProfileSuggestion = {
  id: string;
  score: number;
  reason: string;
};

const keywordBoosts: Array<{ pattern: RegExp; profileId: string; score: number; reason: string }> = [
  { pattern: /image|vision|screenshot|diagram|ocr/i, profileId: "vision", score: 40, reason: "vision task" },
  {
    pattern: /docs?|documentation|reference|api|research|cite|example/i,
    profileId: "docs",
    score: 35,
    reason: "documentation",
  },
  { pattern: /code|implement|bug|fix|refactor|test|build/i, profileId: "coder", score: 30, reason: "coding task" },
  { pattern: /architecture|design|plan|tradeoff|strategy/i, profileId: "architect", score: 25, reason: "architecture" },
  { pattern: /search|find|locate|where|explore/i, profileId: "explorer", score: 20, reason: "codebase search" },
  { pattern: /memory|neo4j|knowledge/i, profileId: "memory", score: 20, reason: "memory system" },
];

function tokenize(text: string): string[] {
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g);
  return tokens ? Array.from(new Set(tokens)) : [];
}

export function suggestProfiles(
  query: string,
  profiles: Record<string, WorkerProfile>,
  options?: { limit?: number },
): ProfileSuggestion[] {
  const tokens = tokenize(query);
  const suggestions: ProfileSuggestion[] = [];

  for (const profile of Object.values(profiles)) {
    let score = 0;
    const reasons: string[] = [];

    for (const boost of keywordBoosts) {
      if (boost.profileId === profile.id && boost.pattern.test(query)) {
        score += boost.score;
        reasons.push(boost.reason);
      }
    }

    const haystack = [profile.id, profile.name, profile.purpose, profile.whenToUse, ...(profile.tags ?? [])]
      .join(" ")
      .toLowerCase();

    for (const token of tokens) {
      if (profile.id.toLowerCase().includes(token)) {
        score += 12;
        reasons.push(`id match: ${token}`);
      } else if ((profile.tags ?? []).some((tag) => tag.toLowerCase().includes(token))) {
        score += 8;
        reasons.push(`tag match: ${token}`);
      } else if (haystack.includes(token)) {
        score += 4;
        reasons.push(`text match: ${token}`);
      }
    }

    if (score > 0) {
      suggestions.push({
        id: profile.id,
        score,
        reason: Array.from(new Set(reasons)).join(", ") || "matched",
      });
    }
  }

  suggestions.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return suggestions.slice(0, options?.limit ?? 5);
}

export function findProfile(query: string, profiles: Record<string, WorkerProfile>): string | undefined {
  const suggestions = suggestProfiles(query, profiles, { limit: 1 });
  return suggestions[0]?.id;
}

```

---

## File: prompts/index.ts

```typescript
export { buildOrchestratorSystemPrompt, buildWorkerSummary } from "./orchestrator-system";

```

---

## File: prompts/orchestrator-system.ts

```typescript
import type { OrchestratorConfig, WorkerProfile } from "../types";

type OrchestratorPromptInput = {
  config: OrchestratorConfig;
  profiles: WorkerProfile[];
  runningWorkers: Array<{ id: string; name: string; status: string }>;
  memoryEnabled: boolean;
};

/**
 * Build the orchestrator system prompt that teaches the AI how to:
 * - Use workers intentionally (not auto-spawning)
 * - Update the memory graph at end of turns
 * - Delegate tasks appropriately
 */
export function buildOrchestratorSystemPrompt(input: OrchestratorPromptInput): string {
  const { profiles, runningWorkers, memoryEnabled } = input;

  const sections: string[] = [];

  // Core orchestrator identity
  sections.push(
    `
<orchestrator-role>
You are the OpenCode Orchestrator - a coordination layer that manages specialized AI workers.
Your role is to understand tasks, select appropriate workers, and ensure work is completed effectively.

IMPORTANT PRINCIPLES:
1. Workers are spawned ON-DEMAND, not automatically. Only spawn workers when needed for a task.
2. Prefer completing simple tasks yourself rather than delegating to workers.
3. Use workers for specialized capabilities you lack (vision, specific models, domain expertise).
4. Track work across multiple workers and synthesize results.
</orchestrator-role>
`.trim(),
  );

  // Available workers section
  if (profiles.length > 0) {
    const profileLines = profiles
      .filter((p) => p.enabled !== false)
      .map((p) => {
        const capabilities: string[] = [];
        if (p.supportsVision) capabilities.push("vision");
        if (p.supportsWeb) capabilities.push("web");
        const capStr = capabilities.length > 0 ? ` [${capabilities.join(", ")}]` : "";
        return `  - ${p.id}: ${p.name}${capStr}\n    Purpose: ${p.purpose || "General purpose worker"}\n    When to use: ${p.whenToUse || "When specialized assistance is needed"}`;
      })
      .join("\n\n");

    sections.push(
      `
<available-workers>
The following worker profiles are available. They are NOT running until you spawn them:

${profileLines}

To use a worker:
1. First spawn it: spawn_worker({ profileId: "<id>" })
2. Then message it: ask_worker({ workerId: "<id>", message: "<task>" })
3. Or delegate directly: delegate_task({ task: "<task description>" }) - auto-selects best worker

SPAWN GUIDELINES:
- Only spawn workers when you need their specific capabilities
- Reuse already-running workers (check running workers below)
- Stop workers when done with a long task sequence: stop_worker({ workerId: "<id>" })
</available-workers>
`.trim(),
    );
  }

  // Running workers
  if (runningWorkers.length > 0) {
    const workerLines = runningWorkers.map((w) => `  - ${w.id} (${w.name}) — ${w.status}`).join("\n");
    sections.push(
      `
<running-workers>
Currently running workers (reuse these before spawning new ones):
${workerLines}
</running-workers>
`.trim(),
    );
  } else {
    sections.push(
      `
<running-workers>
No workers are currently running. Spawn workers on-demand as needed.
</running-workers>
`.trim(),
    );
  }

  // Memory graph protocol
  if (memoryEnabled) {
    sections.push(
      `
<memory-protocol>
MEMORY GRAPH INTEGRATION:

At the END of each turn where you learn something significant, update the memory graph:

1. RECORD important information using memory_record:
   - Key decisions made
   - User preferences discovered
   - Important context for future sessions
   - Task outcomes and learnings

2. QUERY relevant context using memory_query when starting new tasks:
   - Check for prior work on similar topics
   - Retrieve user preferences
   - Find related decisions or context

3. What to record:
   - Facts: "User prefers TypeScript over JavaScript"
   - Decisions: "Chose React Query for data fetching because..."
   - Context: "Project uses monorepo structure with Bun workspaces"
   - Outcomes: "Refactored auth module, reduced bundle size by 30%"

4. What NOT to record:
   - Transient debugging information
   - Obvious or self-evident facts
   - Sensitive credentials or secrets

Example turn-end memory update:
\`\`\`
memory_record({
  text: "User prefers to see test coverage reports after each test run",
  metadata: { category: "preference", topic: "testing" }
})
\`\`\`
</memory-protocol>
`.trim(),
    );
  }

  // Vision/image handling convention
  sections.push(
    `
<vision-convention>
IMAGE HANDLING:
When you see content wrapped in <pasted_image>...</pasted_image> tags, this is a TEXT DESCRIPTION of an image that was already analyzed by a vision worker.

- The image has ALREADY been processed - do NOT try to view, read, or analyze the image yourself
- The text inside <pasted_image> tags IS the image content - treat it as factual description
- Respond to the user's question using this text description as your source of truth
- Do NOT say "I cannot see the image" - you have the description, use it

Example:
User sends: "<pasted_image>A red button with 'Submit' text</pasted_image> What color is the button?"
You respond: "The button is red."

NOT: "I cannot view images" or "Let me analyze this image"
</vision-convention>
`.trim(),
  );

  // Tool usage guidelines
  sections.push(
    `
<tool-guidelines>
WORKER TOOLS:
- spawn_worker({ profileId }) - Start a worker (if not already running)
- ask_worker({ workerId, message }) - Send a message and wait for response
- ask_worker_async({ workerId, message }) - Send without waiting (for parallel work)
- await_worker_job({ jobId }) - Wait for async job result
- delegate_task({ task }) - Auto-select worker and complete task
- stop_worker({ workerId }) - Stop a running worker
- list_workers() - See all running workers

MEMORY TOOLS (when enabled):
- memory_record({ text, metadata? }) - Store information
- memory_query({ query, limit? }) - Retrieve relevant context

DECISION FRAMEWORK:
1. Can I complete this myself? → Do it directly
2. Do I need vision/special model? → Spawn appropriate worker
3. Is the task complex with subtasks? → Consider delegate_task or workflow
4. Am I learning something reusable? → Record to memory
</tool-guidelines>
`.trim(),
  );

  return sections.join("\n\n");
}

/**
 * Build a concise worker summary for injection into system context.
 */
export function buildWorkerSummary(input: {
  runningWorkers: Array<{ id: string; name: string; status: string }>;
  maxWorkers?: number;
}): string {
  const { runningWorkers, maxWorkers = 12 } = input;
  const workers = runningWorkers.slice(0, maxWorkers);

  if (workers.length === 0) {
    return "No workers currently running. Use spawn_worker or delegate_task to start workers on-demand.";
  }

  const lines = ["## Running Workers", ""];
  if (runningWorkers.length > workers.length) {
    lines.push(`(showing ${workers.length} of ${runningWorkers.length})`, "");
  }
  for (const w of workers) {
    lines.push(`- ${w.id} (${w.name}) — ${w.status}`);
  }
  lines.push("", "Use ask_worker({ workerId, message }) to message a worker.");
  return lines.join("\n");
}

```

---

## File: skills/builtin.ts

```typescript
import type { Skill } from "../types";

/**
 * Load builtin skills.
 *
 * With the new skill system, there are no hardcoded builtins.
 * All profiles come from .opencode/skill/ SKILL.md files.
 *
 * This function returns an empty map for backwards compatibility.
 * It will be removed in a future version.
 *
 * @deprecated Profiles are now loaded from .opencode/skill/
 */
export function loadBuiltinSkills(): Map<string, Skill> {
  // No more hardcoded builtins - everything comes from SKILL.md files
  return new Map();
}

```

---

## File: skills/convert.ts

```typescript
import type { Skill, SkillFrontmatter, SkillSource, WorkerProfile } from "../types";

function combineDescription(purpose?: string, whenToUse?: string): string {
  const parts = [purpose?.trim(), whenToUse?.trim()].filter(Boolean) as string[];
  if (parts.length === 0) return "General-purpose skill.";
  if (parts.length === 1) return parts[0];
  const combined = `${parts[0]} When to use: ${parts[1]}`;
  return combined.length > 1024 ? `${combined.slice(0, 1021).trimEnd()}...` : combined;
}

export function profileToSkill(profile: WorkerProfile, source: SkillSource): Skill {
  const frontmatter: SkillFrontmatter = {
    name: profile.id,
    description: combineDescription(profile.purpose, profile.whenToUse),
    model: profile.model,
    providerID: profile.providerID,
    temperature: profile.temperature,
    tools: profile.tools,
    permissions: profile.permissions,
    tags: profile.tags,
    supportsVision: profile.supportsVision,
    supportsWeb: profile.supportsWeb,
    injectRepoContext: profile.injectRepoContext,
    extends: profile.extends,
    compose: profile.compose,
    // Session mode configuration
    sessionMode: profile.sessionMode,
    forwardEvents: profile.forwardEvents,
    mcp: profile.mcp,
    integrations: profile.integrations,
    env: profile.env,
    envPrefixes: profile.envPrefixes,
    skillPermissions: profile.skillPermissions,
  };

  return {
    id: profile.id,
    source,
    frontmatter,
    systemPrompt: profile.systemPrompt ?? "",
    filePath: source.type === "builtin" ? `builtin:${profile.id}` : "",
    hasScripts: false,
    hasReferences: false,
    hasAssets: false,
  };
}

export function skillToProfile(skill: Skill): WorkerProfile {
  return {
    id: skill.frontmatter.name ?? skill.id,
    name: skill.frontmatter.name ?? skill.id,
    model: skill.frontmatter.model ?? "auto",
    providerID: skill.frontmatter.providerID,
    purpose: skill.frontmatter.description ?? "General-purpose skill.",
    whenToUse: skill.frontmatter.description ?? "General-purpose skill.",
    systemPrompt: skill.systemPrompt,
    supportsVision: skill.frontmatter.supportsVision,
    supportsWeb: skill.frontmatter.supportsWeb,
    tools: skill.frontmatter.tools,
    temperature: skill.frontmatter.temperature,
    tags: skill.frontmatter.tags,
    injectRepoContext: skill.frontmatter.injectRepoContext,
    permissions: skill.frontmatter.permissions,
    extends: skill.frontmatter.extends,
    compose: skill.frontmatter.compose,
    // Session mode configuration
    sessionMode: skill.frontmatter.sessionMode,
    forwardEvents: skill.frontmatter.forwardEvents,
    mcp: skill.frontmatter.mcp,
    integrations: skill.frontmatter.integrations,
    env: skill.frontmatter.env,
    envPrefixes: skill.frontmatter.envPrefixes,
    skillPermissions: skill.frontmatter.skillPermissions,
    source: skill.source,
  };
}

```

---

## File: skills/crud.ts

```typescript
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Skill, SkillInput, SkillScope } from "../types";
import { loadSkill, loadSkillOverrides } from "./loader";
import { serializeSkillFile } from "./parse";
import {
  getGlobalSkillsDir,
  getGlobalSubagentsDir,
  getProjectSkillsDirs,
  getProjectSubagentsDirs,
  getSkillFilePath,
  resolveProjectDir,
} from "./paths";
import { validateSkillInput } from "./validate";

function toValidationMessage(result: ReturnType<typeof validateSkillInput>): string {
  return result.errors.map((err) => `${err.field}: ${err.message}`).join("; ");
}

function findScopedSkillFilePath(id: string, scope: SkillScope, projectDir?: string): string | null {
  const resolvedProjectDir = scope === "project" ? resolveProjectDir(projectDir) : undefined;
  const roots =
    scope === "global"
      ? [getGlobalSkillsDir(), getGlobalSubagentsDir()]
      : resolvedProjectDir
        ? [...getProjectSkillsDirs(resolvedProjectDir), ...getProjectSubagentsDirs(resolvedProjectDir)]
        : [];

  for (const root of roots) {
    const filePath = join(root, id, "SKILL.md");
    if (existsSync(filePath)) return filePath;
  }

  return null;
}

async function writeSkillFile(filePath: string, input: SkillInput): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const frontmatter = {
    ...input.frontmatter,
    name: input.frontmatter.name ?? input.id,
  };
  const content = serializeSkillFile(frontmatter, input.systemPrompt ?? "");
  await writeFile(filePath, content, "utf8");
}

export async function createSkill(input: SkillInput, scope: SkillScope, projectDir?: string): Promise<Skill> {
  const validation = validateSkillInput(input);
  if (!validation.valid) throw new Error(`Invalid skill input: ${toValidationMessage(validation)}`);

  const resolvedProjectDir = scope === "project" ? resolveProjectDir(projectDir) : projectDir;
  const filePath = getSkillFilePath(input.id, scope, resolvedProjectDir);
  if (existsSync(filePath)) {
    throw new Error(`Skill "${input.id}" already exists in ${scope} scope.`);
  }

  await writeSkillFile(filePath, input);
  const skill = await loadSkill(input.id, projectDir);
  if (!skill) throw new Error(`Skill "${input.id}" could not be loaded after creation.`);
  return skill;
}

export async function updateSkill(
  id: string,
  updates: Partial<SkillInput>,
  scope: SkillScope,
  projectDir?: string,
): Promise<Skill> {
  const lookupDir = scope === "project" ? resolveProjectDir(projectDir) : undefined;
  const base = await loadSkill(id, lookupDir);
  const filePath =
    findScopedSkillFilePath(id, scope, lookupDir) ?? getSkillFilePath(id, scope, lookupDir ?? projectDir);

  const merged: SkillInput = {
    id,
    frontmatter: {
      ...(base?.frontmatter ?? {}),
      ...(updates.frontmatter ?? {}),
      name: updates.frontmatter?.name ?? base?.frontmatter.name ?? id,
      description: updates.frontmatter?.description ?? base?.frontmatter.description ?? "",
      model: updates.frontmatter?.model ?? base?.frontmatter.model ?? "",
    },
    systemPrompt: updates.systemPrompt ?? base?.systemPrompt ?? "",
  };

  const validation = validateSkillInput(merged);
  if (!validation.valid) throw new Error(`Invalid skill input: ${toValidationMessage(validation)}`);

  await writeSkillFile(filePath, merged);
  const skill = await loadSkill(id, projectDir);
  if (!skill) throw new Error(`Skill "${id}" could not be loaded after update.`);
  return skill;
}

export async function deleteSkill(id: string, scope: SkillScope, projectDir?: string): Promise<boolean> {
  const lookupDir = scope === "project" ? resolveProjectDir(projectDir) : projectDir;
  const filePath = findScopedSkillFilePath(id, scope, lookupDir);
  if (!filePath) return false;
  await rm(dirname(filePath), { recursive: true, force: true });
  return true;
}

export async function duplicateSkill(
  sourceId: string,
  newId: string,
  scope: SkillScope,
  projectDir?: string,
): Promise<Skill> {
  const source = await loadSkill(sourceId, projectDir);
  if (!source) throw new Error(`Source skill "${sourceId}" not found.`);

  const input: SkillInput = {
    id: newId,
    frontmatter: {
      ...source.frontmatter,
      name: newId,
    },
    systemPrompt: source.systemPrompt,
  };

  return await createSkill(input, scope, projectDir);
}

export async function listSkillOverrides(projectDir?: string): Promise<Skill[]> {
  const map = await loadSkillOverrides(projectDir);
  return Array.from(map.values());
}

```

---

## File: skills/events.ts

```typescript
import { EventEmitter } from "node:events";
import type { Skill, SkillScope } from "../types";

export type SkillEvent =
  | { type: "skill.created"; skill: Skill }
  | { type: "skill.updated"; skill: Skill }
  | { type: "skill.deleted"; id: string; scope: SkillScope };

export type SkillsEvents = {
  emit: (event: SkillEvent) => void;
  on: (listener: (event: SkillEvent) => void) => () => void;
};

export function createSkillsEvents(): SkillsEvents {
  const emitter = new EventEmitter();

  return {
    emit: (event) => {
      emitter.emit("event", event);
    },
    on: (listener) => {
      emitter.on("event", listener);
      return () => emitter.off("event", listener);
    },
  };
}

```

---

## File: skills/index.ts

```typescript
export * from "./builtin";
export * from "./convert";
export * from "./crud";
export * from "./events";
export * from "./loader";
export * from "./parse";
export * from "./paths";
export * from "./service";
export * from "./validate";

```

---

## File: skills/loader.ts

```typescript
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Skill, SkillSource } from "../types";
import { parseSkillFile } from "./parse";
import {
  getGlobalSkillsDir,
  getGlobalSubagentsDir,
  getProjectSkillsDirs,
  getProjectSubagentsDirs,
  resolveProjectDir,
} from "./paths";
import { validateSkillFrontmatter } from "./validate";

type SkillLocation = {
  id: string;
  filePath: string;
  source: SkillSource;
};

type SkillRoot = {
  root: string;
  source: SkillSource;
};

function getSkillRoots(projectDir?: string): SkillRoot[] {
  const roots: SkillRoot[] = [];
  const globalSkills = getGlobalSkillsDir();
  const globalSubagents = getGlobalSubagentsDir();
  const resolvedDir = resolveProjectDir(projectDir);

  if (resolvedDir) {
    const projectSkills = getProjectSkillsDirs(resolvedDir);
    const projectSubagents = getProjectSubagentsDirs(resolvedDir);
    for (const root of projectSkills) {
      roots.push({ root, source: { type: "project", path: root } });
    }
    for (const root of projectSubagents) {
      roots.push({ root, source: { type: "project", path: root } });
    }
  }

  roots.push({ root: globalSkills, source: { type: "global", path: globalSkills } });
  roots.push({ root: globalSubagents, source: { type: "global", path: globalSubagents } });

  return roots;
}

async function detectSkillDirs(root: string, source: SkillSource): Promise<SkillLocation[]> {
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const locations: SkillLocation[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const filePath = join(root, entry.name, "SKILL.md");
    if (!existsSync(filePath)) continue;
    locations.push({ id: entry.name, filePath, source });
  }
  return locations;
}

async function loadSkillFile(location: SkillLocation): Promise<Skill> {
  const raw = await readFile(location.filePath, "utf8");
  const parsed = parseSkillFile(raw);
  const frontmatter = {
    ...(parsed.frontmatter as Record<string, unknown>),
    name: (parsed.frontmatter as Record<string, unknown>).name ?? location.id,
  } as Skill["frontmatter"];

  if (frontmatter.name !== location.id) {
    throw new Error(`Skill name "${frontmatter.name}" must match directory "${location.id}".`);
  }

  const validation = validateSkillFrontmatter(frontmatter);
  if (!validation.valid) {
    const details = validation.errors.map((err) => `${err.field}: ${err.message}`).join("; ");
    throw new Error(`Invalid skill "${location.id}": ${details}`);
  }

  const info = await stat(location.filePath);
  const root = dirname(location.filePath);

  return {
    id: location.id,
    source: location.source,
    frontmatter,
    systemPrompt: parsed.body,
    filePath: location.filePath,
    hasScripts: existsSync(join(root, "scripts")),
    hasReferences: existsSync(join(root, "references")),
    hasAssets: existsSync(join(root, "assets")),
    createdAt: info.birthtime,
    updatedAt: info.mtime,
  };
}

export async function loadSkill(id: string, projectDir?: string): Promise<Skill | undefined> {
  const roots = getSkillRoots(projectDir).slice().reverse();
  for (const root of roots) {
    const filePath = join(root.root, id, "SKILL.md");
    if (existsSync(filePath)) {
      return await loadSkillFile({ id, filePath, source: root.source });
    }
  }

  const { loadBuiltinSkills } = await import("./builtin");
  const builtins = loadBuiltinSkills();
  return builtins.get(id);
}

export async function loadSkillOverrides(projectDir?: string): Promise<Map<string, Skill>> {
  const skills = new Map<string, Skill>();
  const roots = getSkillRoots(projectDir);
  for (const root of roots) {
    const entries = await detectSkillDirs(root.root, root.source);
    for (const location of entries) {
      try {
        skills.set(location.id, await loadSkillFile(location));
      } catch {
        // Ignore invalid skills in listing.
      }
    }
  }

  return skills;
}

export async function loadAllSkills(projectDir?: string): Promise<Map<string, Skill>> {
  const { loadBuiltinSkills } = await import("./builtin");
  const skills = loadBuiltinSkills();
  const overrides = await loadSkillOverrides(projectDir);

  for (const [id, skill] of overrides) {
    skills.set(id, skill);
  }

  return skills;
}

```

---

## File: skills/parse.ts

```typescript
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export type ParsedSkillFile = {
  frontmatter: Record<string, unknown>;
  body: string;
};

export function parseSkillFile(contents: string): ParsedSkillFile {
  const normalized = contents.replace(/^\uFEFF/, "");
  const lines = normalized.split(/\r?\n/);
  if (lines.length === 0 || lines[0].trim() !== "---") {
    throw new Error("Skill file must start with YAML frontmatter (---).");
  }

  let endIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    throw new Error("Skill frontmatter must be closed with ---.");
  }

  const yamlText = lines.slice(1, endIndex).join("\n");
  const parsed = parseYaml(yamlText);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Skill frontmatter must be a YAML object.");
  }

  const body = lines
    .slice(endIndex + 1)
    .join("\n")
    .trim();

  return {
    frontmatter: parsed as Record<string, unknown>,
    body,
  };
}

export function serializeSkillFile(frontmatter: Record<string, unknown>, body: string): string {
  const yaml = stringifyYaml(frontmatter).trimEnd();
  const trimmedBody = body.trim();
  return `---\n${yaml}\n---\n\n${trimmedBody}\n`;
}

```

---

## File: skills/paths.ts

```typescript
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SkillScope } from "../types";

// Skills are stored in .opencode/skill/
// Subagents are stored in .opencode/agent/subagents/
// Both are treated as skill sources.
const SKILL_DIR_PATH = ["skill"];
const SUBAGENT_DIR_PATH = ["agent", "subagents"];
const ORCHESTRA_DIR = "orchestra";
const SKILL_DIR_MARKERS = [
  [".opencode", ...SKILL_DIR_PATH],
  [".opencode", ...SUBAGENT_DIR_PATH],
  [ORCHESTRA_DIR, ".opencode", ...SKILL_DIR_PATH],
  [ORCHESTRA_DIR, ".opencode", ...SUBAGENT_DIR_PATH],
];

const MODULE_ROOT = (() => {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return dirname(dirname(moduleDir));
})();

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    if (seen.has(path)) continue;
    seen.add(path);
    result.push(path);
  }
  return result;
}

export function hasProjectSkillDirs(projectDir: string): boolean {
  return SKILL_DIR_MARKERS.some((parts) => existsSync(join(projectDir, ...parts)));
}

export function inferProjectDir(startDir: string = process.cwd()): string | undefined {
  let current = startDir;
  while (true) {
    if (hasProjectSkillDirs(current)) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function resolveProjectDir(projectDir?: string): string | undefined {
  const explicitDir =
    projectDir ?? process.env.OPENCODE_PROJECT_DIR ?? process.env.OPENCODE_WORKDIR ?? process.env.OPENCODE_WORKTREE;
  if (explicitDir) {
    if (hasProjectSkillDirs(explicitDir)) return explicitDir;
    return inferProjectDir(explicitDir) ?? explicitDir;
  }
  if (hasProjectSkillDirs(MODULE_ROOT)) return MODULE_ROOT;
  const inferred = inferProjectDir();
  return inferred;
}

export function getProjectSkillsDir(projectDir: string): string {
  const candidates = getProjectSkillsDirs(projectDir);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

export function getGlobalSkillsDir(): string {
  const home = process.env.OPENCODE_SKILLS_HOME ?? homedir();
  return join(home, ".opencode", ...SKILL_DIR_PATH);
}

export function getProjectSkillsDirs(projectDir: string): string[] {
  return uniquePaths([
    join(projectDir, ".opencode", ...SKILL_DIR_PATH),
    join(projectDir, ORCHESTRA_DIR, ".opencode", ...SKILL_DIR_PATH),
  ]);
}

export function getProjectSubagentsDir(projectDir: string): string {
  const candidates = getProjectSubagentsDirs(projectDir);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

export function getGlobalSubagentsDir(): string {
  const home = process.env.OPENCODE_SKILLS_HOME ?? homedir();
  return join(home, ".opencode", ...SUBAGENT_DIR_PATH);
}

export function getProjectSubagentsDirs(projectDir: string): string[] {
  return uniquePaths([
    join(projectDir, ".opencode", ...SUBAGENT_DIR_PATH),
    join(projectDir, ORCHESTRA_DIR, ".opencode", ...SUBAGENT_DIR_PATH),
  ]);
}

export function getSkillDir(id: string, scope: SkillScope, projectDir?: string): string {
  if (scope === "global") return join(getGlobalSkillsDir(), id);
  if (!projectDir) throw new Error("Project directory is required for project-scoped skills.");
  return join(getProjectSkillsDir(projectDir), id);
}

export function getSubagentDir(id: string, scope: SkillScope, projectDir?: string): string {
  if (scope === "global") return join(getGlobalSubagentsDir(), id);
  if (!projectDir) throw new Error("Project directory is required for project-scoped skills.");
  return join(getProjectSubagentsDir(projectDir), id);
}

export function getSkillFilePath(id: string, scope: SkillScope, projectDir?: string): string {
  return join(getSkillDir(id, scope, projectDir), "SKILL.md");
}

export function getSubagentFilePath(id: string, scope: SkillScope, projectDir?: string): string {
  return join(getSubagentDir(id, scope, projectDir), "SKILL.md");
}

```

---

## File: skills/service.ts

```typescript
import type { Skill, SkillInput, SkillScope } from "../types";
import { createSkill, deleteSkill, duplicateSkill, updateSkill } from "./crud";
import { createSkillsEvents, type SkillsEvents } from "./events";
import { loadAllSkills, loadSkill } from "./loader";
import { resolveProjectDir } from "./paths";

export interface SkillsService {
  events: SkillsEvents;
  list(projectDir?: string): Promise<Skill[]>;
  get(id: string, projectDir?: string): Promise<Skill | undefined>;
  create(input: SkillInput, scope: SkillScope, projectDir?: string): Promise<Skill>;
  update(id: string, updates: Partial<SkillInput>, scope: SkillScope, projectDir?: string): Promise<Skill>;
  delete(id: string, scope: SkillScope, projectDir?: string): Promise<boolean>;
  duplicate(sourceId: string, newId: string, scope: SkillScope, projectDir?: string): Promise<Skill>;
}

export function createSkillsService(projectDir?: string): SkillsService {
  const events = createSkillsEvents();
  const resolvedDir = resolveProjectDir(projectDir);

  return {
    events,
    async list() {
      const skills = await loadAllSkills(resolvedDir);
      return Array.from(skills.values());
    },

    async get(id) {
      return loadSkill(id, resolvedDir);
    },

    async create(input, scope) {
      const skill = await createSkill(input, scope, resolvedDir);
      events.emit({ type: "skill.created", skill });
      return skill;
    },

    async update(id, updates, scope) {
      const skill = await updateSkill(id, updates, scope, resolvedDir);
      events.emit({ type: "skill.updated", skill });
      return skill;
    },

    async delete(id, scope) {
      const ok = await deleteSkill(id, scope, resolvedDir);
      if (ok) events.emit({ type: "skill.deleted", id, scope });
      return ok;
    },

    async duplicate(sourceId, newId, scope) {
      const skill = await duplicateSkill(sourceId, newId, scope, resolvedDir);
      events.emit({ type: "skill.created", skill });
      return skill;
    },
  };
}

```

---

## File: skills/validate.ts

```typescript
import type {
  SkillFrontmatter,
  SkillInput,
  SkillValidationError,
  SkillValidationResult,
  ToolPermissions,
} from "../types";

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  if (!isPlainObject(value)) return false;
  return Object.values(value).every((v) => typeof v === "boolean");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function validatePermissions(permissions: unknown, errors: SkillValidationError[]): ToolPermissions | undefined {
  if (!permissions) return undefined;
  if (!isPlainObject(permissions)) {
    errors.push({ field: "permissions", message: "Permissions must be an object." });
    return undefined;
  }

  const out: ToolPermissions = {};

  if (isPlainObject(permissions.categories)) {
    out.categories = {};
    const categories = permissions.categories as Record<string, unknown>;
    if (categories.filesystem === "full" || categories.filesystem === "read" || categories.filesystem === "none") {
      out.categories.filesystem = categories.filesystem;
    } else if (categories.filesystem !== undefined) {
      errors.push({ field: "permissions.categories.filesystem", message: "Invalid filesystem category." });
    }
    if (categories.execution === "full" || categories.execution === "sandboxed" || categories.execution === "none") {
      out.categories.execution = categories.execution;
    } else if (categories.execution !== undefined) {
      errors.push({ field: "permissions.categories.execution", message: "Invalid execution category." });
    }
    if (categories.network === "full" || categories.network === "localhost" || categories.network === "none") {
      out.categories.network = categories.network;
    } else if (categories.network !== undefined) {
      errors.push({ field: "permissions.categories.network", message: "Invalid network category." });
    }
  } else if (permissions.categories !== undefined) {
    errors.push({ field: "permissions.categories", message: "Permissions categories must be an object." });
  }

  if (isPlainObject(permissions.tools)) {
    out.tools = {};
    for (const [toolId, cfg] of Object.entries(permissions.tools as Record<string, unknown>)) {
      if (!isPlainObject(cfg) || typeof cfg.enabled !== "boolean") {
        errors.push({ field: `permissions.tools.${toolId}`, message: "Tool permission must include enabled boolean." });
        continue;
      }
      out.tools[toolId] = {
        enabled: cfg.enabled,
        constraints: isPlainObject(cfg.constraints) ? (cfg.constraints as Record<string, unknown>) : undefined,
      };
    }
  } else if (permissions.tools !== undefined) {
    errors.push({ field: "permissions.tools", message: "Permissions tools must be an object." });
  }

  if (isPlainObject(permissions.paths)) {
    const paths = permissions.paths as Record<string, unknown>;
    const allowed = paths.allowed;
    const denied = paths.denied;
    if ((allowed !== undefined && !isStringArray(allowed)) || (denied !== undefined && !isStringArray(denied))) {
      errors.push({ field: "permissions.paths", message: "Permissions paths must be string arrays." });
    } else if (allowed || denied) {
      out.paths = { allowed: allowed as string[] | undefined, denied: denied as string[] | undefined };
    }
  } else if (permissions.paths !== undefined) {
    errors.push({ field: "permissions.paths", message: "Permissions paths must be an object." });
  }

  return out;
}

export function validateSkillFrontmatter(frontmatter: SkillFrontmatter): SkillValidationResult {
  const errors: SkillValidationError[] = [];

  if (!frontmatter.name || typeof frontmatter.name !== "string") {
    errors.push({ field: "name", message: "Name is required." });
  } else {
    if (!NAME_PATTERN.test(frontmatter.name)) {
      errors.push({ field: "name", message: "Name must be lowercase alphanumeric with single hyphens." });
    }
    if (frontmatter.name.length < 1 || frontmatter.name.length > 64) {
      errors.push({ field: "name", message: "Name must be 1-64 characters." });
    }
  }

  if (!frontmatter.description || typeof frontmatter.description !== "string") {
    errors.push({ field: "description", message: "Description is required." });
  } else if (frontmatter.description.length < 1 || frontmatter.description.length > 1024) {
    errors.push({ field: "description", message: "Description must be 1-1024 characters." });
  }

  if (!frontmatter.model || typeof frontmatter.model !== "string") {
    errors.push({ field: "model", message: "Model is required." });
  }

  if (frontmatter.temperature !== undefined) {
    if (typeof frontmatter.temperature !== "number" || frontmatter.temperature < 0 || frontmatter.temperature > 2) {
      errors.push({ field: "temperature", message: "Temperature must be a number between 0 and 2." });
    }
  }

  if (frontmatter.tools !== undefined && !isBooleanRecord(frontmatter.tools)) {
    errors.push({ field: "tools", message: "Tools must be a record of booleans." });
  }

  if (frontmatter.tags !== undefined && !isStringArray(frontmatter.tags)) {
    errors.push({ field: "tags", message: "Tags must be an array of strings." });
  }

  if (frontmatter.supportsVision !== undefined && typeof frontmatter.supportsVision !== "boolean") {
    errors.push({ field: "supportsVision", message: "supportsVision must be boolean." });
  }

  if (frontmatter.supportsWeb !== undefined && typeof frontmatter.supportsWeb !== "boolean") {
    errors.push({ field: "supportsWeb", message: "supportsWeb must be boolean." });
  }

  if (frontmatter.injectRepoContext !== undefined && typeof frontmatter.injectRepoContext !== "boolean") {
    errors.push({ field: "injectRepoContext", message: "injectRepoContext must be boolean." });
  }

  if (frontmatter.extends !== undefined && typeof frontmatter.extends !== "string") {
    errors.push({ field: "extends", message: "extends must be a string." });
  }

  if (frontmatter.compose !== undefined && !isStringArray(frontmatter.compose)) {
    errors.push({ field: "compose", message: "compose must be an array of strings." });
  }

  validatePermissions(frontmatter.permissions, errors);

  return { valid: errors.length === 0, errors };
}

export function validateSkillInput(input: SkillInput): SkillValidationResult {
  const errors: SkillValidationError[] = [];

  if (!input.id || typeof input.id !== "string") {
    errors.push({ field: "id", message: "ID is required." });
  } else {
    if (!NAME_PATTERN.test(input.id)) {
      errors.push({ field: "id", message: "ID must be lowercase alphanumeric with single hyphens." });
    }
    if (input.id.length < 1 || input.id.length > 64) {
      errors.push({ field: "id", message: "ID must be 1-64 characters." });
    }
  }

  if (typeof input.systemPrompt !== "string") {
    errors.push({ field: "systemPrompt", message: "System prompt must be a string." });
  }

  const frontmatter = {
    ...input.frontmatter,
    name: input.frontmatter.name ?? input.id,
  } as SkillFrontmatter;

  const frontmatterResult = validateSkillFrontmatter(frontmatter);
  errors.push(...frontmatterResult.errors);

  return { valid: errors.length === 0, errors };
}

```

---

## File: tools/hooks.ts

```typescript
import { canSpawnManually, canSpawnOnDemand } from "../core/spawn-policy";
import { buildOrchestratorSystemPrompt } from "../prompts/orchestrator-system";
import type { OrchestratorConfig } from "../types";
import type { WorkerManager } from "../workers";

export function createToolGuard(config: OrchestratorConfig) {
  type ToolArgs = Record<string, unknown>;
  const readString = (value: unknown): string =>
    typeof value === "string" ? value : value == null ? "" : String(value);

  // Get orchestrator agent name for permission checks
  const orchestratorName = config.agent?.name ?? "orchestrator";

  return async (input: { tool: string; agent?: string }, output: { args?: ToolArgs }) => {
    const args = output.args ?? {};
    const agentId = input.agent ?? orchestratorName;

    // spawn_worker is only available to the orchestrator agent
    if (input.tool === "spawn_worker") {
      if (agentId !== orchestratorName) {
        throw new Error(`Tool "spawn_worker" is only available to the orchestrator. Use "ask_worker" or "delegate_task" instead.`);
      }
      const profileId = readString(args.profileId);
      if (profileId && !canSpawnManually(config.spawnPolicy, profileId))
        throw new Error(`Spawning worker "${profileId}" is disabled by spawnPolicy.`);
    }

    // Prevent workers from spawning themselves via delegation
    if (input.tool === "delegate_task" || input.tool === "ask_worker" || input.tool === "ask_worker_async") {
      const workerId = readString(args.workerId);

      // Prevent self-spawning (worker trying to spawn itself)
      if (workerId && workerId === agentId) {
        throw new Error(`Worker "${agentId}" cannot delegate to itself. Choose a different worker.`);
      }

      const autoSpawn = args.autoSpawn !== false;
      if (autoSpawn && workerId && !canSpawnOnDemand(config.spawnPolicy, workerId))
        throw new Error(`On-demand spawn for worker "${workerId}" is disabled by spawnPolicy.`);
    }

    // run_workflow is only available to the orchestrator agent
    if (input.tool === "run_workflow") {
      if (agentId !== orchestratorName) {
        throw new Error(`Tool "run_workflow" is only available to the orchestrator.`);
      }
    }
  };
}

export function createSystemTransform(config: OrchestratorConfig, workers: WorkerManager) {
  return async (_input: Record<string, never>, output: { system: string[] }) => {
    if (config.ui?.injectSystemContext === false) return;

    // Build comprehensive orchestrator system prompt
    const runningWorkers = workers.listWorkers().map((w) => ({
      id: w.profile.id,
      name: w.profile.name,
      status: w.status,
    }));

    const orchestratorPrompt = buildOrchestratorSystemPrompt({
      config,
      profiles: workers.listProfiles(),
      runningWorkers,
      memoryEnabled: config.memory?.enabled !== false,
    });

    output.system.push(orchestratorPrompt);

    // Inject pending vision jobs so orchestrator knows to await them
    const pendingJobs = workers.jobs.list().filter((j) => j.status === "running" && j.workerId === "vision");
    if (pendingJobs.length > 0) {
      output.system.push(
        `
<pending-vision-analysis>
IMPORTANT: Vision analysis is in progress for ${pendingJobs.length} image(s).
You MUST call await_worker_job to get the results before responding about the image content:
${pendingJobs.map((j) => `- await_worker_job({ jobId: "${j.id}" })`).join("\n")}
</pending-vision-analysis>
      `.trim(),
      );
    }
  };
}

export function createCompactionTransform(config: OrchestratorConfig, workers: WorkerManager) {
  return async (_input: { sessionID: string }, output: { context: string[]; prompt?: string }) => {
    if (config.ui?.injectSystemContext === false) return;
    output.context.push(workers.getSummary({ maxWorkers: config.ui?.systemContextMaxWorkers }));
  };
}

```

---

## File: tools/index.ts

```typescript
import type { ToolDefinition } from "@opencode-ai/plugin";
import { getIntegrationTools } from "../integrations/registry";
import type { OrchestratorService } from "../orchestrator";
import type { Factory, OrchestratorConfig, ServiceLifecycle } from "../types";
import type { WorkerManager } from "../workers";
import type { WorkflowEngine } from "../workflows/factory";
import { createCompactionTransform, createSystemTransform, createToolGuard } from "./hooks";
import { createWorkerTools } from "./worker-tools";
import { createWorkflowTools } from "./workflow-tools";

export type ToolsConfig = OrchestratorConfig;

export type ToolsDeps = {
  orchestrator: OrchestratorService;
  workers: WorkerManager;
  workflows?: WorkflowEngine;
};

export type ToolsService = ServiceLifecycle & {
  /** All orchestrator tools (full access) */
  tool: Record<string, ToolDefinition>;
  /** Worker tools (limited, no orchestration) */
  workerTool: Record<string, ToolDefinition>;
  /** Agent tools (workers with skillPermissions: "inherit" can delegate to other workers) */
  agentTool: Record<string, ToolDefinition>;
  guard: ReturnType<typeof createToolGuard>;
  systemTransform: ReturnType<typeof createSystemTransform>;
  compaction: ReturnType<typeof createCompactionTransform>;
};

export const createTools: Factory<ToolsConfig, ToolsDeps, ToolsService> = ({ config, deps }) => {
  const workerTools = createWorkerTools({ orchestrator: deps.orchestrator, workers: deps.workers });
  const workflowTools = createWorkflowTools({ orchestrator: deps.orchestrator, workflows: deps.workflows });
  const integrationTools = getIntegrationTools(config.integrations);

  // Orchestrator gets all tools (including Linear write tools)
  const tool = {
    ...workerTools,
    ...workflowTools,
    ...integrationTools.orchestrator,
  };

  // Workers get limited tools (Linear read only)
  const workerTool = {
    ...integrationTools.workers,
  };

  // Agent tools - for workers with skillPermissions: "inherit"
  // These can delegate to other workers but don't have full orchestrator access
  const agentTool = {
    ask_worker: workerTools.ask_worker,
    ask_worker_async: workerTools.ask_worker_async,
    await_worker_job: workerTools.await_worker_job,
    delegate_task: workerTools.delegate_task,
    list_workers: workerTools.list_workers,
    list_profiles: workerTools.list_profiles,
    ...integrationTools.workers,
  };

  return {
    tool,
    workerTool,
    agentTool,
    guard: createToolGuard(config),
    systemTransform: createSystemTransform(config, deps.workers),
    compaction: createCompactionTransform(config, deps.workers),
    start: async () => {},
    stop: async () => {},
    health: async () => ({ ok: true }),
  };
};

```

---

## File: tools/linear-tools.ts

```typescript
import { tool } from "@opencode-ai/plugin";
import {
  addComment,
  addLabel,
  createIssue,
  getIssue,
  type LinearConfig,
  resolveLinearConfig,
  setEstimate,
  syncTaskStatus,
  updateIssue,
} from "../integrations/linear";
import type { LinearIntegrationConfig } from "../types";

type ToolDefinition = ReturnType<typeof tool>;

function serialize(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export type LinearToolsDeps = {
  config?: LinearIntegrationConfig;
  api?: {
    resolveConfig?: typeof resolveLinearConfig;
    createIssue?: typeof createIssue;
    updateIssue?: typeof updateIssue;
    addComment?: typeof addComment;
    addLabel?: typeof addLabel;
    setEstimate?: typeof setEstimate;
    syncTaskStatus?: typeof syncTaskStatus;
    getIssue?: typeof getIssue;
  };
};

/** Create Linear tools for orchestrator (write) and workers (read). */
export function createLinearTools(deps: LinearToolsDeps): {
  orchestrator: Record<string, ToolDefinition>;
  workers: Record<string, ToolDefinition>;
} {
  const api = deps.api ?? {};
  let cfg: LinearConfig | undefined;
  const getConfig = (): LinearConfig => {
    if (!cfg) cfg = (api.resolveConfig ?? resolveLinearConfig)(deps.config);
    return cfg;
  };

  // === WRITE TOOLS (orchestrator only) ===

  const linearCreateIssue = tool({
    description: "Create a new issue in Linear",
    args: {
      title: tool.schema.string().describe("Issue title"),
      description: tool.schema.string().optional().describe("Issue description (markdown)"),
      priority: tool.schema.number().optional().describe("Priority (0=none, 1=urgent, 2=high, 3=medium, 4=low)"),
      estimate: tool.schema.number().optional().describe("Estimate points"),
    },
    async execute(args) {
      const issue = await (api.createIssue ?? createIssue)({
        cfg: getConfig(),
        title: args.title,
        description: args.description,
        priority: args.priority,
        estimate: args.estimate,
      });
      return serialize({
        id: issue.issueId,
        identifier: issue.identifier,
        title: args.title,
        url: issue.url,
      });
    },
  });

  const linearUpdateIssue = tool({
    description: "Update an existing Linear issue",
    args: {
      issueId: tool.schema.string().describe("Issue ID"),
      title: tool.schema.string().optional().describe("New title"),
      description: tool.schema.string().optional().describe("New description"),
      priority: tool.schema.number().optional().describe("New priority"),
    },
    async execute(args) {
      const issue = await (api.updateIssue ?? updateIssue)({
        cfg: getConfig(),
        issueId: args.issueId,
        title: args.title,
        description: args.description,
        priority: args.priority,
      });
      return serialize({ id: issue.issueId, title: issue.title ?? args.title, url: issue.url });
    },
  });

  const linearAddComment = tool({
    description: "Add a comment to a Linear issue",
    args: {
      issueId: tool.schema.string().describe("Issue ID"),
      body: tool.schema.string().describe("Comment body (markdown)"),
    },
    async execute(args) {
      const comment = await (api.addComment ?? addComment)({
        cfg: getConfig(),
        issueId: args.issueId,
        body: args.body,
      });
      return serialize({ id: comment.commentId, issueId: args.issueId, url: comment.url });
    },
  });

  const linearAddLabel = tool({
    description: "Add a label to a Linear issue",
    args: {
      issueId: tool.schema.string().describe("Issue ID"),
      labelId: tool.schema.string().describe("Label ID to add"),
    },
    async execute(args) {
      const issue = await (api.addLabel ?? addLabel)({
        cfg: getConfig(),
        issueId: args.issueId,
        labelId: args.labelId,
      });
      return serialize({ id: issue.issueId, labelIds: issue.labelIds });
    },
  });

  const linearSetEstimate = tool({
    description: "Set estimate points on a Linear issue",
    args: {
      issueId: tool.schema.string().describe("Issue ID"),
      estimate: tool.schema.number().describe("Estimate points"),
    },
    async execute(args) {
      const issue = await (api.setEstimate ?? setEstimate)({
        cfg: getConfig(),
        issueId: args.issueId,
        estimate: args.estimate,
      });
      return serialize({ id: issue.issueId, estimate: issue.estimate });
    },
  });

  const linearSyncStatus = tool({
    description: "Sync a task status to Linear (maps status labels to workflow states)",
    args: {
      issueId: tool.schema.string().describe("Issue ID"),
      status: tool.schema
        .string()
        .describe("Status label (e.g., 'todo', 'in_progress', 'in-progress', 'done', 'canceled')"),
    },
    async execute(args) {
      const issue = await (api.syncTaskStatus ?? syncTaskStatus)({
        cfg: getConfig(),
        issueId: args.issueId,
        status: args.status,
      });
      return serialize({ id: issue.issueId, stateId: issue.stateId, status: args.status });
    },
  });

  // === READ/UPDATE TOOLS (available to all workers) ===

  const linearGetConfig = tool({
    description: "Check if Linear is configured and get team info",
    args: {},
    async execute() {
      try {
        const config = getConfig();
        return serialize({ configured: true, teamId: config.teamId, apiUrl: config.apiUrl });
      } catch {
        return serialize({ configured: false, error: "Linear not configured" });
      }
    },
  });

  const linearGetIssue = tool({
    description: "Get details of a Linear issue by ID",
    args: {
      issueId: tool.schema.string().describe("Issue ID or identifier (e.g., 'ABC-123')"),
    },
    async execute(args) {
      const issue = await (api.getIssue ?? getIssue)({ cfg: getConfig(), issueId: args.issueId });
      return serialize(issue);
    },
  });

  // Shared tools that workers can also use
  const sharedTools = {
    linear_get_config: linearGetConfig,
    linear_get_issue: linearGetIssue,
    linear_update_issue: linearUpdateIssue,
    linear_add_comment: linearAddComment,
    linear_add_label: linearAddLabel,
    linear_set_estimate: linearSetEstimate,
    linear_sync_status: linearSyncStatus,
  };

  return {
    // Orchestrator gets create (+ all shared tools)
    orchestrator: {
      linear_create_issue: linearCreateIssue,
      ...sharedTools,
    },
    // Workers get read + update tools (no create/delete)
    workers: sharedTools,
  };
}

```

---

## File: tools/worker-tools.ts

```typescript
import { tool } from "@opencode-ai/plugin";
import type { OrchestratorService } from "../orchestrator";
import type { WorkerManager } from "../workers";
import type { WorkerAttachment } from "../workers/prompt";

export type WorkerToolsDeps = {
  orchestrator: OrchestratorService;
  workers: WorkerManager;
};

type ToolDefinition = ReturnType<typeof tool>;

function attachmentSchema() {
  return tool.schema.object({
    type: tool.schema.enum(["image", "file"]),
    path: tool.schema.string().optional(),
    base64: tool.schema.string().optional(),
    mimeType: tool.schema.string().optional(),
  });
}

function serialize(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function createWorkerTools(deps: WorkerToolsDeps): Record<string, ToolDefinition> {
  const spawnWorker = tool({
    description: "Spawn a worker by profile ID",
    args: {
      profileId: tool.schema.string().describe("Worker profile ID"),
    },
    async execute(args, ctx) {
      const worker = await deps.orchestrator.ensureWorker({
        workerId: args.profileId,
        reason: "manual",
        parentSessionId: ctx?.sessionID,
      });
      return serialize({
        id: worker.profile.id,
        status: worker.status,
        port: worker.port,
        model: worker.profile.model,
      });
    },
  });

  const stopWorker = tool({
    description: "Stop a running worker",
    args: {
      workerId: tool.schema.string().describe("Worker ID"),
    },
    async execute(args) {
      const ok = await deps.workers.stopWorker(args.workerId);
      return ok ? `Stopped ${args.workerId}.` : `Worker "${args.workerId}" not found.`;
    },
  });

  const listWorkers = tool({
    description: "List running workers",
    args: {},
    async execute() {
      return serialize(
        deps.workers.listWorkers().map((w) => ({
          id: w.profile.id,
          name: w.profile.name,
          model: w.profile.model,
          status: w.status,
          port: w.port,
          serverUrl: w.serverUrl,
        })),
      );
    },
  });

  const listProfiles = tool({
    description: "List available worker profiles",
    args: {},
    async execute() {
      return serialize(
        deps.workers.listProfiles().map((p) => ({
          id: p.id,
          name: p.name,
          model: p.model,
          purpose: p.purpose,
          whenToUse: p.whenToUse,
          supportsVision: Boolean(p.supportsVision),
          supportsWeb: Boolean(p.supportsWeb),
        })),
      );
    },
  });

  const askWorker = tool({
    description: "Send a message to a worker and wait for the response",
    args: {
      workerId: tool.schema.string().describe("Worker ID"),
      message: tool.schema.string().describe("Message to send"),
      attachments: tool.schema.array(attachmentSchema()).optional(),
      autoSpawn: tool.schema.boolean().optional().describe("Auto-spawn missing workers (default: true)"),
    },
    async execute(args, ctx) {
      if (args.autoSpawn !== false) {
        await deps.orchestrator.ensureWorker({
          workerId: args.workerId,
          reason: "on-demand",
          parentSessionId: ctx?.sessionID,
        });
      }
      const res = await deps.workers.send(args.workerId, args.message, {
        attachments: args.attachments as WorkerAttachment[] | undefined,
        sessionId: ctx?.sessionID,
      });
      if (!res.success) return res.error ?? "Worker request failed";
      return res.response ?? "";
    },
  });

  const askWorkerAsync = tool({
    description: "Send a message to a worker asynchronously and return a job ID",
    args: {
      workerId: tool.schema.string().describe("Worker ID"),
      message: tool.schema.string().describe("Message to send"),
      attachments: tool.schema.array(attachmentSchema()).optional(),
      autoSpawn: tool.schema.boolean().optional().describe("Auto-spawn missing workers (default: true)"),
    },
    async execute(args, ctx) {
      if (args.autoSpawn !== false) {
        await deps.orchestrator.ensureWorker({
          workerId: args.workerId,
          reason: "on-demand",
          parentSessionId: ctx?.sessionID,
        });
      }
      const job = deps.workers.jobs.create({
        workerId: args.workerId,
        message: args.message,
        sessionId: ctx?.sessionID,
        requestedBy: ctx?.agent,
      });

      void (async () => {
        const res = await deps.workers.send(args.workerId, args.message, {
          attachments: args.attachments as WorkerAttachment[] | undefined,
          jobId: job.id,
          from: ctx?.agent,
          sessionId: ctx?.sessionID,
        });
        if (!res.success) {
          deps.workers.jobs.setResult(job.id, { error: res.error ?? "worker failed" });
          return;
        }
        deps.workers.jobs.setResult(job.id, { responseText: res.response ?? "" });
      })();

      return serialize({ jobId: job.id, workerId: args.workerId });
    },
  });

  const awaitWorkerJob = tool({
    description: "Wait for an async job result",
    args: {
      jobId: tool.schema.string().describe("Job ID"),
      timeoutMs: tool.schema.number().optional().describe("Timeout in ms"),
    },
    async execute(args) {
      const job = await deps.workers.jobs.await(args.jobId, { timeoutMs: args.timeoutMs });
      return serialize(job);
    },
  });

  const delegateTask = tool({
    description: "Route a task to the best worker and return the response",
    args: {
      task: tool.schema.string().describe("Task to delegate"),
      attachments: tool.schema.array(attachmentSchema()).optional(),
      autoSpawn: tool.schema.boolean().optional().describe("Auto-spawn missing workers (default: true)"),
    },
    async execute(args, ctx) {
      const res = await deps.orchestrator.delegateTask({
        task: args.task,
        attachments: args.attachments as WorkerAttachment[] | undefined,
        autoSpawn: args.autoSpawn,
        parentSessionId: ctx?.sessionID,
      });
      return res.response;
    },
  });

  return {
    spawn_worker: spawnWorker,
    stop_worker: stopWorker,
    list_workers: listWorkers,
    list_profiles: listProfiles,
    ask_worker: askWorker,
    ask_worker_async: askWorkerAsync,
    await_worker_job: awaitWorkerJob,
    delegate_task: delegateTask,
  } as const;
}

```

---

## File: tools/workflow-tools.ts

```typescript
import { tool } from "@opencode-ai/plugin";
import type { OrchestratorService } from "../orchestrator";
import type { WorkerAttachment } from "../workers/prompt";
import type { WorkflowEngine } from "../workflows/factory";

export type WorkflowToolsDeps = {
  orchestrator: OrchestratorService;
  workflows?: WorkflowEngine;
};

type ToolDefinition = ReturnType<typeof tool>;

function serialize(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function attachmentSchema() {
  return tool.schema.object({
    type: tool.schema.enum(["image", "file"]),
    path: tool.schema.string().optional(),
    base64: tool.schema.string().optional(),
    mimeType: tool.schema.string().optional(),
  });
}

export function createWorkflowTools(deps: WorkflowToolsDeps): Record<string, ToolDefinition> {
  if (!deps.workflows) return {};

  const listWorkflows = tool({
    description: "List available workflows",
    args: {},
    async execute() {
      return serialize(deps.workflows?.list() ?? []);
    },
  });

  const runWorkflow = tool({
    description: "Run a workflow by id",
    args: {
      workflowId: tool.schema.string().describe("Workflow ID"),
      task: tool.schema.string().describe("Task to run"),
      attachments: tool.schema.array(attachmentSchema()).optional(),
      autoSpawn: tool.schema.boolean().optional(),
    },
    async execute(args) {
      const res = await deps.orchestrator.runWorkflow({
        workflowId: args.workflowId,
        task: args.task,
        attachments: args.attachments as WorkerAttachment[] | undefined,
        autoSpawn: args.autoSpawn,
      });
      return serialize(res);
    },
  });

  return {
    list_workflows: listWorkflows,
    run_workflow: runWorkflow,
  } as const;
}

```

---

## File: types/config.ts

```typescript
import type { IntegrationsConfig, TelemetryConfig } from "./integrations";
import type { MemoryConfig } from "./memory";
import type { WorkerProfile } from "./worker";
import type { SecurityConfig, WorkflowsConfig } from "./workflow";

export type SpawnPolicy = {
  /** Allow auto-spawn at orchestrator startup */
  autoSpawn?: boolean;
  /** Allow on-demand spawns (vision routing, delegate_task, etc.) */
  onDemand?: boolean;
  /** Allow manual spawns via tools */
  allowManual?: boolean;
  /** Allow warm pool pre-spawns */
  warmPool?: boolean;
  /** Deprecated: device registry reuse was removed; this flag is ignored. */
  reuseExisting?: boolean;
};

export type SpawnPolicyConfig = {
  /** Default policy applied to any profile without an override */
  default?: SpawnPolicy;
  /** Per-profile policy overrides */
  profiles?: Record<string, SpawnPolicy>;
};

export interface OrchestratorConfig {
  /** Base port to start assigning from */
  basePort: number;
  /** Available worker profiles (built-ins + overrides + custom) */
  profiles: Record<string, WorkerProfile>;
  /** Profile IDs to auto-spawn on startup */
  spawn: string[];
  /** Auto-spawn workers on plugin init */
  autoSpawn: boolean;
  /** Worker IDs allowed to auto-spawn on demand */
  spawnOnDemand?: string[];
  /** Per-profile spawn policy overrides */
  spawnPolicy?: SpawnPolicyConfig;
  /** Timeout for worker startup (ms) */
  startupTimeout: number;
  /** Health check interval (ms) */
  healthCheckInterval: number;
  /** Health check settings */
  healthCheck?: {
    enabled?: boolean;
    intervalMs?: number;
    timeoutMs?: number;
    maxRetries?: number;
  };
  /** Warm pool pre-spawn settings */
  warmPool?: {
    enabled?: boolean;
    profiles?: Record<string, { size?: number; idleTimeoutMs?: number }>;
  };
  /** Model selection preferences */
  modelSelection?: {
    mode?: "performance" | "balanced" | "economical";
    maxCostPer1kTokens?: number;
    preferredProviders?: string[];
  };
  /** Model alias table */
  modelAliases?: Record<string, string>;
  /** UX and prompt injection settings */
  ui?: {
    /** Show OpenCode toasts for orchestrator events */
    toasts?: boolean;
    /** Inject available workers into system prompt */
    injectSystemContext?: boolean;
    /** Maximum workers to include in system context */
    systemContextMaxWorkers?: number;
    /** Default tool output format */
    defaultListFormat?: "markdown" | "json";
    /** Enable debug logging for orchestrator internals */
    debug?: boolean;
    /** Allow logs to print to console (default: false) */
    logToConsole?: boolean;
    /**
     * First-run demo behavior (no config file detected):
     * - true: auto-run `orchestrator.demo` once per machine/user
     * - false: only show a toast tip
     */
    firstRunDemo?: boolean;
    /**
     * Inject a prompt into the orchestrator session when workers send wakeups.
     * This allows async workers to actually "wake up" the orchestrator instead of
     * just storing events to poll.
     * Default: true
     */
    wakeupInjection?: boolean;
  };
  /** Optional idle notifications */
  notifications?: {
    idle?: {
      enabled?: boolean;
      title?: string;
      message?: string;
      delayMs?: number;
    };
  };
  /** Inject an orchestrator agent definition into OpenCode config */
  agent?: {
    enabled?: boolean;
    name?: string;
    model?: string;
    prompt?: string;
    mode?: "primary" | "subagent";
    color?: string;
    /** If true, also override the built-in `build` agent model */
    applyToBuild?: boolean;
  };
  /** Inject command shortcuts into OpenCode config */
  commands?: {
    enabled?: boolean;
    /** Prefix for generated command names (default: "orchestrator.") */
    prefix?: string;
  };
  /** Context pruning settings (DCP-inspired) */
  pruning?: {
    enabled?: boolean;
    /** Max chars to keep for completed tool outputs */
    maxToolOutputChars?: number;
    /** Max chars to keep for tool inputs (write/edit) */
    maxToolInputChars?: number;
    /** Tools that should never be pruned */
    protectedTools?: string[];
  };
  /** Workflow configuration */
  workflows?: WorkflowsConfig;
  /** Security limits */
  security?: SecurityConfig;
  /** Memory graph settings */
  memory?: MemoryConfig;
  /** External integration settings */
  integrations?: IntegrationsConfig;
  /** Telemetry settings (PostHog) */
  telemetry?: TelemetryConfig;
}

export type OrchestratorConfigFile = {
  $schema?: string;
  basePort?: number;
  autoSpawn?: boolean;
  spawnOnDemand?: string[];
  spawnPolicy?: SpawnPolicyConfig;
  startupTimeout?: number;
  healthCheckInterval?: number;
  healthCheck?: OrchestratorConfig["healthCheck"];
  warmPool?: OrchestratorConfig["warmPool"];
  modelSelection?: OrchestratorConfig["modelSelection"];
  modelAliases?: OrchestratorConfig["modelAliases"];
  ui?: OrchestratorConfig["ui"];
  notifications?: OrchestratorConfig["notifications"];
  agent?: OrchestratorConfig["agent"];
  commands?: OrchestratorConfig["commands"];
  pruning?: OrchestratorConfig["pruning"];
  workflows?: OrchestratorConfig["workflows"];
  security?: OrchestratorConfig["security"];
  memory?: OrchestratorConfig["memory"];
  integrations?: OrchestratorConfig["integrations"];
  telemetry?: OrchestratorConfig["telemetry"];
  /** Profiles available to spawn (overrides/custom). Strings reference built-ins. */
  profiles?: Array<string | WorkerProfile>;
  /** Profiles to auto-spawn. Strings reference profiles by id. */
  workers?: Array<string | WorkerProfile>;
};

```

---

## File: types/events.ts

```typescript
import type { WorkerInstance, WorkerResponse } from "./worker";

/** Payload sent by workers to wake up the orchestrator */
export interface WakeupPayload {
  /** Worker ID that triggered the wakeup */
  workerId: string;
  /** Optional job ID if related to an async job */
  jobId?: string;
  /** Reason for the wakeup */
  reason: "result_ready" | "needs_attention" | "error" | "progress" | "custom";
  /** Optional summary or message */
  summary?: string;
  /** Optional structured data */
  data?: Record<string, unknown>;
  /** Timestamp when the wakeup was triggered */
  timestamp: number;
}

export interface OrchestratorEvents {
  "worker:spawned": { worker: WorkerInstance };
  "worker:ready": { worker: WorkerInstance };
  "worker:busy": { worker: WorkerInstance };
  "worker:error": { worker: WorkerInstance; error: string };
  "worker:dead": { worker: WorkerInstance };
  "worker:stopped": { worker: WorkerInstance };
  "worker:response": { worker: WorkerInstance; response: WorkerResponse };
  "worker:wakeup": { payload: WakeupPayload };
  "registry:updated": { registry: { workers: Map<string, WorkerInstance> } };
}

```

---

## File: types/factory.ts

```typescript
export type HealthResult = {
  ok: boolean;
  info?: unknown;
};

export type ServiceLifecycle = {
  start(): Promise<void>;
  stop(): Promise<void>;
  health(): Promise<HealthResult>;
};

export type Factory<TConfig, TDeps, TService> = (input: { config: TConfig; deps: TDeps }) => TService;

```

---

## File: types/index.ts

```typescript
export * from "./config";
export * from "./events";
export * from "./factory";
export * from "./integrations";
export * from "./memory";
export * from "./permissions";
export * from "./skill";
export * from "./worker";
export * from "./workflow";

```

---

## File: types/integrations.ts

```typescript
export type TelemetryConfig = {
  enabled?: boolean;
  /** PostHog API key (or set POSTHOG_API_KEY env var) */
  apiKey?: string;
  /** PostHog host (default: https://us.i.posthog.com) */
  host?: string;
};

export type LinearIntegrationConfig = {
  enabled?: boolean;
  apiKey?: string;
  teamId?: string;
  apiUrl?: string;
  projectPrefix?: string;
};

export type Neo4jIntegrationConfig = {
  enabled?: boolean;
  uri?: string;
  username?: string;
  password?: string;
  database?: string;
  /** Auto-start Neo4j Docker container if not running (default: true) */
  autoStart?: boolean;
  /** Docker image to use (default: neo4j:community) */
  image?: string;
};

export type MonitoringIntegrationConfig = {
  enabled?: boolean;
  port?: number;
  metricsPath?: string;
};

export type IntegrationsConfig = {
  linear?: LinearIntegrationConfig;
  neo4j?: Neo4jIntegrationConfig;
  monitoring?: MonitoringIntegrationConfig;
  [key: string]: unknown;
};

```

---

## File: types/memory.ts

```typescript
export type MemoryConfig = {
  enabled?: boolean;
  autoSpawn?: boolean;
  autoRecord?: boolean;
  /** Inject memory into the system prompt for each message */
  autoInject?: boolean;
  scope?: "project" | "global";
  /** Max characters stored per raw message snippet */
  maxChars?: number;
  /** Rolling summaries (session/project) */
  summaries?: {
    enabled?: boolean;
    sessionMaxChars?: number;
    projectMaxChars?: number;
  };
  /** Automatic trimming of stored message nodes */
  trim?: {
    maxMessagesPerSession?: number;
    maxMessagesPerProject?: number;
    maxMessagesGlobal?: number;
    maxProjectsGlobal?: number;
  };
  /** Memory injection limits */
  inject?: {
    maxChars?: number;
    maxEntries?: number;
    includeMessages?: boolean;
    includeSessionSummary?: boolean;
    includeProjectSummary?: boolean;
    includeGlobal?: boolean;
    maxGlobalEntries?: number;
  };
};

```

---

## File: types/permissions.ts

```typescript
export type ToolPermissions = {
  categories?: {
    filesystem?: "full" | "read" | "none";
    execution?: "full" | "sandboxed" | "none";
    network?: "full" | "localhost" | "none";
  };
  tools?: {
    [toolName: string]: {
      enabled: boolean;
      constraints?: Record<string, unknown>;
    };
  };
  paths?: {
    allowed?: string[];
    denied?: string[];
  };
};

/**
 * Skill permission value for OpenCode's permission.skill config.
 * - "allow": Skill loads immediately
 * - "deny": Skill hidden from agent, access rejected
 * - "ask": User prompted for approval before loading
 */
export type SkillPermissionValue = "allow" | "deny" | "ask";

/**
 * Skill permissions map using glob patterns.
 * Supports wildcards like "internal-*" to match multiple skills.
 *
 * @example
 * {
 *   "memory": "allow",      // Allow memory skill
 *   "coder": "deny",        // Deny coder skill
 *   "*": "deny"             // Deny all others by default
 * }
 */
export type SkillPermissions = Record<string, SkillPermissionValue>;

```

---

## File: types/skill.ts

```typescript
/**
 * Skill type definitions following the Agent Skills Standard
 * with OpenCode extensions for profile configuration.
 *
 * @see https://agentskills.io
 * @see https://opencode.ai/docs/skills/
 */

import type { SkillPermissions, ToolPermissions } from "./permissions";
import type { WorkerForwardEvent, WorkerMcpConfig, WorkerSessionMode } from "./worker";

// ============================================================================
// Standard Agent Skills Frontmatter (per specification)
// ============================================================================

/**
 * Standard Agent Skills frontmatter fields.
 * These fields are defined by the Agent Skills specification.
 */
export interface SkillFrontmatterBase {
  /**
   * Unique identifier for the skill.
   * Must be lowercase alphanumeric with single hyphens.
   * Pattern: ^[a-z0-9]+(-[a-z0-9]+)*$
   * Length: 1-64 characters
   * Must match the containing directory name.
   */
  name: string;

  /**
   * Description of what the skill does and when to use it.
   * This is the primary mechanism for skill selection.
   * Length: 1-1024 characters
   */
  description: string;

  /**
   * License for the skill (e.g., "MIT", "Apache-2.0").
   * Optional standard field.
   */
  license?: string;

  /**
   * Custom metadata key-value pairs.
   * Optional standard field.
   */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// OpenCode Profile Extensions
// ============================================================================

export type IntegrationSelection = {
  inheritAll?: boolean;
  include?: string[];
  exclude?: string[];
};

/**
 * OpenCode-specific extensions for profile configuration.
 * These fields extend the standard with model/tool configuration.
 */
export interface ProfileExtensions {
  /**
   * Model specification for this profile.
   * Can be a node tag (node:fast, node:code, node:reasoning, node:vision, node:docs)
   * or a specific provider/model identifier.
   */
  model: string;

  /**
   * Provider ID for model resolution.
   */
  providerID?: string;

  /**
   * Model temperature setting (0-2).
   * Lower = more focused/deterministic, Higher = more creative.
   */
  temperature?: number;

  /**
   * Tool enable/disable configuration.
   * Keys are tool names, values are whether the tool is enabled.
   */
  tools?: Record<string, boolean>;

  /**
   * Permission constraints for this profile.
   */
  permissions?: ToolPermissions;

  /**
   * Keywords/tags for matching and categorization.
   */
  tags?: string[];

  /**
   * Whether this profile supports vision/image input.
   */
  supportsVision?: boolean;

  /**
   * Whether this profile has web access.
   */
  supportsWeb?: boolean;

  /**
   * Whether to inject repository context on auto-launch.
   */
  injectRepoContext?: boolean;

  /**
   * Extend another profile by ID (single inheritance).
   */
  extends?: string;

  /**
   * Compose multiple profiles (multi-inheritance).
   */
  compose?: string[];

  // === Session Mode Configuration ===

  /**
   * How this worker's session relates to the parent orchestrator.
   * - "child": Session is a child of parent - visible in TUI, shares context
   * - "isolated": Separate server/session - fully independent
   * - "linked": Separate server but events forwarded for visibility
   * Default: "linked"
   */
  sessionMode?: WorkerSessionMode;

  /**
   * For linked mode: which events to forward to parent.
   * Default: ["tool", "message", "error", "complete", "progress"]
   */
  forwardEvents?: WorkerForwardEvent[];

  /**
   * MCP server configuration for this worker.
   * Use inheritAll: true to pass all parent MCP servers.
   * Or specify servers: ["neo4j", "linear"] for specific ones.
   */
  mcp?: WorkerMcpConfig;

  /**
   * Integration selection for this worker.
   */
  integrations?: IntegrationSelection;

  /**
   * Explicit environment variables to set for this worker.
   */
  env?: Record<string, string>;

  /**
   * Environment variable prefixes to auto-forward.
   * E.g., ["OPENCODE_NEO4J_", "LINEAR_"] to pass all Neo4j and Linear vars.
   */
  envPrefixes?: string[];

  /**
   * Skill permissions for this worker.
   * Controls which skills this worker can access.
   *
   * Special value "inherit" means inherit all skills from parent (for agents).
   * Default behavior (undefined) isolates worker to only its own skill.
   *
   * @example
   * skillPermissions:
   *   memory: allow
   *   "*": deny
   */
  skillPermissions?: SkillPermissions | "inherit";
}

// ============================================================================
// Combined Skill Types
// ============================================================================

/**
 * Complete skill frontmatter combining standard fields with OpenCode extensions.
 */
export interface SkillFrontmatter extends SkillFrontmatterBase, ProfileExtensions {}

/**
 * Source location of a skill.
 */
export type SkillSource = { type: "builtin" } | { type: "global"; path: string } | { type: "project"; path: string };

/**
 * Complete skill definition with parsed content.
 */
export interface Skill {
  /**
   * Unique identifier (directory name).
   */
  id: string;

  /**
   * Source location of this skill.
   */
  source: SkillSource;

  /**
   * Parsed YAML frontmatter.
   */
  frontmatter: SkillFrontmatter;

  /**
   * System prompt / instructions (markdown body).
   */
  systemPrompt: string;

  /**
   * Full file path to SKILL.md.
   */
  filePath: string;

  /**
   * Whether the skill has a scripts/ subdirectory.
   */
  hasScripts: boolean;

  /**
   * Whether the skill has a references/ subdirectory.
   */
  hasReferences: boolean;

  /**
   * Whether the skill has an assets/ subdirectory.
   */
  hasAssets: boolean;

  /**
   * When the skill was created (from file system).
   */
  createdAt?: Date;

  /**
   * When the skill was last modified (from file system).
   */
  updatedAt?: Date;
}

// ============================================================================
// Input Types for CRUD Operations
// ============================================================================

/**
 * Input for creating or updating a skill.
 */
export interface SkillInput {
  /**
   * Skill ID (will become directory name).
   */
  id: string;

  /**
   * Frontmatter configuration.
   */
  frontmatter: Omit<SkillFrontmatter, "name"> & { name?: string };

  /**
   * System prompt / instructions content.
   */
  systemPrompt: string;
}

/**
 * Scope for skill storage operations.
 */
export type SkillScope = "project" | "global";

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Validation error for a specific field.
 */
export interface SkillValidationError {
  field: string;
  message: string;
}

/**
 * Result of skill validation.
 */
export interface SkillValidationResult {
  valid: boolean;
  errors: SkillValidationError[];
}

```

---

## File: types/worker.ts

```typescript
import type { SkillPermissions, ToolPermissions } from "./permissions";
import type { IntegrationSelection, SkillSource } from "./skill";

export type WorkerStatus = "starting" | "ready" | "busy" | "error" | "stopped";

/**
 * Session mode determines how a worker's session relates to the parent orchestrator.
 * - "child": Session is a child of the parent - visible in TUI, shares context
 * - "isolated": Separate server/session - fully independent, no visibility
 * - "linked": Separate server but events are forwarded to parent for visibility
 */
export type WorkerSessionMode = "child" | "isolated" | "linked";

/**
 * Events that can be forwarded from linked worker sessions to the parent.
 */
export type WorkerForwardEvent = "tool" | "message" | "error" | "complete" | "progress";

/**
 * MCP server configuration to forward to workers.
 */
export type WorkerMcpConfig = {
  /** MCP servers to enable for this worker */
  servers?: string[];
  /** Inherit all MCP servers from parent config */
  inheritAll?: boolean;
};

export interface WorkerProfile {
  /** Unique identifier for this worker */
  id: string;
  /** Human-readable name */
  name: string;
  /** Model to use (provider/model or auto/node tag) */
  model: string;
  /** Provider ID */
  providerID?: string;
  /** What this worker specializes in */
  purpose: string;
  /** When to use this worker (injected into context) */
  whenToUse: string;
  /** Optional system prompt override */
  systemPrompt?: string;
  /** Port assigned to this worker's opencode instance */
  port?: number;
  /** Whether this worker can see images */
  supportsVision?: boolean;
  /** Whether this worker has web access */
  supportsWeb?: boolean;
  /** Custom tools to enable/disable */
  tools?: Record<string, boolean>;
  /** Temperature setting */
  temperature?: number;
  /** Max output tokens for this worker (if supported by provider) */
  maxTokens?: number;
  /** Whether this worker profile is enabled */
  enabled?: boolean;
  /** Optional keywords/tags to improve matching */
  tags?: string[];
  /** Whether to inject repo context on auto-launch (for docs worker) */
  injectRepoContext?: boolean;
  /** Optional tool permission constraints */
  permissions?: ToolPermissions;
  /** Extend another profile */
  extends?: string;
  /** Compose multiple profiles */
  compose?: string[];

  // === Session Mode Configuration ===

  /** How this worker's session relates to the parent (default: "linked") */
  sessionMode?: WorkerSessionMode;
  /** For linked mode: which events to forward to parent */
  forwardEvents?: WorkerForwardEvent[];
  /** MCP server configuration for this worker */
  mcp?: WorkerMcpConfig;
  /** Integration selection for this worker */
  integrations?: IntegrationSelection;
  /** Environment variables to forward to this worker */
  env?: Record<string, string>;
  /** Environment variable prefixes to auto-forward (e.g., ["OPENCODE_NEO4J_"]) */
  envPrefixes?: string[];
  /** Origin of the profile definition (builtin, project, global). */
  source?: SkillSource;

  // === Skill Isolation Configuration ===

  /**
   * Skill permissions for this worker.
   * Controls which skills this worker can access.
   * Uses OpenCode's permission.skill config format with glob patterns.
   *
   * Special values:
   * - "inherit": Inherit all skills from parent (for agents)
   * - undefined: Default isolation (only own skill + explicitly allowed)
   *
   * @example
   * {
   *   "memory": "allow",   // Allow memory skill
   *   "*": "deny"          // Deny all others
   * }
   */
  skillPermissions?: SkillPermissions | "inherit";
}

export interface WorkerInstance {
  profile: WorkerProfile;
  status: WorkerStatus;
  port: number;
  /** PID of the spawned `opencode serve` process (when spawned by orchestrator) */
  pid?: number;
  /** Base URL of the worker server */
  serverUrl?: string;
  /** Directory context for tool execution (query.directory) */
  directory?: string;
  sessionId?: string;
  /** Session ID created in the parent OpenCode server for UI display */
  uiSessionId?: string;
  client?: ReturnType<typeof import("@opencode-ai/sdk").createOpencodeClient>;
  /** If this worker was spawned in-process, this shuts down its server */
  shutdown?: () => void | Promise<void>;
  startedAt: Date;
  lastActivity?: Date;
  error?: string;
  warning?: string;
  currentTask?: string;
  /** Most recent completed output (for UI) */
  lastResult?: {
    at: Date;
    jobId?: string;
    response: string;
    report?: {
      summary?: string;
      details?: string;
      issues?: string[];
      notes?: string;
    };
    durationMs?: number;
  };
  /** How the worker model was resolved */
  modelResolution?: string;

  // === Session Mode State ===

  /** The resolved session mode for this instance */
  sessionMode?: WorkerSessionMode;
  /** Parent session ID (for child mode) */
  parentSessionId?: string;
  /** Event forwarding subscription handle (for linked mode) */
  eventForwardingHandle?: { stop: () => void; isActive: () => boolean; setTurboMode: (enabled: boolean) => void };
  /** Messages processed by this worker (for activity tracking) */
  messageCount?: number;
  /** Tools executed by this worker */
  toolCount?: number;
}

export interface Registry {
  workers: Map<string, WorkerInstance>;
  getWorker(id: string): WorkerInstance | undefined;
  getWorkersByCapability(capability: string): WorkerInstance[];
  getActiveWorkers(): WorkerInstance[];
}

export interface MessageToWorker {
  workerId: string;
  content: string;
  attachments?: Array<{
    type: "image" | "file";
    path?: string;
    base64?: string;
    mimeType?: string;
  }>;
  /** Wait for response */
  waitForResponse?: boolean;
  /** Timeout in ms */
  timeout?: number;
}

export interface WorkerResponse {
  workerId: string;
  content: string;
  success: boolean;
  error?: string;
  duration?: number;
}

```

---

## File: types/workflow.ts

```typescript
export type WorkflowSecurityConfig = {
  /** Maximum steps allowed in a workflow */
  maxSteps?: number;
  /** Maximum characters allowed in the initial task */
  maxTaskChars?: number;
  /** Maximum characters allowed to carry between steps */
  maxCarryChars?: number;
  /** Timeout per step (ms) */
  perStepTimeoutMs?: number;
};

export type WorkflowStepConfig = {
  id: string;
  title?: string;
  workerId?: string;
  prompt?: string;
  carry?: boolean;
};

export type WorkflowsConfig = {
  enabled?: boolean;
  roocodeBoomerang?: {
    enabled?: boolean;
    steps?: WorkflowStepConfig[];
    maxSteps?: number;
    maxTaskChars?: number;
    maxCarryChars?: number;
    perStepTimeoutMs?: number;
  };
};

export type SecurityConfig = {
  workflows?: WorkflowSecurityConfig;
};

```

---

## File: ux/repo-context.ts

```typescript
/**
 * Repo Context - Gathers context about the repository for worker injection
 *
 * Used primarily for the docs worker to understand the project it's helping with.
 */

import { execSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

export type RepoContext = {
  /** Root directory of the repo */
  root: string;
  /** Project name (from package.json or directory name) */
  name: string;
  /** Project description (from package.json) */
  description?: string;
  /** Package.json contents (parsed) */
  packageJson?: Record<string, unknown>;
  /** README content (truncated) */
  readme?: string;
  /** Directory structure (top-level) */
  structure: string[];
  /** Git branch info */
  git?: {
    branch?: string;
    remoteUrl?: string;
    hasUncommittedChanges?: boolean;
  };
  /** Whether content was truncated */
  truncated: boolean;
  /** Formatted markdown for injection */
  markdown: string;
};

type RepoContextDeps = {
  existsSync?: typeof existsSync;
  readdirSync?: typeof readdirSync;
  statSync?: typeof statSync;
  readFile?: typeof readFile;
  execSync?: typeof execSync;
};

function clampText(input: string, maxChars: number): { text: string; truncated: boolean } {
  if (input.length <= maxChars) return { text: input, truncated: false };
  return { text: `${input.slice(0, Math.max(0, maxChars))}\n\n...(truncated)\n`, truncated: true };
}

/**
 * Check if a directory is a git repository by looking for .git directory.
 * This is faster and safer than running git commands.
 */
function isGitRepository(directory: string, deps: RepoContextDeps): boolean {
  const existsSyncFn = deps.existsSync ?? existsSync;
  try {
    return existsSyncFn(join(directory, ".git"));
  } catch {
    return false;
  }
}

function getGitInfo(directory: string, deps: RepoContextDeps): RepoContext["git"] | undefined {
  // Check for .git directory first to avoid unnecessary process spawning
  if (!isGitRepository(directory, deps)) {
    return undefined;
  }

  try {
    const execSyncFn = deps.execSync ?? execSync;
    const branch = execSyncFn("git rev-parse --abbrev-ref HEAD", {
      cwd: directory,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5000, // 5 second timeout to prevent hanging
    }).trim();

    let remoteUrl: string | undefined;
    try {
      remoteUrl = execSyncFn("git remote get-url origin", {
        cwd: directory,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 5000,
      }).trim();
    } catch {
      // No remote configured
    }

    let hasUncommittedChanges = false;
    try {
      const status = execSyncFn("git status --porcelain", {
        cwd: directory,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 10000, // Longer timeout for status as it can be slower
      }).trim();
      hasUncommittedChanges = status.length > 0;
    } catch {
      // Git status failed
    }

    return { branch, remoteUrl, hasUncommittedChanges };
  } catch {
    return undefined;
  }
}

function getDirectoryStructure(directory: string, maxItems = 30, deps: RepoContextDeps = {}): string[] {
  const readdirSyncFn = deps.readdirSync ?? readdirSync;
  const statSyncFn = deps.statSync ?? statSync;
  try {
    const entries = readdirSyncFn(directory);
    const result: string[] = [];

    // Prioritize important files/dirs
    const priority = [
      "package.json",
      "tsconfig.json",
      "README.md",
      "src",
      "lib",
      "app",
      "pages",
      "components",
      "test",
      "tests",
      "__tests__",
    ];

    const sorted = entries.sort((a, b) => {
      const aIdx = priority.indexOf(a);
      const bIdx = priority.indexOf(b);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.localeCompare(b);
    });

    for (const entry of sorted) {
      if (result.length >= maxItems) break;
      if (entry.startsWith(".") && entry !== ".github") continue;
      if (entry === "node_modules" || entry === "dist" || entry === "build") continue;

      try {
        const stat = statSyncFn(join(directory, entry));
        const suffix = stat.isDirectory() ? "/" : "";
        result.push(entry + suffix);
      } catch {
        result.push(entry);
      }
    }

    return result;
  } catch {
    return [];
  }
}

export async function getRepoContext(options: {
  directory: string;
  maxReadmeChars?: number;
  maxTotalChars?: number;
  deps?: RepoContextDeps;
}): Promise<RepoContext | undefined> {
  const { directory } = options;
  const maxReadmeChars = options.maxReadmeChars ?? 8000;
  const maxTotalChars = options.maxTotalChars ?? 16000;
  const deps = options.deps ?? {};
  const existsSyncFn = deps.existsSync ?? existsSync;
  const readFileFn = deps.readFile ?? readFile;

  if (!existsSyncFn(directory)) return undefined;

  let name = basename(directory);
  let description: string | undefined;
  let packageJson: Record<string, unknown> | undefined;

  // Try to read package.json
  const pkgPath = join(directory, "package.json");
  if (existsSyncFn(pkgPath)) {
    try {
      const raw = await readFileFn(pkgPath, "utf8");
      packageJson = JSON.parse(raw);
      if (packageJson && typeof packageJson.name === "string") name = packageJson.name;
      if (packageJson && typeof packageJson.description === "string") description = packageJson.description;
    } catch {
      // Ignore parse errors
    }
  }

  // Try to read README
  let readme: string | undefined;
  let readmeTruncated = false;
  const readmeNames = ["README.md", "readme.md", "README", "README.txt"];
  for (const readmeName of readmeNames) {
    const readmePath = join(directory, readmeName);
    if (existsSyncFn(readmePath)) {
      try {
        const raw = await readFileFn(readmePath, "utf8");
        const clamped = clampText(raw, maxReadmeChars);
        readme = clamped.text;
        readmeTruncated = clamped.truncated;
      } catch {
        // Ignore read errors
      }
      break;
    }
  }

  // Get directory structure
  const structure = getDirectoryStructure(directory, 30, deps);

  // Get git info
  const git = getGitInfo(directory, deps);

  // Build markdown
  const sections: string[] = [];
  sections.push(`# Project Context: ${name}`);
  sections.push("");

  if (description) {
    sections.push(`> ${description}`);
    sections.push("");
  }

  if (git) {
    sections.push("## Git Info");
    if (git.branch) sections.push(`- Branch: \`${git.branch}\``);
    if (git.remoteUrl) sections.push(`- Remote: \`${git.remoteUrl}\``);
    if (git.hasUncommittedChanges) sections.push(`- Has uncommitted changes`);
    sections.push("");
  }

  sections.push("## Directory Structure");
  sections.push("```");
  sections.push(structure.join("\n"));
  sections.push("```");
  sections.push("");

  if (packageJson) {
    sections.push("## package.json (summary)");
    const deps = Object.keys((packageJson.dependencies as Record<string, string>) ?? {});
    const devDeps = Object.keys((packageJson.devDependencies as Record<string, string>) ?? {});
    const scripts = Object.keys((packageJson.scripts as Record<string, string>) ?? {});

    if (scripts.length > 0) {
      sections.push(`- Scripts: ${scripts.slice(0, 10).join(", ")}${scripts.length > 10 ? "..." : ""}`);
    }
    if (deps.length > 0) {
      sections.push(`- Dependencies: ${deps.slice(0, 10).join(", ")}${deps.length > 10 ? "..." : ""}`);
    }
    if (devDeps.length > 0) {
      sections.push(`- Dev dependencies: ${devDeps.slice(0, 10).join(", ")}${devDeps.length > 10 ? "..." : ""}`);
    }
    sections.push("");
  }

  if (readme) {
    sections.push("## README");
    sections.push(readme);
    sections.push("");
  }

  let markdown = sections.join("\n");
  let truncated = readmeTruncated;

  // Final clamp
  if (markdown.length > maxTotalChars) {
    const clamped = clampText(markdown, maxTotalChars);
    markdown = clamped.text;
    truncated = true;
  }

  return {
    root: directory,
    name,
    description,
    packageJson,
    readme,
    structure,
    git,
    truncated,
    markdown,
  };
}

/**
 * Get repo context formatted for worker prompt injection.
 * Returns undefined if no context can be gathered.
 */
export async function getRepoContextForWorker(directory: string, deps?: RepoContextDeps): Promise<string | undefined> {
  const context = await getRepoContext({
    directory,
    maxReadmeChars: 6000,
    maxTotalChars: 12000,
    deps,
  });

  if (!context) return undefined;

  return `<repo-context>\n${context.markdown}\n</repo-context>`;
}

```

---

## File: ux/vision-attachments.ts

```typescript
import { execFile } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { WorkerAttachment } from "../workers/prompt";
import { normalizeBase64Image } from "../workers/prompt";
import { isImagePart } from "./vision-parts";
import type { VisionPart } from "./vision-types";

const execFileAsync = promisify(execFile);

const inferMimeType = (path: string): string => {
  const ext = path.toLowerCase().split(".").pop();
  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
  };
  return mimeMap[ext ?? ""] ?? "image/png";
};

type ClipboardDeps = {
  execFileAsync?: typeof execFileAsync;
  readFile?: typeof readFile;
  unlink?: typeof unlink;
  tmpdir?: typeof tmpdir;
  platform?: string;
};

const readClipboardImage = async (
  deps: ClipboardDeps = {},
): Promise<{ mimeType: string; base64: string } | undefined> => {
  const platform = deps.platform ?? process.platform;
  const exec = deps.execFileAsync ?? execFileAsync;
  const read = deps.readFile ?? readFile;
  const remove = deps.unlink ?? unlink;
  const tempDir = deps.tmpdir ?? tmpdir;

  if (platform === "darwin") {
    const outPath = join(tempDir(), `opencode-clipboard-${process.pid}.png`);
    const script = [
      `set outPath to "${outPath.replace(/"/g, '\\"')}"`,
      `set outFile to POSIX file outPath`,
      `set f to open for access outFile with write permission`,
      `set eof f to 0`,
      `write (the clipboard as \u00abclass PNGf\u00bb) to f`,
      `close access f`,
      `return outPath`,
    ].join("\n");

    await exec("osascript", ["-e", script], { timeout: 2000 });
    try {
      const buf = await read(outPath);
      if (buf.length === 0) return undefined;
      return { mimeType: "image/png", base64: buf.toString("base64") };
    } finally {
      await remove(outPath).catch(() => {});
    }
  }

  if (platform === "linux") {
    try {
      const { stdout } = (await exec("wl-paste", ["--no-newline", "--type", "image/png"], {
        encoding: null,
        timeout: 2000,
        maxBuffer: 20 * 1024 * 1024,
      })) as { stdout: Buffer | string };
      const buf = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
      if (buf.length > 0) return { mimeType: "image/png", base64: buf.toString("base64") };
    } catch {
      try {
        const { stdout } = (await exec("xclip", ["-selection", "clipboard", "-t", "image/png", "-o"], {
          encoding: null,
          timeout: 2000,
          maxBuffer: 20 * 1024 * 1024,
        })) as { stdout: Buffer | string };
        const buf = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
        if (buf.length > 0) return { mimeType: "image/png", base64: buf.toString("base64") };
      } catch {
        // ignore
      }
    }
  }

  return undefined;
};

type VisionAttachmentDeps = {
  readFile?: typeof readFile;
  readClipboardImage?: (deps?: ClipboardDeps) => Promise<{ mimeType: string; base64: string } | undefined>;
  clipboardDeps?: ClipboardDeps;
};

const extractSingleImage = async (part: VisionPart, deps?: VisionAttachmentDeps): Promise<WorkerAttachment | null> => {
  try {
    const partUrl = typeof part.url === "string" ? part.url : undefined;
    const mimeType =
      typeof part.mime === "string" ? part.mime : typeof part.mimeType === "string" ? part.mimeType : undefined;
    const readFileFn = deps?.readFile ?? readFile;
    const readClipboardImageFn = deps?.readClipboardImage ?? readClipboardImage;

    if (partUrl?.startsWith("file://")) {
      const path = fileURLToPath(partUrl);
      const buf = await readFileFn(path);
      return { type: "image", mimeType: mimeType ?? inferMimeType(path), base64: buf.toString("base64") };
    }

    if (partUrl && (partUrl.startsWith("/") || /^[A-Za-z]:[\\/]/.test(partUrl))) {
      const buf = await readFileFn(partUrl);
      return { type: "image", mimeType: mimeType ?? inferMimeType(partUrl), base64: buf.toString("base64") };
    }

    if (partUrl?.startsWith("data:")) {
      const match = partUrl.match(/^data:(image\/[^;]+);base64,(.*)$/);
      if (match) {
        return { type: "image", mimeType: match[1], base64: match[2] };
      }
    }

    if (partUrl === "clipboard" || partUrl?.startsWith("clipboard:")) {
      const clip = await readClipboardImageFn(deps?.clipboardDeps);
      if (clip) return { type: "image", mimeType: clip.mimeType, base64: clip.base64 };
    }

    if (part.base64 && typeof part.base64 === "string") {
      return { type: "image", mimeType: mimeType ?? "image/png", base64: normalizeBase64Image(part.base64) };
    }
  } catch {
    return null;
  }

  return null;
};

/** Convert image parts into worker attachments that can be sent to vision models. */
export const extractVisionAttachments = async (
  parts: VisionPart[],
  deps?: VisionAttachmentDeps,
): Promise<WorkerAttachment[]> => {
  if (!Array.isArray(parts)) return [];
  const imageParts = parts.filter((part) => isImagePart(part));
  if (imageParts.length === 0) return [];
  const results = await Promise.all(imageParts.map((part) => extractSingleImage(part, deps)));
  return results.filter((result): result is WorkerAttachment => Boolean(result));
};

export const __test__ = { readClipboardImage };

```

---

## File: ux/vision-parts.ts

```typescript
import type { VisionPart } from "./vision-types";

const isImagePart = (part: VisionPart): boolean => {
  if (!part) return false;
  if (part.type === "image") return true;
  const mime = typeof part.mime === "string" ? part.mime : typeof part.mimeType === "string" ? part.mimeType : "";
  if (part.type === "file" && mime.startsWith("image/")) return true;
  if (part.type === "file" && typeof part.url === "string" && part.url.startsWith("data:image/")) return true;
  if (typeof part.url === "string" && (part.url === "clipboard" || part.url.startsWith("clipboard:"))) return true;
  return false;
};

/** Check whether any parts represent image data. */
export const hasVisionParts = (parts: VisionPart[]): boolean => {
  if (!Array.isArray(parts)) return false;
  return parts.some((part) => isImagePart(part));
};

/**
 * Wrap vision results in a formatted block with explicit instructions.
 * The instructions tell the model this is a TEXT DESCRIPTION of an image,
 * not the image itself, so it should use this description directly.
 */
export const formatVisionAnalysis = (input: { response?: string; error?: string }): string => {
  const instruction =
    "[This is a TEXT DESCRIPTION of an image the user pasted. The image has already been analyzed. " +
    "Use this description to answer the user's question. Do NOT say you cannot see images.]";

  if (input.response) {
    const trimmed = input.response.trim();
    if (trimmed) return `<pasted_image>\n${instruction}\n\n${trimmed}\n</pasted_image>`;
  }
  if (input.error) {
    const trimmed = input.error.trim();
    if (trimmed) return `<pasted_image>\n${instruction}\n\n[Image could not be analyzed: ${trimmed}]\n</pasted_image>`;
  }
  return `<pasted_image>\n${instruction}\n\n[Image could not be analyzed]\n</pasted_image>`;
};

/** Replace image parts with a text summary of the vision analysis. */
export const replaceImagesWithText = (
  parts: VisionPart[],
  text: string,
  meta?: { sessionID?: string; messageID?: string },
): VisionPart[] => {
  if (!Array.isArray(parts)) return parts;
  const withoutImages = parts.filter((part) => !isImagePart(part));
  if (withoutImages.length === parts.length) return parts;

  // Find first text part and prepend image description to it
  for (let i = 0; i < withoutImages.length; i += 1) {
    const part = withoutImages[i];
    if (part?.type !== "text" || typeof part.text !== "string") continue;
    part.text = `${text}\n\n${part.text}`;
    return withoutImages;
  }

  // No text part found - create one with just the image description
  withoutImages.unshift({
    type: "text",
    text,
    id: `${meta?.messageID ?? "msg"}-vision-placeholder`,
    sessionID: meta?.sessionID ?? "",
    messageID: meta?.messageID ?? "",
    synthetic: true,
  });

  return withoutImages;
};

/** Predicate for image-like parts (images, files, or clipboard references). */
export { isImagePart };

```

---

## File: ux/vision-routing.ts

```typescript
import type { Message, Part } from "@opencode-ai/sdk";
import { extractVisionAttachments } from "./vision-attachments";
import { formatVisionAnalysis, hasVisionParts, replaceImagesWithText } from "./vision-parts";
import type { VisionChatInput, VisionChatOutput, VisionRoutingDeps, VisionRoutingState } from "./vision-types";

export { extractVisionAttachments } from "./vision-attachments";
export { formatVisionAnalysis, hasVisionParts, replaceImagesWithText } from "./vision-parts";
export type {
  VisionChatInput,
  VisionChatOutput,
  VisionPart,
  VisionRoutingDeps,
  VisionRoutingState,
} from "./vision-types";

const DEFAULT_PROMPT =
  "Describe this image precisely and concisely. Include: any visible text (exact wording), code snippets, UI elements, error messages, diagrams, or data. Be factual - do not interpret or answer questions about the image.";

const VISION_PLACEHOLDER =
  "[VISION ANALYSIS IN PROGRESS]\n" +
  "An image is being analyzed by the vision worker. " +
  "The orchestrator will receive the analysis results automatically via the await_worker_job tool.\n" +
  "Do NOT respond about the image until the analysis is complete.";

/** Create a tracking state for processed vision messages. */
export function createVisionRoutingState(): VisionRoutingState {
  return { processedMessageIds: new Set() };
}

/**
 * Route image-bearing user messages through the vision worker.
 * Uses async job-based approach: immediately replaces images with placeholder,
 * starts analysis in background, orchestrator uses await_worker_job to get results.
 */
export async function routeVisionMessage(
  input: VisionChatInput,
  output: VisionChatOutput,
  deps: VisionRoutingDeps,
  state: VisionRoutingState,
): Promise<string | undefined> {
  const role =
    typeof output.message?.role === "string"
      ? output.message?.role
      : typeof input.role === "string"
        ? input.role
        : undefined;
  if (role && role !== "user") return undefined;

  const originalParts = Array.isArray(output.parts) ? output.parts : [];
  if (!hasVisionParts(originalParts)) return undefined;

  const messageId = typeof input.messageID === "string" ? input.messageID : undefined;
  if (messageId && state.processedMessageIds.has(messageId)) return undefined;

  const agentId = typeof input.agent === "string" ? input.agent : undefined;
  const agentProfile = agentId ? deps.profiles[agentId] : undefined;
  const agentSupportsVision = Boolean(agentProfile?.supportsVision) || agentId === "vision";
  if (agentSupportsVision) return undefined;

  const visionProfile = deps.profiles.vision;
  const visionModel = visionProfile?.model ?? "vision";

  if (messageId) state.processedMessageIds.add(messageId);

  const timeoutMs = deps.timeoutMs ?? 300_000;
  const prompt = deps.prompt ?? DEFAULT_PROMPT;
  const startedAt = Date.now();

  // Extract attachments FIRST to check if we have valid images
  const attachments = await extractVisionAttachments(originalParts);
  if (attachments.length === 0) {
    const error = "No valid image attachments found";
    output.parts = replaceImagesWithText(originalParts, formatVisionAnalysis({ error }), {
      sessionID: input.sessionID,
      messageID: input.messageID,
    });
    try {
      await deps.logSink?.({
        status: "failed",
        error,
        sessionId: input.sessionID,
        messageId,
        workerId: "vision",
        model: visionModel,
        startedAt,
        finishedAt: Date.now(),
      });
    } catch {
      // ignore log sink failures
    }
    return undefined;
  }

  // Create a job for async vision analysis
  const job = deps.workers.jobs.create({
    workerId: "vision",
    message: prompt,
    sessionId: input.sessionID,
    requestedBy: agentId ?? "orchestrator",
  });

  // IMMEDIATELY replace images with placeholder showing analysis is in progress
  // This allows the hook to return quickly and the UI to show the message
  const placeholderText =
    `<pasted_image job="${job.id}">\n` +
    VISION_PLACEHOLDER +
    `\nJob ID: ${job.id} - Use await_worker_job({ jobId: "${job.id}" }) to get results.\n` +
    `</pasted_image>`;

  const placeholderParts = replaceImagesWithText(originalParts, placeholderText, {
    sessionID: input.sessionID,
    messageID: input.messageID,
  });

  // Mutate output.parts in place
  output.parts.length = 0;
  output.parts.push(...placeholderParts);

  // Emit vision started event for UI feedback
  deps.communication?.emit(
    "orchestra.vision.started",
    { sessionId: input.sessionID, messageId, jobId: job.id },
    { source: "vision" },
  );

  // Run vision analysis in background (non-blocking)
  void (async () => {
    try {
      // Ensure vision worker is running
      if (deps.ensureWorker) {
        await deps.ensureWorker({ workerId: "vision", reason: "on-demand" });
      } else if (!deps.workers.getWorker("vision")) {
        await deps.workers.spawnById("vision");
      }

      const res = await deps.workers.send("vision", prompt, {
        attachments,
        timeout: timeoutMs,
        from: agentId ?? "orchestrator",
        jobId: job.id,
      });

      const trimmedResponse = typeof res.response === "string" ? res.response.trim() : "";
      const succeeded = res.success && trimmedResponse.length > 0;
      const durationMs = Date.now() - startedAt;

      // Set the job result so await_worker_job can retrieve it
      if (succeeded) {
        const analysisText = formatVisionAnalysis({ response: trimmedResponse });
        deps.workers.jobs.setResult(job.id, { responseText: analysisText });
      } else {
        deps.workers.jobs.setResult(job.id, { error: res.error ?? "Vision analysis failed" });
      }

      // Emit vision completed event for UI feedback
      deps.communication?.emit(
        "orchestra.vision.completed",
        { success: succeeded, error: succeeded ? undefined : res.error, durationMs, jobId: job.id },
        { source: "vision" },
      );

      // Auto-stop vision worker after successful analysis (default: true)
      if (succeeded && deps.autoStopVisionWorker !== false) {
        try {
          await deps.workers.stopWorker("vision");
        } catch {
          // Ignore stop errors - worker may have already stopped
        }
      }

      try {
        await deps.logSink?.({
          status: succeeded ? "succeeded" : "failed",
          analysis: succeeded ? trimmedResponse : undefined,
          error: succeeded ? undefined : (res.error ?? "Vision analysis failed"),
          sessionId: input.sessionID,
          messageId,
          workerId: "vision",
          model: visionModel,
          attachments: attachments.length,
          requestedBy: agentId,
          startedAt,
          finishedAt: Date.now(),
          durationMs,
          jobId: job.id,
        });
      } catch {
        // ignore log sink failures
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const durationMs = Date.now() - startedAt;

      // Set error result on the job
      deps.workers.jobs.setResult(job.id, { error });

      // Emit vision failed event for UI feedback
      deps.communication?.emit(
        "orchestra.vision.completed",
        { success: false, error, durationMs, jobId: job.id },
        { source: "vision" },
      );

      try {
        await deps.logSink?.({
          status: "failed",
          error,
          sessionId: input.sessionID,
          messageId,
          workerId: "vision",
          model: visionModel,
          startedAt,
          finishedAt: Date.now(),
          durationMs,
          jobId: job.id,
        });
      } catch {
        // ignore log sink failures
      }
    }
  })();

  // Return the job ID so callers know analysis is pending
  return job.id;
}

/** Backfill processed vision message IDs by scanning message outputs. */
export function syncVisionProcessedMessages(
  output: { messages: Array<{ info?: Message; parts?: Part[] }> },
  state: VisionRoutingState,
) {
  const messages = output.messages ?? [];
  for (const msg of messages) {
    const info = msg?.info;
    if (info?.role !== "user") continue;
    const messageId = typeof info?.id === "string" ? info.id : undefined;
    if (!messageId || state.processedMessageIds.has(messageId)) continue;
    const parts = Array.isArray(msg.parts) ? msg.parts : [];
    const hasMarker = parts.some(
      (part) =>
        part.type === "text" &&
        typeof part.text === "string" &&
        (part.text.includes("<pasted_image>") || part.text.includes("[VISION ANALYSIS")),
    );
    if (hasMarker) state.processedMessageIds.add(messageId);
  }
}

```

---

## File: ux/vision-types.ts

```typescript
import type { CommunicationService } from "../communication";
import type { WorkerInstance } from "../types";
import type { WorkerManager } from "../workers";

export type VisionPart = {
  type?: string;
  url?: string;
  base64?: string;
  mime?: string;
  mimeType?: string;
  text?: string;
  id?: string;
  sessionID?: string;
  messageID?: string;
  synthetic?: boolean;
};

export type VisionRoutingState = {
  processedMessageIds: Set<string>;
};

export type VisionRoutingDeps = {
  workers: Pick<WorkerManager, "getWorker" | "spawnById" | "send" | "jobs" | "stopWorker">;
  ensureWorker?: (input: { workerId: string; reason: "manual" | "on-demand" }) => Promise<WorkerInstance>;
  profiles: Record<string, { id: string; name?: string; model?: string; supportsVision?: boolean }>;
  communication?: Pick<CommunicationService, "emit">;
  timeoutMs?: number;
  prompt?: string;
  logSink?: (entry: Record<string, unknown>) => Promise<void> | void;
  /** If true, stop the vision worker after successful analysis. Default: true */
  autoStopVisionWorker?: boolean;
};

export type VisionChatInput = {
  sessionID: string;
  agent?: string;
  messageID?: string;
  role?: string;
};

export type VisionChatOutput = {
  message?: { role?: string };
  parts: VisionPart[];
};

```

---

## File: workers/attachments.ts

```typescript
import { copyFile, mkdir, unlink, writeFile } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { normalizeBase64Image, type WorkerAttachment } from "./prompt";

function isPathInside(baseDir: string, targetPath: string): boolean {
  const base = resolve(baseDir);
  const target = resolve(targetPath);
  const rel = relative(base, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export async function prepareWorkerAttachments(input: {
  attachments?: WorkerAttachment[];
  baseDir: string;
  workerId: string;
}): Promise<{ attachments?: WorkerAttachment[]; cleanup: () => Promise<void> }> {
  if (!input.attachments || input.attachments.length === 0) {
    return { attachments: input.attachments, cleanup: async () => {} };
  }

  const tempDir = join(input.baseDir, ".opencode", "attachments");
  const created: string[] = [];
  const normalized: WorkerAttachment[] = [];

  const ensureTempDir = async () => {
    await mkdir(tempDir, { recursive: true });
  };

  const extForMime = (mimeType?: string, fallbackPath?: string): string => {
    if (fallbackPath) {
      const ext = extname(fallbackPath);
      if (ext) return ext;
    }
    if (!mimeType) return ".png";
    if (mimeType.includes("png")) return ".png";
    if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return ".jpg";
    if (mimeType.includes("webp")) return ".webp";
    if (mimeType.includes("gif")) return ".gif";
    return ".bin";
  };

  let counter = 0;
  for (const attachment of input.attachments) {
    if (attachment.type !== "image") {
      normalized.push(attachment);
    } else if (attachment.path) {
      if (isPathInside(input.baseDir, attachment.path)) {
        normalized.push(attachment);
      } else {
        await ensureTempDir();
        const ext = extForMime(attachment.mimeType, attachment.path);
        const dest = join(tempDir, `${input.workerId}-${Date.now()}-${counter++}${ext}`);
        await copyFile(attachment.path, dest);
        created.push(dest);
        normalized.push({ ...attachment, path: dest, base64: undefined });
      }
    } else if (attachment.base64) {
      await ensureTempDir();
      const ext = extForMime(attachment.mimeType);
      const dest = join(tempDir, `${input.workerId}-${Date.now()}-${counter++}${ext}`);
      const decoded = Buffer.from(normalizeBase64Image(attachment.base64), "base64");
      await writeFile(dest, decoded);
      created.push(dest);
      normalized.push({ type: "image", path: dest, mimeType: attachment.mimeType });
    } else {
      normalized.push(attachment);
    }
  }

  return {
    attachments: normalized,
    cleanup: async () => {
      await Promise.all(
        created.map(async (path) => {
          try {
            await unlink(path);
          } catch {
            // ignore
          }
        }),
      );
    },
  };
}

```

---

## File: workers/event-forwarding.ts

```typescript
import type { CommunicationService } from "../communication";
import type { WorkerForwardEvent, WorkerInstance } from "../types/worker";
import type { WorkerSessionManager } from "./session-manager";

/**
 * Event forwarding handle that can be stopped.
 */
export interface EventForwardingHandle {
  stop: () => void;
  isActive: () => boolean;
  /** Enable turbo mode for faster polling during active tasks */
  setTurboMode: (enabled: boolean) => void;
}

/**
 * Configuration for event forwarding.
 */
export interface EventForwardingConfig {
  /** Events to forward */
  events: WorkerForwardEvent[];
  /** Polling interval in ms (for SDK clients without streaming) */
  pollIntervalMs?: number;
  /** Maximum events to process per poll */
  maxEventsPerPoll?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 1000;
/** Fast polling interval for active tasks */
const TURBO_POLL_INTERVAL_MS = 150;
const DEFAULT_MAX_EVENTS_PER_POLL = 20;
/** Maximum consecutive errors before stopping polling */
const MAX_CONSECUTIVE_ERRORS = 5;
/** Maximum backoff interval in milliseconds */
const MAX_BACKOFF_MS = 30000;
/** Base backoff interval in milliseconds */
const BASE_BACKOFF_MS = 1000;

type MessageInfo = { id?: string; role?: string };
type SessionMessage = { info?: MessageInfo; parts?: unknown[] };
type ToolInvocation = { toolName?: string; args?: unknown; state?: string };
type MessagePart = {
  type?: string;
  text?: string;
  error?: string;
  reasoning?: { content?: string };
  toolInvocation?: ToolInvocation;
};

const asRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const readSessionMessages = (result: unknown): SessionMessage[] => {
  const data = asRecord(result) && "data" in result ? (result as { data?: unknown }).data : result;
  if (!Array.isArray(data)) return [];
  return data as SessionMessage[];
};

/**
 * Start forwarding events from a worker session to the session manager.
 * This enables visibility into linked worker sessions.
 */
export function startEventForwarding(
  instance: WorkerInstance,
  sessionManager: WorkerSessionManager,
  _communication: CommunicationService,
  config?: Partial<EventForwardingConfig>,
): EventForwardingHandle {
  const events = config?.events ?? ["tool", "message", "error", "complete", "progress"];
  const pollIntervalMs = config?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxEventsPerPoll = config?.maxEventsPerPoll ?? DEFAULT_MAX_EVENTS_PER_POLL;

  let active = true;
  let turboMode = false;
  let lastMessageId: string | undefined;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let consecutiveErrors = 0;
  let currentBackoff = pollIntervalMs;

  const getEffectivePollInterval = () => (turboMode ? TURBO_POLL_INTERVAL_MS : pollIntervalMs);

  const poll = async () => {
    if (!active || !instance.client || !instance.sessionId) return;

    try {
      // Fetch messages from the worker session
      const result = await instance.client.session.messages({
        path: { id: instance.sessionId },
        query: { directory: instance.directory ?? process.cwd() },
      });

      const messages = readSessionMessages(result);

      // Reset backoff on successful poll
      consecutiveErrors = 0;
      currentBackoff = getEffectivePollInterval();

      if (messages.length === 0) {
        // Schedule next poll if still active
        if (active) {
          pollTimer = setTimeout(poll, getEffectivePollInterval());
        }
        return;
      }

      // Process new messages
      let foundLast = !lastMessageId;
      let processed = 0;

      for (const msg of messages) {
        const msgId = msg?.info?.id;
        if (!msgId) continue;

        // Skip until we find our last seen message
        if (!foundLast) {
          if (msgId === lastMessageId) foundLast = true;
          continue;
        }

        // Skip if this is the last message itself
        if (msgId === lastMessageId) continue;

        // Process this message
        await processMessage(msg, instance, sessionManager, _communication, events);
        lastMessageId = msgId;
        processed++;

        if (processed >= maxEventsPerPoll) break;
      }

      // Update instance activity
      if (processed > 0) {
        instance.lastActivity = new Date();
        instance.messageCount = (instance.messageCount ?? 0) + processed;
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);

      // Check for terminal errors that should stop polling
      const isTerminalError = errMsg.includes("not found") || errMsg.includes("closed");

      if (isTerminalError) {
        // Session is gone, stop polling
        active = false;
        return;
      }

      // Increment error count and apply exponential backoff
      consecutiveErrors++;

      // Check if we've exceeded max errors (circuit breaker)
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        // Record error and stop polling
        if (instance.sessionId) {
          sessionManager.updateStatus(
            instance.sessionId,
            "error",
            `Event forwarding stopped after ${MAX_CONSECUTIVE_ERRORS} consecutive errors: ${errMsg}`,
          );
        }
        active = false;
        return;
      }

      // Apply exponential backoff: base * 2^(errors-1), capped at max
      currentBackoff = Math.min(BASE_BACKOFF_MS * 2 ** (consecutiveErrors - 1), MAX_BACKOFF_MS);

      // Record transient error but continue with backoff
      if (instance.sessionId && consecutiveErrors === 1) {
        // Only log on first error to avoid spam
        sessionManager.updateStatus(instance.sessionId, "error", errMsg);
      }
    }

    // Schedule next poll if still active (with potentially increased backoff)
    if (active) {
      pollTimer = setTimeout(poll, currentBackoff);
    }
  };

  // Start polling
  pollTimer = setTimeout(poll, pollIntervalMs);

  return {
    stop: () => {
      active = false;
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = undefined;
      }
    },
    isActive: () => active,
    setTurboMode: (enabled: boolean) => {
      turboMode = enabled;
      // If enabling turbo mode and we have a pending poll, reschedule it faster
      if (enabled && active && pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = setTimeout(poll, TURBO_POLL_INTERVAL_MS);
      }
    },
  };
}

/**
 * Process a message from a worker session and emit appropriate events.
 */
async function processMessage(
  msg: SessionMessage,
  instance: WorkerInstance,
  sessionManager: WorkerSessionManager,
  _communication: CommunicationService,
  events: WorkerForwardEvent[],
): Promise<void> {
  const info = msg?.info;
  const parts = Array.isArray(msg?.parts) ? msg.parts : [];
  const role = info?.role;
  const msgId = info?.id;

  if (!msgId) return;

  // Determine event type based on message content
  for (const part of parts) {
    if (!asRecord(part)) continue;
    const partType = typeof part.type === "string" ? part.type : undefined;
    const typedPart = part as MessagePart;

    // Tool events
    if (partType === "tool-invocation" && events.includes("tool")) {
      const toolName = typedPart.toolInvocation?.toolName ?? "unknown";
      sessionManager.recordActivity(instance.sessionId!, {
        type: "tool",
        summary: `Tool: ${toolName}`,
        details: {
          toolName,
          args: typedPart.toolInvocation?.args,
          status: typedPart.toolInvocation?.state,
        },
      });
      instance.toolCount = (instance.toolCount ?? 0) + 1;
    }

    // Text message events
    if (partType === "text" && events.includes("message")) {
      const text = typedPart.text ?? "";
      const preview = text.slice(0, 100) + (text.length > 100 ? "..." : "");
      sessionManager.recordActivity(instance.sessionId!, {
        type: "message",
        summary: `${role === "user" ? "User" : "Assistant"}: ${preview}`,
        details: { role, text },
      });
    }

    // Error events
    if (partType === "error" && events.includes("error")) {
      const error = typedPart.error ?? "Unknown error";
      sessionManager.recordActivity(instance.sessionId!, {
        type: "error",
        summary: `Error: ${error}`,
        details: { error },
      });
      sessionManager.updateStatus(instance.sessionId!, "error", String(error));
    }

    // Progress/thinking events
    if (partType === "reasoning" && events.includes("progress")) {
      sessionManager.recordActivity(instance.sessionId!, {
        type: "progress",
        summary: "Thinking...",
        details: { content: typedPart.reasoning?.content },
      });
    }
  }

  // Check for completion
  if (role === "assistant" && events.includes("complete")) {
    const hasToolPending = parts.some((p) => {
      if (!asRecord(p)) return false;
      const typedPart = p as MessagePart;
      return typedPart.type === "tool-invocation" && typedPart.toolInvocation?.state === "pending";
    });
    if (!hasToolPending) {
      sessionManager.recordActivity(instance.sessionId!, {
        type: "complete",
        summary: "Response complete",
        details: { messageId: msgId },
      });
    }
  }
}

/**
 * Stop event forwarding for a worker instance.
 */
export function stopEventForwarding(instance: WorkerInstance): void {
  if (instance.eventForwardingHandle) {
    instance.eventForwardingHandle.stop();
    instance.eventForwardingHandle = undefined;
  }
}

```

---

## File: workers/index.ts

```typescript
export type { EventForwardingConfig, EventForwardingHandle } from "./event-forwarding";
export { startEventForwarding, stopEventForwarding } from "./event-forwarding";
export type { WorkerManager, WorkerManagerConfig, WorkerManagerDeps } from "./manager";
export { createWorkerManager } from "./manager";
export { builtInProfiles, getAllProfiles, getProfile } from "./profiles";
export { createSessionManager, WorkerSessionManager } from "./session-manager";
export type { SessionActivity, SessionManagerEvent, TrackedSession } from "./session-manager-types";

```

---

## File: workers/jobs.ts

```typescript
import { randomUUID } from "node:crypto";

export type WorkerJobStatus = "running" | "succeeded" | "failed" | "canceled";

export type WorkerJobReport = {
  summary?: string;
  details?: string;
  issues?: string[];
  notes?: string;
};

export type WorkerJob = {
  id: string;
  workerId: string;
  message: string;
  sessionId?: string;
  requestedBy?: string;
  status: WorkerJobStatus;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  responseText?: string;
  error?: string;
  report?: WorkerJobReport;
};

const MAX_JOBS = 200;
const MAX_JOB_AGE_MS = 24 * 60 * 60 * 1000;

export class WorkerJobRegistry {
  private jobs = new Map<string, WorkerJob>();
  private waiters = new Map<string, Set<(job: WorkerJob) => void>>();

  // biome-ignore lint/complexity/noUselessConstructor: coverage needs explicit constructor.
  constructor() {
    // Explicit constructor keeps coverage tooling from missing instantiation.
  }

  create(input: { workerId: string; message: string; sessionId?: string; requestedBy?: string }): WorkerJob {
    const id = randomUUID();
    const job: WorkerJob = {
      id,
      workerId: input.workerId,
      message: input.message,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.requestedBy ? { requestedBy: input.requestedBy } : {}),
      status: "running",
      startedAt: Date.now(),
    };
    this.jobs.set(id, job);
    this.prune();
    return job;
  }

  get(id: string): WorkerJob | undefined {
    return this.jobs.get(id);
  }

  list(options?: { workerId?: string; limit?: number }): WorkerJob[] {
    const limit = Math.max(1, options?.limit ?? 50);
    const items: WorkerJob[] = [];
    for (const job of this.jobs.values()) {
      if (options?.workerId && job.workerId !== options.workerId) continue;
      items.push(job);
    }

    for (let i = 1; i < items.length; i += 1) {
      const current = items[i];
      let j = i - 1;
      while (j >= 0 && items[j].startedAt < current.startedAt) {
        items[j + 1] = items[j];
        j -= 1;
      }
      items[j + 1] = current;
    }

    return items.length > limit ? items.slice(0, limit) : items;
  }

  setResult(id: string, input: { responseText: string; report?: WorkerJobReport }): void {
    const job = this.jobs.get(id);
    if (!job || job.status !== "running") return;
    job.status = "succeeded";
    job.responseText = input.responseText;
    job.report = input.report;
    job.finishedAt = Date.now();
    job.durationMs = job.finishedAt - job.startedAt;
    this.notify(id, job);
    this.prune();
  }

  setError(id: string, input: { error: string; report?: WorkerJobReport }): void {
    const job = this.jobs.get(id);
    if (!job || job.status !== "running") return;
    job.status = "failed";
    job.error = input.error;
    job.report = input.report;
    job.finishedAt = Date.now();
    job.durationMs = job.finishedAt - job.startedAt;
    this.notify(id, job);
    this.prune();
  }

  attachReport(id: string, report: WorkerJobReport): void {
    const job = this.jobs.get(id);
    if (!job) return;
    job.report = { ...(job.report ?? {}), ...report };
    this.prune();
  }

  await(id: string, options?: { timeoutMs?: number }): Promise<WorkerJob> {
    const existing = this.jobs.get(id);
    if (!existing) return Promise.reject(new Error(`Unknown job "${id}"`));
    if (existing.status !== "running") return Promise.resolve(existing);

    const timeoutMs = options?.timeoutMs ?? 600_000;
    const { promise, resolve, reject } = Promise.withResolvers<WorkerJob>();
    /* c8 ignore next */
    const timer = setTimeout(() => {
      this.offWaiter(id, onDone);
      reject(new Error(`Timed out waiting for job "${id}" after ${timeoutMs}ms`));
    }, timeoutMs);
    const onDone = (job: WorkerJob) => {
      clearTimeout(timer);
      resolve(job);
    };
    this.onWaiter(id, onDone);
    return promise;
  }

  private onWaiter(id: string, cb: (job: WorkerJob) => void) {
    const set = this.waiters.get(id) ?? new Set();
    set.add(cb);
    this.waiters.set(id, set);
  }

  private offWaiter(id: string, cb: (job: WorkerJob) => void) {
    const set = this.waiters.get(id);
    if (!set) return;
    set.delete(cb);
    if (set.size === 0) this.waiters.delete(id);
  }

  private notify(id: string, job: WorkerJob) {
    const set = this.waiters.get(id);
    if (!set) return;
    this.waiters.delete(id);
    for (const cb of set) {
      cb(job);
    }
  }

  private prune() {
    const now = Date.now();
    for (const [id, job] of this.jobs) {
      if (job.status === "running") continue;
      const ageMs = now - (job.finishedAt ?? job.startedAt);
      if (ageMs <= MAX_JOB_AGE_MS) continue;
      if (this.waiters.has(id)) continue;
      this.jobs.delete(id);
    }

    if (this.jobs.size <= MAX_JOBS) return;
    for (const [id, job] of this.jobs) {
      if (this.jobs.size <= MAX_JOBS) break;
      if (job.status === "running") continue;
      if (this.waiters.has(id)) continue;
      this.jobs.delete(id);
    }
  }
}

```

---

## File: workers/manager.ts

```typescript
import type { ApiService } from "../api";
import type { CommunicationService } from "../communication";
import type { DatabaseService } from "../db";
import type { MemoryService } from "../memory";
import type { Factory, OrchestratorConfig, ServiceLifecycle, WorkerInstance, WorkerProfile } from "../types";
import { type WorkerJob, WorkerJobRegistry } from "./jobs";
import { killAllTrackedWorkers, trackWorkerPid, untrackWorkerPid } from "./pid-tracker";
import { WorkerRegistry } from "./registry";
import { sendWorkerMessage, type WorkerSendOptions } from "./send";
import { createSessionManager, type WorkerSessionManager } from "./session-manager";
import { cleanupWorkerInstance, type SpawnWorkerCallbacks, spawnWorker } from "./spawn";

export type WorkerManagerConfig = {
  basePort: number;
  timeout: number;
  directory: string;
  profiles: Record<string, WorkerProfile>;
  modelSelection?: OrchestratorConfig["modelSelection"];
  modelAliases?: OrchestratorConfig["modelAliases"];
  integrations?: OrchestratorConfig["integrations"];
};

export type WorkerManagerDeps = {
  api?: ApiService;
  communication?: CommunicationService;
  memory?: MemoryService;
  db?: DatabaseService;
  spawnWorker?: typeof spawnWorker;
  cleanupWorkerInstance?: typeof cleanupWorkerInstance;
  sendWorkerMessage?: typeof sendWorkerMessage;
};

export type WorkerManager = ServiceLifecycle & {
  getProfile: (id: string) => WorkerProfile | undefined;
  listProfiles: () => WorkerProfile[];
  spawn: (profile: WorkerProfile, options?: { parentSessionId?: string }) => Promise<WorkerInstance>;
  spawnById: (profileId: string, options?: { parentSessionId?: string }) => Promise<WorkerInstance>;
  stopWorker: (workerId: string) => Promise<boolean>;
  send: (
    workerId: string,
    message: string,
    options?: {
      attachments?: import("./prompt").WorkerAttachment[];
      timeout?: number;
      jobId?: string;
      from?: string;
      sessionId?: string;
    },
  ) => Promise<{ success: boolean; response?: string; error?: string }>;
  getWorker: (id: string) => WorkerInstance | undefined;
  listWorkers: () => WorkerInstance[];
  getSummary: (options?: { maxWorkers?: number }) => string;
  /** Session manager for tracking worker sessions and activity */
  sessionManager: WorkerSessionManager;
  jobs: {
    create: (input: { workerId: string; message: string; sessionId?: string; requestedBy?: string }) => WorkerJob;
    get: (id: string) => WorkerJob | undefined;
    list: (options?: { workerId?: string; limit?: number }) => WorkerJob[];
    await: (id: string, options?: { timeoutMs?: number }) => Promise<WorkerJob>;
    attachReport: (id: string, report: WorkerJob["report"]) => void;
    setResult: (id: string, result: { responseText?: string; error?: string; report?: WorkerJob["report"] }) => void;
  };
};

export const createWorkerManager: Factory<WorkerManagerConfig, WorkerManagerDeps, WorkerManager> = ({
  config,
  deps,
}) => {
  if (!deps.api) {
    throw new Error("WorkerManager requires api dependency");
  }
  const api = deps.api;
  const communication = deps.communication;
  const spawnWorkerFn = deps.spawnWorker ?? spawnWorker;
  const cleanupWorkerFn = deps.cleanupWorkerInstance ?? cleanupWorkerInstance;
  const sendWorkerMessageFn = deps.sendWorkerMessage ?? sendWorkerMessage;
  const registry = new WorkerRegistry();
  const jobs = new WorkerJobRegistry();
  const inFlight = new Map<string, Promise<WorkerInstance>>();
  const db = deps.db;

  // Create session manager for centralized session tracking
  const sessionManager = createSessionManager({
    api,
    communication: communication!,
  });

  const emitJobEvent = (job: WorkerJob | undefined, status: "created" | "succeeded" | "failed") => {
    if (!communication || !job) return;
    communication.emit(
      "orchestra.worker.job",
      { job, status },
      { source: "orchestrator", workerId: job.workerId, jobId: job.id },
    );
  };

  const spawn = async (profile: WorkerProfile, options?: { parentSessionId?: string }) => {
    const existing = registry.get(profile.id);
    if (existing) {
      if (communication) {
        communication.emit(
          "orchestra.worker.reused",
          { worker: existing },
          { source: "orchestrator", workerId: existing.profile.id },
        );
      }
      return existing;
    }

    const inFlightSpawn = inFlight.get(profile.id);
    if (inFlightSpawn) return await inFlightSpawn;

    const spawnPromise = spawnWorkerFn({
      api,
      registry,
      directory: config.directory,
      profile,
      integrations: config.integrations,
      modelSelection: config.modelSelection,
      modelAliases: config.modelAliases,
      timeoutMs: config.timeout,
      callbacks: spawnCallbacks,
      sessionManager,
      communication,
      parentSessionId: options?.parentSessionId,
    });
    inFlight.set(profile.id, spawnPromise);
    try {
      const instance = await spawnPromise;
      // Track the worker PID for cleanup on shutdown
      if (instance.port) {
        void trackWorkerPid({
          pid: process.pid, // We track the parent; actual server PID is internal to SDK
          workerId: profile.id,
          port: instance.port,
        });
      }
      return instance;
    } finally {
      inFlight.delete(profile.id);
    }
  };

  const forwardWorkerEvent = (event: string, instance: WorkerInstance) => {
    if (!communication) return;
    const meta = { source: "orchestrator" as const, workerId: instance.profile.id };
    if (event === "spawn") {
      communication.emit("orchestra.worker.spawned", { worker: instance }, meta);
      communication.emit("orchestra.worker.created", { worker: instance }, meta);
    }
    if (event === "ready") communication.emit("orchestra.worker.ready", { worker: instance }, meta);
    if (event === "busy") communication.emit("orchestra.worker.busy", { worker: instance }, meta);
    if (event === "error") {
      communication.emit("orchestra.worker.error", { worker: instance, error: instance.error ?? "unknown" }, meta);
    }
    if (event === "stop") communication.emit("orchestra.worker.stopped", { worker: instance }, meta);
    if (event === "update") communication.emit("orchestra.worker.ready", { worker: instance }, meta);
  };

  const onSpawn = (instance: WorkerInstance) => forwardWorkerEvent("spawn", instance);
  const onUpdate = (instance: WorkerInstance) => forwardWorkerEvent("update", instance);
  const onStop = (instance: WorkerInstance) => forwardWorkerEvent("stop", instance);
  const onError = (instance: WorkerInstance) => forwardWorkerEvent("error", instance);
  const onPersist = (instance: WorkerInstance) => persistWorkerState(instance);

  const persistWorkerState = (instance: WorkerInstance) => {
    if (!db) return;
    try {
      const lastResult = instance.lastResult
        ? { ...instance.lastResult, at: instance.lastResult.at.toISOString() }
        : null;
      db.setWorkerState({
        workerId: instance.profile.id,
        profileName: instance.profile.name,
        model: instance.profile.model,
        serverUrl: instance.serverUrl ?? null,
        sessionId: instance.sessionId ?? null,
        uiSessionId: instance.uiSessionId ?? null,
        status: instance.status,
        sessionMode: instance.sessionMode ?? null,
        parentSessionId: instance.parentSessionId ?? null,
        startedAt: instance.startedAt,
        lastActivity: instance.lastActivity ?? instance.startedAt,
        currentTask: instance.currentTask ?? null,
        lastResult,
        lastResultAt: instance.lastResult?.at ?? null,
        lastResultJobId: instance.lastResult?.jobId ?? null,
        lastResultDurationMs: instance.lastResult?.durationMs ?? null,
        error: instance.error ?? null,
        warning: instance.warning ?? null,
      });
    } catch {
      // ignore persistence errors
    }
  };

  // Callbacks for model resolution events
  const spawnCallbacks: SpawnWorkerCallbacks = {
    onModelResolved: (change) => {
      if (!communication) return;
      communication.emit(
        "orchestra.model.resolved",
        { resolution: change },
        { source: "orchestrator", workerId: change.profileId },
      );
    },
    onModelFallback: (profileId, model, reason) => {
      if (!communication) return;
      communication.emit(
        "orchestra.model.fallback",
        { profileId, model, reason },
        { source: "orchestrator", workerId: profileId },
      );
    },
  };

  const asRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

  const extractSessionId = (value: unknown): string | undefined => {
    const data = asRecord(value) && "data" in value ? (value as { data?: unknown }).data : value;
    if (!asRecord(data)) return undefined;
    return typeof data.id === "string" ? data.id : undefined;
  };

  const formatWorkerResponse = (text: string): string => {
    // Format long unbroken lines by adding line breaks for readability
    const lines = text.split("\n");
    const formatted: string[] = [];

    for (const line of lines) {
      if (line.length <= 80) {
        formatted.push(line);
        continue;
      }

      // Break long lines at natural points (periods, colons, semicolons)
      let remaining = line;
      while (remaining.length > 80) {
        let breakAt = -1;
        // Find a good break point within first 80 chars
        for (let i = Math.min(79, remaining.length - 1); i >= 50; i--) {
          const char = remaining[i];
          if (char === "." || char === ":" || char === ";") {
            breakAt = i + 1;
            break;
          }
        }
        // Fallback: break at comma or space
        if (breakAt === -1) {
          for (let i = Math.min(79, remaining.length - 1); i >= 40; i--) {
            if (remaining[i] === "," || remaining[i] === " ") {
              breakAt = i + 1;
              break;
            }
          }
        }
        // Last resort: hard break
        if (breakAt === -1) breakAt = 80;

        formatted.push(remaining.slice(0, breakAt).trimEnd());
        remaining = remaining.slice(breakAt).trimStart();
      }
      if (remaining) formatted.push(remaining);
    }

    return formatted.join("\n");
  };

  const buildWorkerSummary = (instance: WorkerInstance, response?: string) => {
    const profileName = instance.profile.name || instance.profile.id;
    const body = response?.trim() ?? instance.lastResult?.response?.trim() ?? "";
    const truncated = body.length > 1200 ? `${body.slice(0, 1197).trimEnd()}...` : body;
    const formattedBody = formatWorkerResponse(truncated);

    const lines: string[] = [
      `┌─ Worker "${profileName}" ─────────────────────────────`,
      `│`,
    ];

    if (formattedBody) {
      for (const line of formattedBody.split("\n")) {
        lines.push(`│  ${line}`);
      }
    } else {
      lines.push(`│  (no response)`);
    }

    lines.push(`│`);
    lines.push(`└────────────────────────────────────────────────────────`);

    return lines.join("\n");
  };

  return {
    getProfile: (id) => config.profiles[id],
    listProfiles: () => Object.values(config.profiles),
    spawn,
    spawnById: async (profileId, options) => {
      const profile = config.profiles[profileId];
      if (!profile) throw new Error(`Unknown worker profile: ${profileId}`);
      if (profile.enabled === false) {
        throw new Error(`Worker "${profileId}" is disabled by configuration.`);
      }
      return await spawn(profile, options);
    },
    stopWorker: async (workerId) => {
      const instance = registry.get(workerId);
      if (!instance) return false;
      try {
        // Clean up session manager and event forwarding
        cleanupWorkerFn(instance, sessionManager);
        await instance.shutdown?.();
        // Remove from PID tracking
        void untrackWorkerPid(workerId);
      } finally {
        instance.status = "stopped";
        registry.updateStatus(workerId, "stopped");
        registry.unregister(workerId);
      }
      return true;
    },
    send: async (workerId, message, options) => {
      const sendOptions: WorkerSendOptions = {
        attachments: options?.attachments,
        timeoutMs: options?.timeout,
        jobId: options?.jobId,
        from: options?.from,
        parentSessionId: options?.sessionId,
        communication,
      };
      const instance = registry.get(workerId);
      const memory = deps.memory;
      const parentSessionId = options?.sessionId;

      if (instance && parentSessionId) {
        const needsNewUiSession = !instance.uiSessionId || instance.parentSessionId !== parentSessionId;
        if (needsNewUiSession) {
          try {
            const res = await api.session.create({
              body: { title: `Worker: ${instance.profile.name}`, parentID: parentSessionId },
            });
            const uiSessionId = extractSessionId(res);
            if (uiSessionId) {
              instance.uiSessionId = uiSessionId;
              instance.parentSessionId = parentSessionId;
              persistWorkerState(instance);
            }
          } catch {
            // ignore UI session failures
          }
        } else if (!instance.parentSessionId) {
          instance.parentSessionId = parentSessionId;
          persistWorkerState(instance);
        }

        const activeSessionId = instance.uiSessionId ?? instance.sessionId;
        if (communication && activeSessionId) {
          communication.emit(
            "orchestra.subagent.active",
            {
              subagent: {
                workerId: instance.profile.id,
                sessionId: activeSessionId,
                parentSessionId,
                profile: { id: instance.profile.id, name: instance.profile.name, model: instance.profile.model },
                serverUrl: instance.serverUrl,
                status: instance.status,
              },
            },
            { source: "orchestrator", workerId: instance.profile.id, sessionId: activeSessionId },
          );
        }
      }
      const beforePrompt = async () => {
        if (!instance || !memory?.enabled) return;
        if (instance.client && instance.sessionId) {
          await memory.inject({
            client: instance.client,
            sessionId: instance.sessionId,
            directory: instance.directory,
          });
        }
        if (instance.sessionId) {
          void memory.record({
            text: message,
            sessionId: instance.sessionId,
            role: "user",
            userId: sendOptions.from ?? "orchestrator",
          });
        }
      };

      const result = await sendWorkerMessageFn({
        registry,
        workerId,
        message,
        options: sendOptions,
        beforePrompt,
      });

      if (memory?.enabled && result.success && result.response && instance?.sessionId) {
        void memory.record({
          text: result.response,
          sessionId: instance.sessionId,
          role: "assistant",
          userId: workerId,
        });
      }

      if (communication && instance) {
        if (result.success) {
          communication.emit(
            "orchestra.worker.completed",
            { worker: instance, jobId: options?.jobId, response: result.response ?? "" },
            { source: "orchestrator", workerId: instance.profile.id, jobId: options?.jobId },
          );
        }

        const activeSessionId = instance.uiSessionId ?? instance.sessionId;
        if (activeSessionId) {
          communication.emit(
            "orchestra.subagent.closed",
            {
              subagent: {
                workerId: instance.profile.id,
                sessionId: activeSessionId,
                parentSessionId: instance.parentSessionId,
                profile: { id: instance.profile.id, name: instance.profile.name, model: instance.profile.model },
                serverUrl: instance.serverUrl,
                status: instance.status,
              },
              result: result.success
                ? { summary: buildWorkerSummary(instance, result.response) }
                : { error: result.error ?? "Worker request failed" },
            },
            { source: "orchestrator", workerId: instance.profile.id, sessionId: activeSessionId },
          );
        }
      }

      if (result.success && parentSessionId) {
        const summary = instance ? buildWorkerSummary(instance, result.response) : `Worker ${workerId} completed.`;
        void api.session
          .prompt({
            path: { id: parentSessionId },
            body: {
              noReply: true,
              parts: [{ type: "text", text: summary }],
            },
          })
          .catch(() => {});
      }
      return { success: result.success, response: result.response, error: result.error };
    },
    getWorker: (id) => registry.get(id),
    listWorkers: () => registry.list(),
    getSummary: (options) => registry.getSummary(options),
    sessionManager,
    jobs: {
      create: (input) => {
        const job = jobs.create(input);
        emitJobEvent(job, "created");
        return job;
      },
      get: (id) => jobs.get(id),
      list: (options) => jobs.list(options),
      await: (id, options) => jobs.await(id, options),
      attachReport: (id, report) => jobs.attachReport(id, report!),
      setResult: (id, result) => {
        if (result.error) {
          jobs.setError(id, { error: result.error, report: result.report });
          emitJobEvent(jobs.get(id), "failed");
          return;
        }
        jobs.setResult(id, { responseText: result.responseText ?? "", report: result.report });
        emitJobEvent(jobs.get(id), "succeeded");
      },
    },
    start: async () => {
      registry.on("spawn", onSpawn);
      registry.on("update", onUpdate);
      registry.on("stop", onStop);
      registry.on("error", onError);
      registry.on("update", onPersist);
    },
    stop: async () => {
      registry.off("spawn", onSpawn);
      registry.off("update", onUpdate);
      registry.off("stop", onStop);
      registry.off("error", onError);
      registry.off("update", onPersist);
      // Kill all tracked workers spawned by this process
      await killAllTrackedWorkers();
    },
    health: async () => ({ ok: true }),
  };
};

```

---

## File: workers/pid-tracker.ts

```typescript
import { execSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

type PidTrackerDeps = {
  platform?: string;
  execSync?: typeof execSync;
  homedir?: typeof homedir;
  tmpdir?: typeof tmpdir;
};

const resolveHomeDir = (deps?: PidTrackerDeps): string => {
  const platform = deps?.platform ?? process.platform;
  const homedirFn = deps?.homedir ?? homedir;
  const tmpdirFn = deps?.tmpdir ?? tmpdir;
  const fallbackDir = tmpdirFn();
  if (platform === "win32") {
    return process.env.USERPROFILE || homedirFn() || fallbackDir;
  }
  const candidate = process.env.HOME || homedirFn();
  if (!candidate || candidate === "/") return fallbackDir;
  return candidate;
};

const getPidDir = (deps?: PidTrackerDeps): string => join(resolveHomeDir(deps), ".opencode");
const getPidFile = (deps?: PidTrackerDeps): string => join(getPidDir(deps), "worker-pids.json");

type PidEntry = {
  pid: number;
  workerId: string;
  port?: number;
  createdAt: number;
  parentPid: number;
};

type PidStore = {
  entries: PidEntry[];
  updatedAt: number;
};

async function ensurePidDir(deps?: PidTrackerDeps): Promise<void> {
  const dirPath = getPidDir(deps);
  const dir = Bun.file(dirPath);
  if (!(await dir.exists())) {
    await Bun.write(join(dirPath, ".keep"), "");
  }
}

async function readPidStore(deps?: PidTrackerDeps): Promise<PidStore> {
  try {
    const file = Bun.file(getPidFile(deps));
    if (await file.exists()) {
      const data = await file.json();
      if (data && Array.isArray(data.entries)) {
        return data as PidStore;
      }
    }
  } catch {
    // Corrupted file, start fresh
  }
  return { entries: [], updatedAt: Date.now() };
}

async function writePidStore(store: PidStore, deps?: PidTrackerDeps): Promise<void> {
  await ensurePidDir(deps);
  store.updatedAt = Date.now();
  await Bun.write(getPidFile(deps), JSON.stringify(store, null, 2));
}

/**
 * Track a spawned worker's PID for cleanup.
 */
export async function trackWorkerPid(input: {
  pid: number;
  workerId: string;
  port?: number;
  deps?: PidTrackerDeps;
}): Promise<void> {
  const store = await readPidStore(input.deps);

  // Remove any existing entry for this worker (in case of restart)
  store.entries = store.entries.filter((e) => e.workerId !== input.workerId);

  store.entries.push({
    pid: input.pid,
    workerId: input.workerId,
    port: input.port,
    createdAt: Date.now(),
    parentPid: process.pid,
  });

  await writePidStore(store, input.deps);
}

/**
 * Remove a worker from PID tracking (called on graceful shutdown).
 */
export async function untrackWorkerPid(workerId: string, deps?: PidTrackerDeps): Promise<void> {
  const store = await readPidStore(deps);
  store.entries = store.entries.filter((e) => e.workerId !== workerId);
  await writePidStore(store, deps);
}

/**
 * Check if a process is still running.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a port is in use (indicates worker server is running).
 * More reliable than PID checking since we track orchestrator PID, not worker PID.
 */
function isPortInUse(port: number, deps?: PidTrackerDeps): boolean {
  if (!port || port === 0) return false;
  try {
    const platform = deps?.platform ?? process.platform;
    const exec = deps?.execSync ?? execSync;
    if (platform === "win32") {
      const result = exec(`netstat -ano | findstr :${port}`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return result.includes(`:${port}`);
    } else {
      // Unix-like: use lsof which is more reliable
      const result = exec(`lsof -i :${port} -t 2>/dev/null || true`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return result.trim().length > 0;
    }
  } catch {
    return false;
  }
}

/**
 * Kill a process gracefully, then forcefully if needed.
 */
async function killProcess(pid: number): Promise<boolean> {
  try {
    // Try SIGTERM first
    process.kill(pid, "SIGTERM");

    // Wait up to 2 seconds for graceful shutdown
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (!isProcessAlive(pid)) return true;
    }

    // Force kill if still alive
    process.kill(pid, "SIGKILL");
    return true;
  } catch {
    // Process already dead or permission denied
    return false;
  }
}

/**
 * Clean up stale worker process entries on startup.
 * IMPORTANT: This only removes stale ENTRIES from tracking, it does NOT kill processes.
 * We cannot safely kill processes by port because another application (like Chrome)
 * may have taken over the port since the worker was last running.
 */
export async function cleanupStaleWorkers(options?: {
  maxAgeMs?: number;
  dryRun?: boolean;
  deps?: PidTrackerDeps;
}): Promise<{ killed: string[]; removed: string[] }> {
  const maxAgeMs = options?.maxAgeMs ?? 24 * 60 * 60 * 1000; // 24 hours default
  const dryRun = options?.dryRun ?? false;
  const deps = options?.deps;

  const store = await readPidStore(deps);
  const removed: string[] = [];
  const alive: PidEntry[] = [];

  for (const entry of store.entries) {
    const isStale = Date.now() - entry.createdAt > maxAgeMs;
    const parentDead = !isProcessAlive(entry.parentPid);
    const portActive = entry.port ? isPortInUse(entry.port, deps) : false;

    if (!portActive && !isProcessAlive(entry.pid)) {
      // Neither port nor process active, safe to remove from tracking
      removed.push(entry.workerId);
      continue;
    }

    if (isStale || parentDead) {
      // Entry is stale/orphaned - remove from tracking but DO NOT kill the process
      // The port may now be used by a different application (e.g., browser)
      removed.push(entry.workerId);
      continue;
    }

    // Keep tracking this one
    alive.push(entry);
  }

  if (!dryRun) {
    store.entries = alive;
    await writePidStore(store, deps);
  }

  // Return empty killed array - we no longer kill processes on cleanup
  return { killed: [], removed };
}

/**
 * Kill process(es) listening on a specific port.
 */
/** @internal */
export async function killProcessOnPort(
  port: number,
  deps?: PidTrackerDeps,
  options?: { skipPid?: number },
): Promise<boolean> {
  const skipPid = options?.skipPid;
  try {
    const platform = deps?.platform ?? process.platform;
    const exec = deps?.execSync ?? execSync;
    if (platform === "win32") {
      // Windows: find PID and kill it
      const result = exec(`netstat -ano | findstr :${port}`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      const pids = new Set<number>();
      for (const line of result.split("\n")) {
        const match = line.match(/\s+(\d+)\s*$/);
        if (match) pids.add(parseInt(match[1], 10));
      }
      let killedAny = false;
      for (const pid of pids) {
        if (skipPid && pid === skipPid) continue;
        await killProcess(pid);
        killedAny = true;
      }
      return killedAny;
    } else {
      // Unix: use lsof to find and kill
      const result = exec(`lsof -i :${port} -t 2>/dev/null || true`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      const pids = result
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((p) => parseInt(p, 10));
      let killedAny = false;
      for (const pid of pids) {
        if (Number.isNaN(pid)) continue;
        if (skipPid && pid === skipPid) continue;
        await killProcess(pid);
        killedAny = true;
      }
      return killedAny;
    }
  } catch {
    return false;
  }
}

/**
 * Kill all tracked workers (called on shutdown).
 */
export async function killAllTrackedWorkers(deps?: PidTrackerDeps): Promise<string[]> {
  const store = await readPidStore(deps);
  const killed: string[] = [];

  // Only kill workers spawned by this process
  const myWorkers = store.entries.filter((e) => e.parentPid === process.pid);

  for (const entry of myWorkers) {
    if (entry.pid === process.pid) {
      if (entry.port) {
        const killedPort = await killProcessOnPort(entry.port, deps, { skipPid: process.pid });
        if (killedPort) killed.push(entry.workerId);
      }
      continue;
    }
    if (isProcessAlive(entry.pid)) {
      await killProcess(entry.pid);
      killed.push(entry.workerId);
    }
  }

  // Remove our workers from the store
  store.entries = store.entries.filter((e) => e.parentPid !== process.pid);
  await writePidStore(store, deps);

  return killed;
}

/**
 * Get all currently tracked workers.
 */
export async function getTrackedWorkers(deps?: PidTrackerDeps): Promise<PidEntry[]> {
  const store = await readPidStore(deps);
  return store.entries;
}

/**
 * Clear all PID tracking (for testing or manual cleanup).
 */
export async function clearPidTracking(deps?: PidTrackerDeps): Promise<void> {
  await writePidStore({ entries: [], updatedAt: Date.now() }, deps);
}

```

---

## File: workers/profiles/index.ts

```typescript
/**
 * Worker Profile Factory
 *
 * Profiles (skills) are loaded from:
 * 1. .opencode/skill/{id}/SKILL.md (primary source)
 * 2. orchestrator.json profiles[] (optional overrides)
 *
 * No hardcoded profiles - everything is defined in SKILL.md files.
 */

import { resolveProfileInheritance, type WorkerProfileDefinition } from "../../config/profile-inheritance";
import { skillToProfile } from "../../skills/convert";
import { loadAllSkills } from "../../skills/loader";
import type { WorkerProfile } from "../../types";

/**
 * Get all profiles from skills directory.
 * This is the primary source of truth for worker profiles.
 */
type ProfileLoaderDeps = {
  loadAllSkills?: typeof loadAllSkills;
};

export async function loadSubagentProfiles(
  projectDir?: string,
  deps?: ProfileLoaderDeps,
): Promise<Record<string, WorkerProfile>> {
  const loader = deps?.loadAllSkills ?? loadAllSkills;
  const skills = await loader(projectDir);
  const profiles: Record<string, WorkerProfile> = {};

  for (const [id, skill] of skills) {
    profiles[id] = skillToProfile(skill);
  }

  return profiles;
}

/**
 * Apply config overrides from orchestrator.json profiles[].
 * This allows runtime customization without editing SKILL.md files.
 */
export function applyProfileOverrides(
  baseProfiles: Record<string, WorkerProfile>,
  overrides?: Array<Partial<WorkerProfile> & { id: string }>,
): Record<string, WorkerProfile> {
  if (!overrides || overrides.length === 0) return baseProfiles;

  const result = { ...baseProfiles };

  for (const override of overrides) {
    if (!override.id) continue;

    const base = result[override.id];
    if (base) {
      // Merge override into existing profile
      result[override.id] = {
        ...base,
        ...override,
        // Preserve nested objects with merge
        tools: { ...base.tools, ...override.tools },
        permissions: override.permissions ?? base.permissions,
        tags: override.tags ?? base.tags,
      };
    } else {
      // Create new profile from override (must have required fields)
      if (override.name && override.model && override.purpose && override.whenToUse) {
        result[override.id] = override as WorkerProfile;
      }
    }
  }

  return result;
}

/**
 * Get a single profile by ID.
 */
export function getProfile(id: string, profiles: Record<string, WorkerProfile>): WorkerProfile | undefined {
  return profiles[id];
}

/**
 * Validate that a profile has all required fields.
 */
export function validateProfile(profile: Partial<WorkerProfile>): string[] {
  const errors: string[] = [];

  if (!profile.id) errors.push("id is required");
  if (!profile.name) errors.push("name is required");
  if (!profile.model) errors.push("model is required");
  if (!profile.purpose) errors.push("purpose is required");
  if (!profile.whenToUse) errors.push("whenToUse is required");

  return errors;
}

/**
 * Main entry point: Load all profiles with inheritance resolution.
 *
 * @param projectDir - Project directory for project-scoped skills
 * @param configOverrides - Optional overrides from orchestrator.json profiles[]
 */
export async function getAllProfiles(
  projectDir?: string,
  configOverrides?: Array<Partial<WorkerProfile> & { id: string }>,
  deps?: ProfileLoaderDeps,
): Promise<Record<string, WorkerProfile>> {
  // 1. Load base profiles from skills
  const baseProfiles = await loadSubagentProfiles(projectDir, deps);

  // 2. Apply config overrides
  const withOverrides = applyProfileOverrides(baseProfiles, configOverrides);

  // 3. Resolve inheritance (extends/compose)
  const definitions: Record<string, WorkerProfileDefinition> = {};
  for (const [id, profile] of Object.entries(withOverrides)) {
    if (profile.extends || profile.compose) {
      definitions[id] = profile;
    }
  }

  if (Object.keys(definitions).length === 0) {
    return withOverrides;
  }

  // Separate base profiles (no inheritance) from those needing resolution
  const builtIns: Record<string, WorkerProfile> = {};
  for (const [id, profile] of Object.entries(withOverrides)) {
    if (!profile.extends && !profile.compose) {
      builtIns[id] = profile;
    }
  }

  return resolveProfileInheritance({ builtIns, definitions });
}

/**
 * List available profile IDs.
 */
export async function listProfileIds(projectDir?: string, deps?: ProfileLoaderDeps): Promise<string[]> {
  const profiles = await loadSubagentProfiles(projectDir, deps);
  return Object.keys(profiles).sort();
}

// =============================================================================
// Legacy compatibility exports (deprecated, will be removed)
// =============================================================================

/** @deprecated Use getAllProfiles() instead */
export const builtInProfiles: Record<string, WorkerProfile> = {};

/** @deprecated Use getAllProfiles() instead */
export async function getAllProfilesWithSkills(
  projectDir?: string,
  _baseProfiles?: Record<string, WorkerProfile>,
): Promise<Record<string, WorkerProfile>> {
  return getAllProfiles(projectDir);
}

/** @deprecated Use applyProfileOverrides() instead */
export function mergeProfile(baseId: string, _: Partial<WorkerProfile>): WorkerProfile {
  throw new Error(
    `mergeProfile() is deprecated. Profiles are now loaded from .opencode/skill/. ` +
      `Create a SKILL.md file for "${baseId}" or use orchestrator.json profiles[] for overrides.`,
  );
}

```

---

## File: workers/prompt.ts

```typescript
import { basename, extname, resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import type { FilePartInput, TextPartInput } from "@opencode-ai/sdk";

export type WorkerAttachment = {
  type: "image" | "file";
  path?: string;
  base64?: string;
  mimeType?: string;
};

function inferImageMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/png";
}

export function normalizeBase64Image(input: string): string {
  // Allow passing data URLs.
  const match = input.match(/^data:.*?;base64,(.*)$/);
  return match ? match[1] : input;
}

type PromptPart = TextPartInput | FilePartInput;

export async function buildPromptParts(input: {
  message: string;
  attachments?: WorkerAttachment[];
}): Promise<PromptPart[]> {
  const parts: PromptPart[] = [{ type: "text", text: input.message }];

  if (!input.attachments || input.attachments.length === 0) return parts;

  for (const attachment of input.attachments) {
    if (attachment.type !== "image") continue;

    const mimeType = attachment.mimeType ?? (attachment.path ? inferImageMimeType(attachment.path) : "image/png");
    const filename = attachment.path ? basename(attachment.path) : undefined;

    // OpenCode message inputs accept images as FilePartInput:
    // { type: "file", mime, url: "file://..." } or a data: URL.
    if (attachment.path) {
      const url = attachment.path.startsWith("file://")
        ? attachment.path
        : pathToFileURL(resolvePath(attachment.path)).toString();
      parts.push({ type: "file", mime: mimeType, url, ...(filename ? { filename } : {}) });
      continue;
    }

    const base64 = attachment.base64 ? normalizeBase64Image(attachment.base64) : undefined;
    if (!base64) continue;
    parts.push({
      type: "file",
      mime: mimeType,
      url: `data:${mimeType};base64,${base64}`,
      ...(filename ? { filename } : {}),
    });
  }

  return parts;
}

export function extractTextFromPromptResponse(data: unknown): { text: string; debug?: string } {
  const asObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
  const readParts = (v: unknown): Record<string, unknown>[] | undefined => {
    if (!asObj(v)) return undefined;
    const parts = v.parts;
    if (Array.isArray(parts)) return parts.filter(asObj);
    return undefined;
  };

  const message = asObj(data) ? data.message : undefined;
  const parts = readParts(data) ?? readParts(message) ?? [];
  if (!Array.isArray(parts) || parts.length === 0) return { text: "", debug: "no_parts" };

  let text = "";
  let reasoning = "";
  const partTypes: string[] = [];
  for (const part of parts) {
    if (!asObj(part)) continue;
    const type = typeof part.type === "string" ? part.type : "unknown";
    partTypes.push(type);
    if (type === "text" && typeof part.text === "string") text += part.text;
    if (type === "reasoning" && typeof part.text === "string") reasoning += part.text;
  }

  const output = text.length > 0 ? text : reasoning;
  const debug = output.length > 0 ? undefined : `parts:${[...new Set(partTypes)].join(",")}`;
  return { text: output, debug };
}

```

---

## File: workers/registry.ts

```typescript
import type { WorkerInstance, WorkerStatus } from "../types";

export type WorkerRegistryEvent =
  | "starting"
  | "spawn"
  | "ready"
  | "busy"
  | "error"
  | "stop"
  | "update"
  | "dead"
  | "stopped";
export type WorkerRegistryCallback = (instance: WorkerInstance) => void;

export class WorkerRegistry {
  private workers = new Map<string, WorkerInstance>();
  private listeners = new Map<WorkerRegistryEvent, Set<WorkerRegistryCallback>>();

  // biome-ignore lint/complexity/noUselessConstructor: coverage needs explicit constructor.
  constructor() {
    // Explicit constructor keeps coverage tooling from missing instantiation.
  }

  register(instance: WorkerInstance): void {
    this.workers.set(instance.profile.id, instance);
    this.emit("spawn", instance);
    this.emit("update", instance);
  }

  unregister(id: string): void {
    const instance = this.workers.get(id);
    if (!instance) return;
    this.workers.delete(id);
    this.emit("stop", instance);
  }

  get(id: string): WorkerInstance | undefined {
    return this.workers.get(id);
  }

  list(): WorkerInstance[] {
    return Array.from(this.workers.values());
  }

  getWorkersByStatus(status: WorkerStatus): WorkerInstance[] {
    const result: WorkerInstance[] = [];
    for (const worker of this.workers.values()) {
      if (worker.status === status) result.push(worker);
    }
    return result;
  }

  getWorkersByCapability(capability: string): WorkerInstance[] {
    const result: WorkerInstance[] = [];
    for (const worker of this.workers.values()) {
      if (capability === "vision" && worker.profile.supportsVision) {
        result.push(worker);
        continue;
      }
      if (capability === "web" && worker.profile.supportsWeb) {
        result.push(worker);
      }
    }
    return result;
  }

  getVisionWorkers(): WorkerInstance[] {
    return this.getWorkersByCapability("vision");
  }

  getActiveWorkers(): WorkerInstance[] {
    const result: WorkerInstance[] = [];
    for (const worker of this.workers.values()) {
      if (worker.status === "ready" || worker.status === "busy") result.push(worker);
    }
    return result;
  }

  updateStatus(id: string, status: WorkerStatus, error?: string): void {
    const instance = this.workers.get(id);
    if (!instance) return;
    instance.status = status;
    if (error) instance.error = error;
    this.emit(status === "error" ? "error" : status, instance);
    this.emit("update", instance);
  }

  waitForStatus(workerId: string, status: WorkerStatus, timeoutMs: number): Promise<boolean> {
    const existing = this.get(workerId);
    if (existing?.status === status) return Promise.resolve(true);

    const { promise, resolve } = Promise.withResolvers<boolean>();
    /* c8 ignore next */
    const timeout = setTimeout(() => {
      this.off("update", onUpdate);
      resolve(false);
    }, timeoutMs);

    const onUpdate = (instance: WorkerInstance) => {
      if (instance.profile.id !== workerId) return;
      if (instance.status !== status) return;
      clearTimeout(timeout);
      this.off("update", onUpdate);
      resolve(true);
    };

    this.on("update", onUpdate);
    return promise;
  }

  on(event: WorkerRegistryEvent, callback: WorkerRegistryCallback): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(callback);
    this.listeners.set(event, set);
    return () => this.off(event, callback);
  }

  off(event: WorkerRegistryEvent, callback: WorkerRegistryCallback): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(callback);
    if (set.size === 0) this.listeners.delete(event);
  }

  toJSON(): Array<Record<string, unknown>> {
    const rows: Array<Record<string, unknown>> = [];
    for (const w of this.workers.values()) {
      rows.push({
        id: w.profile.id,
        name: w.profile.name,
        model: w.profile.model,
        modelResolution: w.modelResolution,
        purpose: w.profile.purpose,
        whenToUse: w.profile.whenToUse,
        profile: w.profile,
        status: w.status,
        port: w.port,
        pid: w.pid,
        serverUrl: w.serverUrl,
        sessionId: w.sessionId,
        uiSessionId: w.uiSessionId,
        supportsVision: Boolean(w.profile.supportsVision),
        supportsWeb: Boolean(w.profile.supportsWeb),
        lastActivity: w.lastActivity?.toISOString(),
        currentTask: w.currentTask,
        error: w.error,
        warning: w.warning,
        lastResult: w.lastResult
          ? {
              ...w.lastResult,
              at: w.lastResult.at.toISOString(),
            }
          : undefined,
      });
    }
    return rows;
  }

  getSummary(options: { maxWorkers?: number } = {}): string {
    const maxWorkers = options.maxWorkers ?? 12;
    const workers = Array.from(this.workers.values()).slice(0, Math.max(0, maxWorkers));
    if (workers.length === 0) return "No workers currently registered.";

    const total = this.workers.size;
    const lines = ["## Available Workers", ""];
    if (total > workers.length) lines.push(`(showing ${workers.length} of ${total})`, "");
    for (const w of workers) {
      lines.push(`- ${w.profile.id} (${w.profile.name}) — ${w.status}`);
    }
    lines.push("", "Use ask_worker({ workerId: <id>, message: <text> }) to message a worker.");
    return lines.join("\n");
  }

  private emit(event: WorkerRegistryEvent, instance: WorkerInstance): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of set) {
      cb(instance);
    }
  }
}

```

---

## File: workers/send.ts

```typescript
import type { CommunicationService } from "../communication";
import type { WorkerInstance } from "../types";
import { prepareWorkerAttachments } from "./attachments";
import type { WorkerAttachment } from "./prompt";
import { buildPromptParts, extractTextFromPromptResponse } from "./prompt";
import type { WorkerRegistry } from "./registry";

export type WorkerSendOptions = {
  attachments?: WorkerAttachment[];
  timeoutMs?: number;
  jobId?: string;
  from?: string;
  parentSessionId?: string;
  /** Optional communication service to emit streaming events */
  communication?: CommunicationService;
  /** Enable turbo polling for real-time visibility (default: true) */
  turboPolling?: boolean;
};

export type WorkerSendResult = {
  success: boolean;
  response?: string;
  error?: string;
  durationMs?: number;
};

const DEFAULT_TIMEOUT_MS = 600_000;
const READY_WAIT_CAP_MS = 5 * 60_000;

type WorkerClient = NonNullable<WorkerInstance["client"]>;
type SessionPromptArgs = Parameters<WorkerClient["session"]["prompt"]>[0] & { throwOnError?: false };

const asRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const extractSdkError = (value: unknown): unknown | undefined => {
  if (asRecord(value) && "error" in value) return (value as { error?: unknown }).error;
  return undefined;
};

const extractSdkData = (value: unknown): unknown => {
  if (asRecord(value) && "data" in value) return (value as { data?: unknown }).data ?? value;
  return value;
};

const extractSdkErrorMessage = (value: unknown): string => {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (asRecord(value)) {
    const data = value.data;
    if (asRecord(data) && typeof data.message === "string") return data.message;
    if (typeof value.message === "string") return value.message;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, abort?: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      abort?.abort(new Error("worker prompt timed out"));
      reject(new Error("worker prompt timed out"));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

function buildTaskText(message: string, options?: { jobId?: string; from?: string }): string {
  const sourceFrom = options?.from ?? "orchestrator";
  const jobIdStr = options?.jobId ?? "none";
  const sourceInfo =
    `<message-source from="${sourceFrom}" jobId="${jobIdStr}">\n` +
    `This message was sent by ${sourceFrom === "orchestrator" ? "the orchestrator" : `worker "${sourceFrom}"`}.
` +
    `</message-source>\n\n`;

  let taskText = sourceInfo + message;
  if (options?.jobId) {
    taskText +=
      `\n\n<orchestrator-job id="${options.jobId}">\n` +
      `IMPORTANT: Reply with your full answer as plain text.\n` +
      `</orchestrator-job>`;
  } else {
    taskText +=
      "\n\n<orchestrator-sync>\n" + "IMPORTANT: Reply with your final answer as plain text.\n" + "</orchestrator-sync>";
  }

  return taskText;
}

export async function sendWorkerMessage(input: {
  registry: WorkerRegistry;
  workerId: string;
  message: string;
  options?: WorkerSendOptions;
  beforePrompt?: (instance: WorkerInstance) => Promise<void>;
}): Promise<WorkerSendResult> {
  const instance = input.registry.get(input.workerId);
  if (!instance) return { success: false, error: `Worker "${input.workerId}" not found` };

  if (instance.status === "error" || instance.status === "stopped") {
    return { success: false, error: `Worker "${input.workerId}" is ${instance.status}` };
  }

  const timeoutMs = input.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (instance.status !== "ready") {
    const waitMs = Math.min(timeoutMs, READY_WAIT_CAP_MS);
    const ready = await input.registry.waitForStatus(input.workerId, "ready", waitMs);
    if (!ready) {
      return { success: false, error: `Worker "${input.workerId}" did not become ready within ${waitMs}ms` };
    }
  }

  if (!instance.client || !instance.sessionId) {
    return { success: false, error: `Worker "${input.workerId}" not properly initialized` };
  }

  const startedAt = Date.now();
  input.registry.updateStatus(input.workerId, "busy");
  instance.currentTask = input.message.slice(0, 140);

  let cleanupAttachments: (() => Promise<void>) | undefined;
  try {
    if (input.beforePrompt) {
      try {
        await input.beforePrompt(instance);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        instance.warning = `Pre-prompt hook failed: ${msg}`;
      }
    }

    const taskText = buildTaskText(input.message, { jobId: input.options?.jobId, from: input.options?.from });

    const prepared = await prepareWorkerAttachments({
      attachments: input.options?.attachments,
      baseDir: instance.directory ?? process.cwd(),
      workerId: input.workerId,
    });
    cleanupAttachments = prepared.cleanup;

    const parts = await buildPromptParts({ message: taskText, attachments: prepared.attachments });

    const abort = new AbortController();
    const promptArgs: SessionPromptArgs = {
      path: { id: instance.sessionId },
      body: { parts },
      query: { directory: instance.directory ?? process.cwd() },
      signal: abort.signal,
      throwOnError: false,
    };

    const communication = input.options?.communication;
    const emitStreamChunk = (chunk: string, final = false) => {
      if (!communication) return;
      communication.emit(
        "orchestra.worker.stream",
        {
          chunk: {
            workerId: input.workerId,
            jobId: input.options?.jobId,
            chunk,
            timestamp: Date.now(),
            final,
          },
        },
        { source: "worker", workerId: input.workerId, jobId: input.options?.jobId },
      );
    };

    // Emit start event
    emitStreamChunk("", false);

    // Enable turbo mode for real-time visibility during the request
    const useTurbo = input.options?.turboPolling !== false;
    if (useTurbo && instance.eventForwardingHandle?.setTurboMode) {
      instance.eventForwardingHandle.setTurboMode(true);
    }

    const result = await withTimeout(instance.client.session.prompt(promptArgs), timeoutMs, abort);

    const sdkError = extractSdkError(result);
    if (sdkError) {
      const msg = extractSdkErrorMessage(sdkError);
      instance.warning = `Last request failed: ${msg}`;
      emitStreamChunk(`Error: ${msg}`, true);
      throw new Error(msg);
    }

    const promptData = extractSdkData(result);
    const extracted = extractTextFromPromptResponse(promptData);
    const responseText = extracted.text.trim();

    // Emit the full response as a stream chunk (SDK doesn't support true streaming yet)
    emitStreamChunk(responseText, true);

    // Disable turbo mode after completion
    if (useTurbo && instance.eventForwardingHandle?.setTurboMode) {
      instance.eventForwardingHandle.setTurboMode(false);
    }

    instance.lastResult = {
      at: new Date(),
      jobId: input.options?.jobId,
      response: responseText,
      durationMs: Date.now() - startedAt,
    };
    instance.lastActivity = new Date();
    input.registry.updateStatus(input.workerId, "ready");

    return {
      success: true,
      response: responseText,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    instance.error = errorMsg;
    input.registry.updateStatus(input.workerId, "error", errorMsg);
    return { success: false, error: errorMsg };
  } finally {
    // Always disable turbo mode when done
    if (instance.eventForwardingHandle?.setTurboMode) {
      instance.eventForwardingHandle.setTurboMode(false);
    }
    try {
      await cleanupAttachments?.();
    } catch {
      // ignore
    }
  }
}

```

---

## File: workers/session-manager-types.ts

```typescript
import type { WorkerForwardEvent, WorkerSessionMode } from "../types/worker";

/**
 * Represents a tracked worker session with activity data.
 */
export interface TrackedSession {
  /** Worker ID */
  workerId: string;
  /** Session ID */
  sessionId: string;
  /** Session mode */
  mode: WorkerSessionMode;
  /** Parent session ID (for child sessions) */
  parentSessionId?: string;
  /** Server URL (for isolated/linked sessions) */
  serverUrl?: string;
  /** When the session was created */
  createdAt: Date;
  /** Last activity timestamp */
  lastActivity: Date;
  /** Current status */
  status: "active" | "idle" | "busy" | "error" | "closed";
  /** Message count */
  messageCount: number;
  /** Tool execution count */
  toolCount: number;
  /** Recent activity log (circular buffer) */
  recentActivity: SessionActivity[];
  /** Error if any */
  error?: string;
}

/**
 * A single activity event from a worker session.
 */
export interface SessionActivity {
  /** Unique activity ID */
  id: string;
  /** Activity type */
  type: WorkerForwardEvent;
  /** Timestamp */
  timestamp: Date;
  /** Activity summary */
  summary: string;
  /** Full details (optional) */
  details?: unknown;
}

/**
 * Event emitted when session state changes.
 */
export interface SessionManagerEvent {
  type: "session.created" | "session.activity" | "session.status" | "session.closed" | "session.error";
  session: TrackedSession;
  activity?: SessionActivity;
}

export type SessionManagerEventHandler = (event: SessionManagerEvent) => void;

/**
 * Serialized session for API responses.
 */
export interface SerializedSession {
  workerId: string;
  sessionId: string;
  mode: WorkerSessionMode;
  parentSessionId?: string;
  serverUrl?: string;
  createdAt: string;
  lastActivity: string;
  status: TrackedSession["status"];
  messageCount: number;
  toolCount: number;
  recentActivityCount: number;
  error?: string;
}

```

---

## File: workers/session-manager.ts

```typescript
import type { ApiService } from "../api";
import type { CommunicationService } from "../communication";
import type { WorkerSessionMode } from "../types/worker";
import type {
  SerializedSession,
  SessionActivity,
  SessionManagerEvent,
  SessionManagerEventHandler,
  TrackedSession,
} from "./session-manager-types";

const MAX_RECENT_ACTIVITY = 50;
/** Maximum number of sessions to track before cleanup */
const MAX_SESSIONS = 1000;
/** Session TTL in milliseconds (1 hour) - sessions inactive longer than this are cleaned up */
const SESSION_TTL_MS = 60 * 60 * 1000;
/** Cleanup interval in milliseconds (5 minutes) */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Central manager for tracking all worker sessions.
 * Provides a single point of visibility into all orchestrator activity.
 */
export class WorkerSessionManager {
  private sessions = new Map<string, TrackedSession>();
  private workerToSession = new Map<string, string>();
  private listeners = new Set<SessionManagerEventHandler>();
  private activityCounter = 0;
  private cleanupTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private deps: {
      api: ApiService;
      communication: CommunicationService;
    },
  ) {
    // Start periodic cleanup of stale sessions
    this.cleanupTimer = setInterval(() => this.cleanupStaleSessions(), CLEANUP_INTERVAL_MS);
    // Prevent timer from keeping the process alive
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop the cleanup timer. Call this when shutting down.
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Clean up stale sessions that exceed TTL or when session count exceeds max.
   */
  private cleanupStaleSessions(): void {
    const now = Date.now();
    const sessionsToRemove: string[] = [];

    // Find sessions that exceed TTL
    for (const [sessionId, session] of this.sessions) {
      const inactiveMs = now - session.lastActivity.getTime();
      const isStale = inactiveMs > SESSION_TTL_MS;
      const isClosed = session.status === "closed" || session.status === "error";

      // Remove stale sessions or closed/error sessions older than 5 minutes
      if (isStale || (isClosed && inactiveMs > 5 * 60 * 1000)) {
        sessionsToRemove.push(sessionId);
      }
    }

    // If still over limit after TTL cleanup, remove oldest sessions
    if (this.sessions.size - sessionsToRemove.length > MAX_SESSIONS) {
      const sortedSessions = Array.from(this.sessions.entries())
        .filter(([id]) => !sessionsToRemove.includes(id))
        .sort((a, b) => a[1].lastActivity.getTime() - b[1].lastActivity.getTime());

      const excessCount = this.sessions.size - sessionsToRemove.length - MAX_SESSIONS;
      for (let i = 0; i < excessCount && i < sortedSessions.length; i++) {
        sessionsToRemove.push(sortedSessions[i][0]);
      }
    }

    // Remove sessions
    for (const sessionId of sessionsToRemove) {
      const session = this.sessions.get(sessionId);
      if (session) {
        this.sessions.delete(sessionId);
        this.workerToSession.delete(session.workerId);
      }
    }
  }

  /**
   * Register a new worker session.
   */
  registerSession(input: {
    workerId: string;
    sessionId: string;
    mode: WorkerSessionMode;
    parentSessionId?: string;
    serverUrl?: string;
  }): TrackedSession {
    const session: TrackedSession = {
      workerId: input.workerId,
      sessionId: input.sessionId,
      mode: input.mode,
      parentSessionId: input.parentSessionId,
      serverUrl: input.serverUrl,
      createdAt: new Date(),
      lastActivity: new Date(),
      status: "active",
      messageCount: 0,
      toolCount: 0,
      recentActivity: [],
    };

    this.sessions.set(input.sessionId, session);
    this.workerToSession.set(input.workerId, input.sessionId);

    this.emit({ type: "session.created", session });
    this.deps.communication.emit(
      "orchestra.session.created",
      { session: this.serializeSession(session) },
      { source: "session-manager" },
    );

    return session;
  }

  /**
   * Record activity on a session.
   */
  recordActivity(sessionId: string, activity: Omit<SessionActivity, "id" | "timestamp">): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const fullActivity: SessionActivity = {
      ...activity,
      id: `act-${++this.activityCounter}`,
      timestamp: new Date(),
    };

    session.lastActivity = fullActivity.timestamp;
    session.recentActivity.push(fullActivity);

    // Keep circular buffer size
    if (session.recentActivity.length > MAX_RECENT_ACTIVITY) {
      session.recentActivity.shift();
    }

    // Update counts
    if (activity.type === "message") session.messageCount++;
    if (activity.type === "tool") session.toolCount++;

    this.emit({ type: "session.activity", session, activity: fullActivity });
    this.deps.communication.emit(
      "orchestra.session.activity",
      {
        sessionId,
        workerId: session.workerId,
        activity: {
          id: fullActivity.id,
          type: fullActivity.type,
          timestamp: fullActivity.timestamp.toISOString(),
          summary: fullActivity.summary,
        },
      },
      { source: "session-manager" },
    );
  }

  /**
   * Update session status.
   */
  updateStatus(sessionId: string, status: TrackedSession["status"], error?: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = status;
    session.lastActivity = new Date();
    if (error) session.error = error;

    this.emit({ type: "session.status", session });
    this.deps.communication.emit(
      "orchestra.session.status",
      {
        sessionId,
        workerId: session.workerId,
        status,
        error,
      },
      { source: "session-manager" },
    );
  }

  /**
   * Close and unregister a session.
   */
  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = "closed";
    this.emit({ type: "session.closed", session });
    this.deps.communication.emit(
      "orchestra.session.closed",
      { sessionId, workerId: session.workerId },
      { source: "session-manager" },
    );

    this.sessions.delete(sessionId);
    this.workerToSession.delete(session.workerId);
  }

  /**
   * Get session by ID.
   */
  getSession(sessionId: string): TrackedSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get session by worker ID.
   */
  getSessionByWorker(workerId: string): TrackedSession | undefined {
    const sessionId = this.workerToSession.get(workerId);
    return sessionId ? this.sessions.get(sessionId) : undefined;
  }

  /**
   * Get all tracked sessions.
   */
  getAllSessions(): TrackedSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get sessions by mode.
   */
  getSessionsByMode(mode: WorkerSessionMode): TrackedSession[] {
    return this.getAllSessions().filter((s) => s.mode === mode);
  }

  /**
   * Get active sessions (not closed/error).
   */
  getActiveSessions(): TrackedSession[] {
    return this.getAllSessions().filter((s) => s.status !== "closed" && s.status !== "error");
  }

  /**
   * Get session summary for API response.
   */
  getSummary(): {
    total: number;
    byMode: Record<WorkerSessionMode, number>;
    byStatus: Record<TrackedSession["status"], number>;
    sessions: Array<SerializedSession>;
  } {
    const sessions = this.getAllSessions();
    const byMode: Record<WorkerSessionMode, number> = {
      child: 0,
      isolated: 0,
      linked: 0,
    };
    const byStatus: Record<TrackedSession["status"], number> = {
      active: 0,
      idle: 0,
      busy: 0,
      error: 0,
      closed: 0,
    };

    for (const session of sessions) {
      byMode[session.mode]++;
      byStatus[session.status]++;
    }

    return {
      total: sessions.length,
      byMode,
      byStatus,
      sessions: sessions.map((s) => this.serializeSession(s)),
    };
  }

  /**
   * Subscribe to session events.
   */
  on(handler: SessionManagerEventHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  /**
   * Serialize session for API/external use.
   */
  private serializeSession(session: TrackedSession) {
    return {
      workerId: session.workerId,
      sessionId: session.sessionId,
      mode: session.mode,
      parentSessionId: session.parentSessionId,
      serverUrl: session.serverUrl,
      createdAt: session.createdAt.toISOString(),
      lastActivity: session.lastActivity.toISOString(),
      status: session.status,
      messageCount: session.messageCount,
      toolCount: session.toolCount,
      recentActivityCount: session.recentActivity.length,
      error: session.error,
    };
  }

  private emit(event: SessionManagerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // ignore listener errors
      }
    }
  }
}

/**
 * Create a session manager instance.
 */
export function createSessionManager(deps: {
  api: ApiService;
  communication: CommunicationService;
}): WorkerSessionManager {
  return new WorkerSessionManager(deps);
}

```

---

## File: workers/spawn-bootstrap.ts

```typescript
import type { ApiService } from "../api";
import type { WorkerProfile } from "../types";

type WorkerClient = ApiService["client"];
type SessionPromptArgs = Parameters<WorkerClient["session"]["prompt"]>[0] & { throwOnError?: false };

/** Build the initial bootstrap prompt for a newly created worker session. */
export const buildBootstrapPromptArgs = (input: {
  sessionId: string;
  directory: string;
  profile: WorkerProfile;
  permissionSummary?: string;
  repoContext?: string;
}): SessionPromptArgs => {
  const capabilitiesJson = JSON.stringify({
    vision: Boolean(input.profile.supportsVision),
    web: Boolean(input.profile.supportsWeb),
  });

  const repoContextSection = input.repoContext ? `\n\n${input.repoContext}\n` : "";
  const permissionsSection = input.permissionSummary
    ? `<worker-permissions>\n${input.permissionSummary}\n</worker-permissions>\n\n`
    : "";

  return {
    path: { id: input.sessionId },
    body: {
      noReply: true,
      parts: [
        {
          type: "text",
          text:
            (input.profile.systemPrompt
              ? `<system-context>\n${input.profile.systemPrompt}\n</system-context>\n\n`
              : "") +
            repoContextSection +
            `<worker-identity>\n` +
            `You are worker "${input.profile.id}" (${input.profile.name}).\n` +
            `Your capabilities: ${capabilitiesJson}\n` +
            `</worker-identity>\n\n` +
            permissionsSection +
            `<orchestrator-instructions>\n` +
            `- Always reply with a direct plain-text answer.\n` +
            `- If a jobId is provided, include it in your response if relevant.\n` +
            `</orchestrator-instructions>`,
        },
      ],
    },
    query: { directory: input.directory },
    throwOnError: false,
  };
};

```

---

## File: workers/spawn-env.ts

```typescript
/* c8 ignore file */
import type { SkillPermissions } from "../types/permissions";
import type { WorkerProfile, WorkerSessionMode } from "../types";

/** Build environment variables for a worker based on profile settings. */
export const resolveWorkerEnv = (
  profile: WorkerProfile,
  integrationEnv?: Record<string, string>,
): Record<string, string> => {
  const env: Record<string, string> = {};

  if (profile.envPrefixes && profile.envPrefixes.length > 0) {
    for (const [key, value] of Object.entries(process.env)) {
      if (!value) continue;
      for (const prefix of profile.envPrefixes) {
        if (key.startsWith(prefix)) {
          env[key] = value;
          break;
        }
      }
    }
  }

  if (integrationEnv) {
    Object.assign(env, integrationEnv);
  }

  if (profile.env) {
    Object.assign(env, profile.env);
  }

  return env;
};

/** Resolve MCP configuration to pass down to a worker instance. */
export const resolveWorkerMcp = async (
  profile: WorkerProfile,
  parentConfig: Record<string, unknown>,
): Promise<Record<string, unknown> | undefined> => {
  const mcpConfig = profile.mcp;
  if (!mcpConfig) return undefined;

  const parentMcp = parentConfig.mcp as Record<string, unknown> | undefined;
  if (!parentMcp) return undefined;

  if (mcpConfig.inheritAll) {
    return parentMcp;
  }

  if (mcpConfig.servers && mcpConfig.servers.length > 0) {
    const filtered: Record<string, unknown> = {};
    for (const serverName of mcpConfig.servers) {
      if (parentMcp[serverName]) {
        filtered[serverName] = parentMcp[serverName];
      }
    }
    const resolved = Object.keys(filtered).length > 0 ? filtered : undefined;
    if (resolved) return resolved;
  }

  return undefined;
};

/** Determine the default session mode for a profile. */
export const getDefaultSessionMode = (profile: WorkerProfile): WorkerSessionMode => {
  if (profile.id === "memory" || profile.id === "docs") {
    return "linked";
  }
  return "linked";
};

/**
 * Resolve skill permissions for a worker.
 *
 * This determines which skills a worker can access based on its profile config.
 * The result is used to configure OpenCode's permission.skill setting.
 *
 * Behavior:
 * - "inherit": Worker inherits all skills (for agents like orchestrator, memory)
 * - explicit object: Use the provided skill permission map
 * - undefined: Default isolation - only allow the worker's own skill, deny others
 *
 * @param profile - The worker profile
 * @param allSkillIds - List of all available skill IDs in the project
 * @returns Skill permissions object for OpenCode config, or undefined for inherit
 */
export const resolveWorkerSkillPermissions = (
  profile: WorkerProfile,
  _allSkillIds: string[] = [],
): SkillPermissions | undefined => {
  const skillPerms = profile.skillPermissions;

  // "inherit" means no restrictions - worker gets all parent skills
  if (skillPerms === "inherit") {
    return undefined;
  }

  // Explicit skill permissions - use as-is
  if (skillPerms && typeof skillPerms === "object") {
    // Ensure deny-all fallback if not specified
    if (!("*" in skillPerms)) {
      return { ...skillPerms, "*": "deny" };
    }
    return skillPerms;
  }

  // Default: isolate worker to only its own skill
  // This prevents workers from accessing each other's skills
  const permissions: SkillPermissions = {
    [profile.id]: "allow", // Allow own skill
    "*": "deny", // Deny all others
  };

  return permissions;
};

/**
 * Build the permission config object for OpenCode.
 * This combines skill permissions with any existing permission config.
 *
 * @param existingPermissions - Existing permission config from profile
 * @param skillPermissions - Resolved skill permissions
 * @returns Combined permission config for OpenCode
 */
export const buildPermissionConfig = (
  existingPermissions?: Record<string, unknown>,
  skillPermissions?: SkillPermissions,
): Record<string, unknown> | undefined => {
  if (!skillPermissions && !existingPermissions) {
    return undefined;
  }

  const result: Record<string, unknown> = {};

  // Copy existing permissions
  if (existingPermissions) {
    Object.assign(result, existingPermissions);
  }

  // Add skill permissions
  if (skillPermissions) {
    result.skill = skillPermissions;
  }

  return Object.keys(result).length > 0 ? result : undefined;
};

```

---

## File: workers/spawn-helpers.ts

```typescript
/* c8 ignore file */
const asRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** Unwrap SDK responses that nest payloads under a data field. */
export const extractSdkData = (value: unknown): unknown => {
  if (asRecord(value) && "data" in value) return (value as { data?: unknown }).data ?? value;
  return value;
};

/** Normalize SDK error payloads into a human-readable message. */
export const extractSdkErrorMessage = (value: unknown): string | undefined => {
  const sdkError = asRecord(value) && "error" in value ? (value as { error?: unknown }).error : value;
  if (!sdkError) return undefined;
  if (sdkError instanceof Error) return sdkError.message;
  if (typeof sdkError === "string") return sdkError;
  if (asRecord(sdkError)) {
    const dataMessage = asRecord(sdkError.data) ? sdkError.data.message : undefined;
    if (typeof dataMessage === "string" && dataMessage.trim()) return dataMessage;
    if (typeof sdkError.message === "string" && sdkError.message.trim()) return sdkError.message;
  }
  try {
    return JSON.stringify(sdkError);
  } catch {
    return String(sdkError);
  }
};

/** Race a promise against a timeout and optionally abort. */
export const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, abort?: AbortController): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      abort?.abort(new Error("worker bootstrap timed out"));
      reject(new Error("worker bootstrap timed out"));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
};

/** Validate that a numeric port is within the valid range. */
export const isValidPort = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 65535;

```

---

## File: workers/spawn-model.ts

```typescript
/* c8 ignore file */
import type { ApiService } from "../api";
import { hydrateProfileModelsFromOpencode, type ProfileModelHydrationChange } from "../models/hydrate";
import type { OrchestratorConfig, WorkerProfile } from "../types";

export type ModelResolutionResult = {
  profile: WorkerProfile;
  changes: ProfileModelHydrationChange[];
  fallbackModel?: string;
};

/** Resolve a profile's model string into a concrete provider/model ID when needed. */
export const resolveProfileModel = async (input: {
  api: ApiService;
  directory: string;
  profile: WorkerProfile;
  modelSelection?: OrchestratorConfig["modelSelection"];
  modelAliases?: OrchestratorConfig["modelAliases"];
  deps?: {
    hydrateProfileModelsFromOpencode?: typeof hydrateProfileModelsFromOpencode;
  };
}): Promise<ModelResolutionResult> => {
  const modelSpec = input.profile.model.trim();
  const isNodeTag = modelSpec.startsWith("auto") || modelSpec.startsWith("node");
  const isExplicit = modelSpec.includes("/");

  if (!input.api?.client) {
    if (isNodeTag || !isExplicit) {
      throw new Error(
        `Profile "${input.profile.id}" uses "${input.profile.model}", but model resolution is unavailable. ` +
          `Set a concrete provider/model ID for this profile.`,
      );
    }
    return { profile: input.profile, changes: [] };
  }

  if (!isNodeTag && isExplicit) return { profile: input.profile, changes: [] };

  const hydrate = input.deps?.hydrateProfileModelsFromOpencode ?? hydrateProfileModelsFromOpencode;
  const { profiles, changes, fallbackModel } = await hydrate({
    client: input.api.client,
    directory: input.directory,
    profiles: { [input.profile.id]: input.profile },
    modelAliases: input.modelAliases,
    modelSelection: input.modelSelection,
  });
  return {
    profile: profiles[input.profile.id] ?? input.profile,
    changes,
    fallbackModel,
  };
};

```

---

## File: workers/spawn-plugin.ts

```typescript
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Locate the worker-bridge plugin path from env, dist, or repo scripts. */
export const resolveWorkerBridgePluginPath = (): string | undefined => {
  if (process.env.OPENCODE_WORKER_PLUGIN_PATH) return process.env.OPENCODE_WORKER_PLUGIN_PATH;

  try {
    const baseDir = dirname(fileURLToPath(import.meta.url));
    const distCandidate = join(baseDir, "worker-bridge-plugin.mjs");
    if (existsSync(distCandidate)) return distCandidate;
    const parentCandidate = join(baseDir, "..", "worker-bridge-plugin.mjs");
    if (existsSync(parentCandidate)) return parentCandidate;
  } catch {
    // ignore path resolution issues
  }

  const repoCandidate = join(process.cwd(), "scripts", "worker-bridge-plugin.mjs");
  if (existsSync(repoCandidate)) return repoCandidate;

  return undefined;
};

/** Normalize file:// URLs to filesystem paths when needed. */
export const normalizePluginPath = (path: string | undefined): string | undefined => {
  if (!path) return undefined;
  if (!path.startsWith("file://")) return path;
  try {
    return fileURLToPath(path);
  } catch {
    return path;
  }
};

```

---

## File: workers/spawn-server.ts

```typescript
import type { ApiService } from "../api";
import type { WorkerInstance } from "../types";
import { withTimeout } from "./spawn-helpers";

type WorkerClient = ApiService["client"];
type SessionCreateArgs = Parameters<WorkerClient["session"]["create"]>[0] & { throwOnError?: false };
type ServerBundle = Awaited<ReturnType<ApiService["createServer"]>>;
type ServerConfig = NonNullable<Parameters<ApiService["createServer"]>[0]>["config"];

/** Start an OpenCode server with worker isolation flags applied. */
export const startWorkerServer = async (input: {
  api: ApiService;
  hostname: string;
  port: number;
  timeoutMs: number;
  config: Record<string, unknown>;
  pluginPath?: string;
}): Promise<ServerBundle> => {
  const previousWorkerPluginPath = process.env.OPENCODE_WORKER_PLUGIN_PATH;
  const previousWorkerFlag = process.env.OPENCODE_ORCHESTRATOR_WORKER;

  process.env.OPENCODE_ORCHESTRATOR_WORKER = "1";

  if (input.pluginPath) {
    process.env.OPENCODE_WORKER_PLUGIN_PATH = input.pluginPath;
  }

  return await input.api
    .createServer({
      hostname: input.hostname,
      port: input.port,
      timeout: input.timeoutMs,
      config: input.config as ServerConfig,
    })
    .finally(() => {
      if (previousWorkerFlag === undefined) {
        delete process.env.OPENCODE_ORCHESTRATOR_WORKER;
      } else {
        process.env.OPENCODE_ORCHESTRATOR_WORKER = previousWorkerFlag;
      }
      if (previousWorkerPluginPath === undefined) {
        delete process.env.OPENCODE_WORKER_PLUGIN_PATH;
      } else {
        process.env.OPENCODE_WORKER_PLUGIN_PATH = previousWorkerPluginPath;
      }
    });
};

/** Create a worker session with a timeout guard. */
export const createWorkerSession = async (input: {
  client: WorkerClient;
  directory: string;
  timeoutMs: number;
  title: string;
}): Promise<unknown> => {
  const sessionAbort = new AbortController();
  try {
    const createArgs: SessionCreateArgs = {
      body: { title: input.title },
      query: { directory: input.directory },
      signal: sessionAbort.signal,
      throwOnError: false,
    };
    return await withTimeout(input.client.session.create(createArgs), input.timeoutMs, sessionAbort);
  } catch (error) {
    return { error };
  }
};

/** Create a subagent session on the parent OpenCode server. */
export const createSubagentSession = async (input: {
  api: ApiService;
  timeoutMs: number;
  title: string;
  parentSessionId?: string;
}): Promise<unknown> => {
  const sessionAbort = new AbortController();
  try {
    const createArgs: SessionCreateArgs = {
      body: { title: input.title, ...(input.parentSessionId ? { parentID: input.parentSessionId } : {}) },
      signal: sessionAbort.signal,
      throwOnError: false,
    };
    return await withTimeout(input.api.session.create(createArgs), input.timeoutMs, sessionAbort);
  } catch (error) {
    return { error };
  }
};

/** Apply server connection info to a worker instance. */
export const applyServerBundleToInstance = (instance: WorkerInstance, bundle: ServerBundle) => {
  const { client, server } = bundle;
  instance.shutdown = async () => server.close();
  instance.serverUrl = server.url;
  try {
    const u = new URL(server.url);
    const actualPort = Number(u.port);
    if (Number.isFinite(actualPort) && actualPort > 0) instance.port = actualPort;
  } catch {
    // ignore
  }
  instance.client = client;
  return { client, server };
};

```

---

## File: workers/spawn.ts

```typescript
/* c8 ignore file */
import type { ApiService } from "../api";
import type { CommunicationService } from "../communication";
import { loadOpenCodeConfig, mergeOpenCodeConfig } from "../config/opencode";
import { getIntegrationEnv } from "../integrations/registry";
import { resolveIntegrationsForProfile } from "../integrations/selection";
import type { ProfileModelHydrationChange } from "../models/hydrate";
import { buildToolConfigFromPermissions, summarizePermissions } from "../permissions/validator";
import type { OrchestratorConfig, WorkerInstance, WorkerProfile } from "../types";
import { getRepoContextForWorker } from "../ux/repo-context";
import { startEventForwarding, stopEventForwarding } from "./event-forwarding";
import type { WorkerRegistry } from "./registry";
import type { WorkerSessionManager } from "./session-manager";
import { buildBootstrapPromptArgs } from "./spawn-bootstrap";
import {
  buildPermissionConfig,
  getDefaultSessionMode,
  resolveWorkerEnv,
  resolveWorkerMcp,
  resolveWorkerSkillPermissions,
} from "./spawn-env";
import { extractSdkData, extractSdkErrorMessage, isValidPort, withTimeout } from "./spawn-helpers";
import { resolveProfileModel } from "./spawn-model";
import { normalizePluginPath, resolveWorkerBridgePluginPath } from "./spawn-plugin";
import {
  applyServerBundleToInstance,
  createSubagentSession,
  createWorkerSession,
  startWorkerServer,
} from "./spawn-server";

export type { ModelResolutionResult } from "./spawn-model";

export type SpawnWorkerCallbacks = {
  onModelResolved?: (change: ProfileModelHydrationChange) => void;
  onModelFallback?: (profileId: string, model: string, reason: string) => void;
};

export type SpawnWorkerDeps = {
  resolveProfileModel?: typeof resolveProfileModel;
  loadOpenCodeConfig?: typeof loadOpenCodeConfig;
  mergeOpenCodeConfig?: typeof mergeOpenCodeConfig;
  resolveIntegrationsForProfile?: typeof resolveIntegrationsForProfile;
  getIntegrationEnv?: typeof getIntegrationEnv;
  resolveWorkerEnv?: typeof resolveWorkerEnv;
  resolveWorkerMcp?: typeof resolveWorkerMcp;
  resolveWorkerSkillPermissions?: typeof resolveWorkerSkillPermissions;
  buildPermissionConfig?: typeof buildPermissionConfig;
  getDefaultSessionMode?: typeof getDefaultSessionMode;
  getRepoContextForWorker?: typeof getRepoContextForWorker;
  startEventForwarding?: typeof startEventForwarding;
  stopEventForwarding?: typeof stopEventForwarding;
  buildBootstrapPromptArgs?: typeof buildBootstrapPromptArgs;
  extractSdkData?: typeof extractSdkData;
  extractSdkErrorMessage?: typeof extractSdkErrorMessage;
  withTimeout?: typeof withTimeout;
  resolveWorkerBridgePluginPath?: typeof resolveWorkerBridgePluginPath;
  normalizePluginPath?: typeof normalizePluginPath;
  startWorkerServer?: typeof startWorkerServer;
  createWorkerSession?: typeof createWorkerSession;
  createSubagentSession?: typeof createSubagentSession;
  applyServerBundleToInstance?: typeof applyServerBundleToInstance;
};

/** Spawn a new worker instance and bootstrap its session. */
export async function spawnWorker(input: {
  api: ApiService;
  registry: WorkerRegistry;
  directory: string;
  profile: WorkerProfile;
  integrations?: OrchestratorConfig["integrations"];
  modelSelection?: OrchestratorConfig["modelSelection"];
  modelAliases?: OrchestratorConfig["modelAliases"];
  timeoutMs: number;
  deps?: SpawnWorkerDeps;
  callbacks?: SpawnWorkerCallbacks;
  /** Session manager for tracking and event forwarding */
  sessionManager?: WorkerSessionManager;
  /** Communication service for event forwarding */
  communication?: CommunicationService;
  /** Parent session ID (for child mode) */
  parentSessionId?: string;
}): Promise<WorkerInstance> {
  const deps = input.deps ?? {};
  const resolveProfileModelFn = deps.resolveProfileModel ?? resolveProfileModel;
  const loadOpenCodeConfigFn = deps.loadOpenCodeConfig ?? loadOpenCodeConfig;
  const mergeOpenCodeConfigFn = deps.mergeOpenCodeConfig ?? mergeOpenCodeConfig;
  const resolveIntegrationsForProfileFn = deps.resolveIntegrationsForProfile ?? resolveIntegrationsForProfile;
  const getIntegrationEnvFn = deps.getIntegrationEnv ?? getIntegrationEnv;
  const resolveWorkerEnvFn = deps.resolveWorkerEnv ?? resolveWorkerEnv;
  const resolveWorkerMcpFn = deps.resolveWorkerMcp ?? resolveWorkerMcp;
  const resolveWorkerSkillPermissionsFn = deps.resolveWorkerSkillPermissions ?? resolveWorkerSkillPermissions;
  const buildPermissionConfigFn = deps.buildPermissionConfig ?? buildPermissionConfig;
  const getDefaultSessionModeFn = deps.getDefaultSessionMode ?? getDefaultSessionMode;
  const getRepoContextForWorkerFn = deps.getRepoContextForWorker ?? getRepoContextForWorker;
  const startEventForwardingFn = deps.startEventForwarding ?? startEventForwarding;
  const stopEventForwardingFn = deps.stopEventForwarding ?? stopEventForwarding;
  const buildBootstrapPromptArgsFn = deps.buildBootstrapPromptArgs ?? buildBootstrapPromptArgs;
  const extractSdkDataFn = deps.extractSdkData ?? extractSdkData;
  const extractSdkErrorMessageFn = deps.extractSdkErrorMessage ?? extractSdkErrorMessage;
  const withTimeoutFn = deps.withTimeout ?? withTimeout;
  const resolveWorkerBridgePluginPathFn = deps.resolveWorkerBridgePluginPath ?? resolveWorkerBridgePluginPath;
  const normalizePluginPathFn = deps.normalizePluginPath ?? normalizePluginPath;
  const startWorkerServerFn = deps.startWorkerServer ?? startWorkerServer;
  const createWorkerSessionFn = deps.createWorkerSession ?? createWorkerSession;
  const createSubagentSessionFn = deps.createSubagentSession ?? createSubagentSession;
  const applyServerBundleToInstanceFn = deps.applyServerBundleToInstance ?? applyServerBundleToInstance;

  const {
    profile: resolvedProfile,
    changes,
    fallbackModel,
  } = await resolveProfileModelFn({
    api: input.api,
    directory: input.directory,
    profile: input.profile,
    modelSelection: input.modelSelection,
    modelAliases: input.modelAliases,
  });

  // Notify about model changes
  for (const change of changes) {
    input.callbacks?.onModelResolved?.(change);
  }
  if (fallbackModel && resolvedProfile.model === fallbackModel) {
    input.callbacks?.onModelFallback?.(resolvedProfile.id, fallbackModel, `fallback from ${input.profile.model}`);
  }

  const hostname = "127.0.0.1";
  const fixedPort = isValidPort(resolvedProfile.port) ? resolvedProfile.port : undefined;
  const requestedPort = fixedPort ?? 0;

  const modelResolution =
    input.profile.model.trim().startsWith("auto") || input.profile.model.trim().startsWith("node")
      ? `resolved from ${input.profile.model.trim()}`
      : resolvedProfile.model === input.profile.model
        ? "configured"
        : `resolved from ${input.profile.model.trim()}`;

  const toolConfig = buildToolConfigFromPermissions({
    permissions: resolvedProfile.permissions,
    baseTools: resolvedProfile.tools,
  });
  const permissionSummary = summarizePermissions(resolvedProfile.permissions);

  // Determine session mode
  const sessionMode = resolvedProfile.sessionMode ?? getDefaultSessionModeFn(resolvedProfile);

  const selectedIntegrations = resolveIntegrationsForProfileFn(resolvedProfile, input.integrations);
  const integrationEnv = getIntegrationEnvFn(selectedIntegrations);

  // Resolve env vars for this worker
  const workerEnv = resolveWorkerEnvFn(resolvedProfile, integrationEnv);

  // Load parent config for MCP resolution
  const parentConfig = await loadOpenCodeConfigFn();
  const workerMcp = await resolveWorkerMcpFn(resolvedProfile, parentConfig);
  const baseConfig = { ...parentConfig };
  delete (baseConfig as Record<string, unknown>).integrations;

  // Resolve skill permissions for worker isolation
  // This prevents workers from accessing each other's skills unless explicitly allowed
  const skillPermissions = resolveWorkerSkillPermissionsFn(resolvedProfile);
  const permissionConfig = buildPermissionConfigFn(
    resolvedProfile.permissions as Record<string, unknown> | undefined,
    skillPermissions,
  );

  const instance: WorkerInstance = {
    profile: resolvedProfile,
    status: "starting",
    port: requestedPort,
    directory: input.directory,
    startedAt: new Date(),
    modelResolution,
    sessionMode,
    parentSessionId: input.parentSessionId,
    messageCount: 0,
    toolCount: 0,
  };

  input.registry.register(instance);

  // Set up worker env vars restoration function (defined outside try for catch access)
  const previousEnvValues: Record<string, string | undefined> = {};
  const restoreWorkerEnv = () => {
    for (const [key, previousValue] of Object.entries(previousEnvValues)) {
      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  };

  try {
    const workerBridgePluginPath = normalizePluginPathFn(resolveWorkerBridgePluginPathFn());
    const preferWorkerBridge =
      process.env.OPENCODE_WORKER_BRIDGE === "1" || Boolean(process.env.OPENCODE_WORKER_PLUGIN_PATH);
    const useWorkerBridge = Boolean(workerBridgePluginPath) && preferWorkerBridge;

    const agentOverride =
      resolvedProfile.temperature !== undefined
        ? {
            agent: {
              general: {
                model: resolvedProfile.model,
                temperature: resolvedProfile.temperature,
              },
            },
          }
        : undefined;

    const mergedConfig = await mergeOpenCodeConfigFn(
      {
        model: resolvedProfile.model,
        plugin: [],
        ...(Object.keys(selectedIntegrations).length > 0 && { integrations: selectedIntegrations }),
        ...(agentOverride ?? {}),
        ...(toolConfig && { tools: toolConfig }),
        ...(permissionConfig && { permission: permissionConfig }),
        ...(workerMcp && { mcp: workerMcp }),
      },
      {
        dropOrchestratorPlugin: true,
        appendPlugins: useWorkerBridge ? [workerBridgePluginPath as string] : undefined,
        baseConfig,
      },
    );

    // Inject worker env vars into process.env before starting server
    for (const [key, value] of Object.entries(workerEnv)) {
      previousEnvValues[key] = process.env[key];
      process.env[key] = value;
    }

    const extractSession = (result: unknown) => extractSdkDataFn(result) as { id?: string } | undefined;

    let serverBundle = await startWorkerServerFn({
      api: input.api,
      hostname,
      port: requestedPort,
      timeoutMs: input.timeoutMs,
      config: mergedConfig,
      pluginPath: useWorkerBridge ? (workerBridgePluginPath as string) : undefined,
    });
    let { client, server } = applyServerBundleToInstanceFn(instance, serverBundle);

    let sessionResult = await createWorkerSessionFn({
      client,
      directory: input.directory,
      timeoutMs: input.timeoutMs,
      title: `Worker: ${resolvedProfile.name}`,
    });
    let session = extractSession(sessionResult);
    if (!session?.id) {
      const errMsg = extractSdkErrorMessageFn(sessionResult) ?? "Failed to create session";
      const needsBridge = /stream_chunk|worker bridge|bridge tools/i.test(errMsg);
      if (needsBridge && workerBridgePluginPath && !useWorkerBridge) {
        await Promise.resolve(server.close());
        const mergedWithBridge = await mergeOpenCodeConfigFn(
          {
            model: resolvedProfile.model,
            plugin: [],
            ...(Object.keys(selectedIntegrations).length > 0 && { integrations: selectedIntegrations }),
            ...(agentOverride ?? {}),
            ...(toolConfig && { tools: toolConfig }),
            ...(permissionConfig && { permission: permissionConfig }),
            ...(workerMcp && { mcp: workerMcp }),
          },
          {
            dropOrchestratorPlugin: true,
            appendPlugins: [workerBridgePluginPath],
            baseConfig,
          },
        );
        serverBundle = await startWorkerServerFn({
          api: input.api,
          hostname,
          port: requestedPort,
          timeoutMs: input.timeoutMs,
          config: mergedWithBridge,
          pluginPath: workerBridgePluginPath,
        });
        ({ client, server } = applyServerBundleToInstanceFn(instance, serverBundle));
        sessionResult = await createWorkerSessionFn({
          client,
          directory: input.directory,
          timeoutMs: input.timeoutMs,
          title: `Worker: ${resolvedProfile.name}`,
        });
        session = extractSession(sessionResult);
      }
    }

    if (!session?.id) {
      const errMsg = extractSdkErrorMessageFn(sessionResult) ?? "Failed to create session";
      throw new Error(errMsg);
    }

    instance.sessionId = session.id;

    const repoContext = resolvedProfile.injectRepoContext
      ? await getRepoContextForWorkerFn(input.directory).catch(() => undefined)
      : undefined;

    if (input.parentSessionId) {
      const subagentResult = await createSubagentSessionFn({
        api: input.api,
        timeoutMs: input.timeoutMs,
        title: `Worker: ${resolvedProfile.name}`,
        parentSessionId: input.parentSessionId,
      });
      const subagent = extractSession(subagentResult);
      if (subagent?.id) {
        instance.uiSessionId = subagent.id;
      }
    }

    const bootstrapAbort = new AbortController();
    const bootstrapTimeoutMs = Math.min(input.timeoutMs, 15_000);
    const bootstrapArgs = buildBootstrapPromptArgsFn({
      sessionId: session.id,
      directory: input.directory,
      profile: resolvedProfile,
      permissionSummary,
      repoContext,
    });
    bootstrapArgs.signal = bootstrapAbort.signal;

    void withTimeoutFn(client.session.prompt(bootstrapArgs), bootstrapTimeoutMs, bootstrapAbort).catch(() => {});

    instance.status = "ready";
    instance.lastActivity = new Date();
    input.registry.updateStatus(resolvedProfile.id, "ready");

    // Restore worker env vars
    restoreWorkerEnv();

    // Register session with session manager
    if (input.sessionManager && instance.sessionId) {
      input.sessionManager.registerSession({
        workerId: resolvedProfile.id,
        sessionId: instance.sessionId,
        mode: sessionMode,
        parentSessionId: input.parentSessionId,
        serverUrl: instance.serverUrl,
      });
    }

    // Start event forwarding for linked mode
    if (sessionMode === "linked" && input.sessionManager && input.communication) {
      const forwardEvents = resolvedProfile.forwardEvents ?? ["tool", "message", "error", "complete", "progress"];
      instance.eventForwardingHandle = startEventForwardingFn(instance, input.sessionManager, input.communication, {
        events: forwardEvents,
      });
    }

    return instance;
  } catch (error) {
    // Restore worker env vars on error
    restoreWorkerEnv();

    const errorMsg = error instanceof Error ? error.message : String(error);
    instance.status = "error";
    instance.error = errorMsg;
    input.registry.updateStatus(resolvedProfile.id, "error", errorMsg);

    // Close session in session manager
    if (input.sessionManager && instance.sessionId) {
      input.sessionManager.closeSession(instance.sessionId);
    }

    // Stop event forwarding if started
    stopEventForwardingFn(instance);

    try {
      await instance.shutdown?.();
    } catch {
      // ignore
    }

    // Unregister failed instance from registry to prevent zombie entries
    input.registry.unregister(resolvedProfile.id);

    throw error;
  }
}

/**
 * Clean up a worker instance, stopping event forwarding and closing sessions.
 */
/** Tear down a worker instance and related tracking resources. */
export function cleanupWorkerInstance(instance: WorkerInstance, sessionManager?: WorkerSessionManager): void {
  stopEventForwarding(instance);
  if (sessionManager && instance.sessionId) {
    sessionManager.closeSession(instance.sessionId);
  }
}

```

---

## File: workflows/builtins.ts

```typescript
import type { WorkflowDefinition } from "./types";

export function buildBuiltinWorkflows(): WorkflowDefinition[] {
  return [
    {
      id: "bug-triage",
      name: "Bug Triage",
      description: "Collect context, propose a fix, and review for risks.",
      steps: [
        {
          id: "triage-scan",
          title: "Scan Context",
          workerId: "explorer",
          prompt:
            "Scan the repo for context related to: {task}.\n" +
            "Return relevant files, symbols, and a brief summary of findings.",
          carry: true,
        },
        {
          id: "triage-fix",
          title: "Propose Fix",
          workerId: "coder",
          prompt:
            "Propose a fix for: {task}.\n" +
            "Use this context if helpful:\n{carry}\n" +
            "Return a concise plan and any code-level guidance.",
          carry: true,
        },
        {
          id: "triage-review",
          title: "Risk Review",
          workerId: "reviewer",
          prompt:
            "Review the proposed fix for risks, regressions, or missing tests.\n" +
            "Context:\n{carry}\n" +
            "Return actionable review feedback.",
        },
      ],
    },
    {
      id: "security-audit",
      name: "Security Audit",
      description: "Identify security risks and recommend mitigations.",
      steps: [
        {
          id: "security-findings",
          title: "Threat Scan",
          workerId: "security",
          prompt:
            "Analyze security risks for: {task}.\n" +
            "Identify threats, vulnerable patterns, and data exposure concerns.",
          carry: true,
        },
        {
          id: "security-review",
          title: "Review Findings",
          workerId: "reviewer",
          prompt:
            "Review the security findings for clarity and completeness.\n" +
            "Context:\n{carry}\n" +
            "Suggest any missing risks or mitigations.",
          carry: true,
        },
        {
          id: "security-mitigations",
          title: "Mitigation Plan",
          workerId: "architect",
          prompt:
            "Propose a mitigation plan based on the security findings.\n" +
            "Context:\n{carry}\n" +
            "Return prioritized mitigation steps.",
        },
      ],
    },
    {
      id: "qa-regression",
      name: "QA Regression",
      description: "Design test plan, propose fixes, and verify outcomes.",
      steps: [
        {
          id: "qa-plan",
          title: "Test Plan",
          workerId: "qa",
          prompt: "Draft a focused regression test plan for: {task}.\n" + "Include repro steps and expected outcomes.",
          carry: true,
        },
        {
          id: "qa-fix",
          title: "Implementation Notes",
          workerId: "coder",
          prompt:
            "Given this QA plan, propose implementation or fixes for: {task}.\n" +
            "Context:\n{carry}\n" +
            "Return a concise plan.",
          carry: true,
        },
        {
          id: "qa-verify",
          title: "Verification",
          workerId: "qa",
          prompt:
            "Verify expected behavior based on the plan and notes.\n" +
            "Context:\n{carry}\n" +
            "Return a checklist of verifications.",
        },
      ],
    },
    {
      id: "spec-to-implementation",
      name: "Spec to Implementation",
      description: "Turn requirements into an implementation plan with review.",
      steps: [
        {
          id: "spec",
          title: "Requirements",
          workerId: "product",
          prompt:
            "Turn this task into a short spec with acceptance criteria:\n{task}\n" +
            "Be explicit about scope and edge cases.",
          carry: true,
        },
        {
          id: "architecture",
          title: "Architecture Plan",
          workerId: "architect",
          prompt:
            "Design an implementation approach for the spec.\n" +
            "Context:\n{carry}\n" +
            "Return a high-level plan and risks.",
          carry: true,
        },
        {
          id: "implementation",
          title: "Implementation Steps",
          workerId: "coder",
          prompt:
            "Outline concrete implementation steps based on the plan.\n" +
            "Context:\n{carry}\n" +
            "Include tests to add or update.",
          carry: true,
        },
        {
          id: "review",
          title: "Review Plan",
          workerId: "reviewer",
          prompt:
            "Review the implementation steps for gaps and missing tests.\n" +
            "Context:\n{carry}\n" +
            "Return review notes.",
        },
      ],
    },
    {
      id: "data-digest",
      name: "Data Digest",
      description: "Summarize metrics, research context, and validate insights.",
      steps: [
        {
          id: "insights",
          title: "Insights",
          workerId: "analyst",
          prompt: "Summarize the key insights for: {task}.\n" + "Call out trends, anomalies, and likely drivers.",
          carry: true,
        },
        {
          id: "context",
          title: "Context Research",
          workerId: "docs",
          prompt:
            "Provide supporting context or references for the insights.\n" +
            "Context:\n{carry}\n" +
            "Cite sources or internal references if available.",
          carry: true,
        },
        {
          id: "validation",
          title: "Validation",
          workerId: "reviewer",
          prompt:
            "Validate the insights for accuracy and missing data.\n" +
            "Context:\n{carry}\n" +
            "Return any concerns or follow-ups.",
        },
      ],
    },
  ];
}

```

---

## File: workflows/engine.ts

```typescript
import type { WorkflowDefinition, WorkflowRunInput, WorkflowRunResult, WorkflowStepDefinition } from "./types";

const workflows = new Map<string, WorkflowDefinition>();

export type WorkflowRunDependencies = {
  resolveWorker: (workerId: string, autoSpawn: boolean) => Promise<string>;
  sendToWorker: (
    workerId: string,
    message: string,
    options: { attachments?: WorkflowRunInput["attachments"]; timeoutMs: number },
  ) => Promise<{ success: boolean; response?: string; error?: string }>;
};

export function registerWorkflow(def: WorkflowDefinition) {
  workflows.set(def.id, def);
}

export function listWorkflows(): WorkflowDefinition[] {
  return [...workflows.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function getWorkflow(id: string): WorkflowDefinition | undefined {
  return workflows.get(id);
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{${key}}`, value);
  }
  return out;
}

function appendCarry(existing: string, next: string, maxChars: number): string {
  const combined = existing ? `${existing}\n\n${next}` : next;
  if (combined.length <= maxChars) return combined;
  return combined.slice(combined.length - maxChars);
}

function buildStepPrompt(step: WorkflowStepDefinition, task: string, carry: string): string {
  const base = applyTemplate(step.prompt, { task, carry });
  if (!step.carry || !carry) return base;
  return base;
}

export async function runWorkflow(input: WorkflowRunInput, deps: WorkflowRunDependencies): Promise<WorkflowRunResult> {
  const workflow = getWorkflow(input.workflowId);
  if (!workflow) {
    throw new Error(`Unknown workflow "${input.workflowId}".`);
  }

  if (input.task.length > input.limits.maxTaskChars) {
    throw new Error(`Task exceeds maxTaskChars (${input.limits.maxTaskChars}).`);
  }

  if (workflow.steps.length > input.limits.maxSteps) {
    throw new Error(`Workflow has ${workflow.steps.length} steps (maxSteps=${input.limits.maxSteps}).`);
  }

  const startedAt = Date.now();
  const steps: WorkflowRunResult["steps"] = [];
  let carry = "";

  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];
    const stepStarted = Date.now();
    const workerId = await deps.resolveWorker(step.workerId, input.autoSpawn ?? true);
    const prompt = buildStepPrompt(step, input.task, carry);
    const res = await deps.sendToWorker(workerId, prompt, {
      attachments: i === 0 ? input.attachments : undefined,
      timeoutMs: input.limits.perStepTimeoutMs,
    });
    const stepFinished = Date.now();
    if (!res.success) {
      steps.push({
        id: step.id,
        title: step.title,
        workerId,
        status: "error",
        error: res.error ?? "unknown_error",
        startedAt: stepStarted,
        finishedAt: stepFinished,
        durationMs: stepFinished - stepStarted,
      });
      break;
    }
    const response = res.response ?? "";
    steps.push({
      id: step.id,
      title: step.title,
      workerId,
      status: "success",
      response,
      startedAt: stepStarted,
      finishedAt: stepFinished,
      durationMs: stepFinished - stepStarted,
    });

    if (step.carry) {
      const carryBlock = [`### ${step.title}`, response].join("\n");
      carry = appendCarry(carry, carryBlock, input.limits.maxCarryChars);
    }
  }

  return {
    workflowId: workflow.id,
    workflowName: workflow.name,
    startedAt,
    finishedAt: Date.now(),
    steps,
  };
}

```

---

## File: workflows/factory.ts

```typescript
import type { Factory, ServiceLifecycle, WorkflowsConfig } from "../types";
import { buildBuiltinWorkflows } from "./builtins";
import type { WorkflowDefinition, WorkflowRunInput, WorkflowRunResult, WorkflowStepDefinition } from "./types";

export type WorkflowEngineConfig = WorkflowsConfig | undefined;

export type WorkflowRunDependencies = {
  resolveWorker: (workerId: string, autoSpawn: boolean) => Promise<string>;
  sendToWorker: (
    workerId: string,
    message: string,
    options: { attachments?: WorkflowRunInput["attachments"]; timeoutMs: number },
  ) => Promise<{ success: boolean; response?: string; error?: string }>;
};

export type WorkflowEngine = ServiceLifecycle & {
  register: (def: WorkflowDefinition) => void;
  list: () => WorkflowDefinition[];
  get: (id: string) => WorkflowDefinition | undefined;
  run: (input: WorkflowRunInput, deps: WorkflowRunDependencies) => Promise<WorkflowRunResult>;
};

function applyTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{${key}}`, value);
  }
  return out;
}

function appendCarry(existing: string, next: string, maxChars: number): string {
  const combined = existing ? `${existing}\n\n${next}` : next;
  if (combined.length <= maxChars) return combined;
  return combined.slice(combined.length - maxChars);
}

function buildStepPrompt(step: WorkflowStepDefinition, task: string, carry: string): string {
  const base = applyTemplate(step.prompt, { task, carry });
  if (!step.carry || !carry) return base;
  return base;
}

export const createWorkflowEngine: Factory<WorkflowEngineConfig, Record<string, never>, WorkflowEngine> = ({
  config,
}) => {
  const workflows = new Map<string, WorkflowDefinition>();

  const register = (def: WorkflowDefinition) => {
    workflows.set(def.id, def);
  };

  const list = () => [...workflows.values()].sort((a, b) => a.id.localeCompare(b.id));

  const get = (id: string) => workflows.get(id);

  const run = async (input: WorkflowRunInput, deps: WorkflowRunDependencies): Promise<WorkflowRunResult> => {
    const workflow = get(input.workflowId);
    if (!workflow) throw new Error(`Unknown workflow "${input.workflowId}".`);

    if (input.task.length > input.limits.maxTaskChars) {
      throw new Error(`Task exceeds maxTaskChars (${input.limits.maxTaskChars}).`);
    }

    if (workflow.steps.length > input.limits.maxSteps) {
      throw new Error(`Workflow has ${workflow.steps.length} steps (maxSteps=${input.limits.maxSteps}).`);
    }

    const startedAt = Date.now();
    const steps: WorkflowRunResult["steps"] = [];
    let carry = "";

    for (let i = 0; i < workflow.steps.length; i += 1) {
      const step = workflow.steps[i];
      const stepStarted = Date.now();
      const workerId = await deps.resolveWorker(step.workerId, input.autoSpawn ?? true);
      const prompt = buildStepPrompt(step, input.task, carry);
      const res = await deps.sendToWorker(workerId, prompt, {
        attachments: i === 0 ? input.attachments : undefined,
        timeoutMs: input.limits.perStepTimeoutMs,
      });
      const stepFinished = Date.now();

      if (!res.success) {
        steps.push({
          id: step.id,
          title: step.title,
          workerId,
          status: "error",
          error: res.error ?? "unknown_error",
          startedAt: stepStarted,
          finishedAt: stepFinished,
          durationMs: stepFinished - stepStarted,
        });
        break;
      }

      const response = res.response ?? "";
      steps.push({
        id: step.id,
        title: step.title,
        workerId,
        status: "success",
        response,
        startedAt: stepStarted,
        finishedAt: stepFinished,
        durationMs: stepFinished - stepStarted,
      });

      if (step.carry) {
        const carryBlock = [`### ${step.title}`, response].join("\n");
        carry = appendCarry(carry, carryBlock, input.limits.maxCarryChars);
      }
    }

    return {
      workflowId: workflow.id,
      workflowName: workflow.name,
      startedAt,
      finishedAt: Date.now(),
      steps,
    };
  };

  const start = async () => {
    const enabled = config?.enabled !== false;
    if (!enabled) return;
    for (const wf of buildBuiltinWorkflows()) register(wf);
  };

  return {
    register,
    list,
    get,
    run,
    start,
    stop: async () => {
      workflows.clear();
    },
    health: async () => ({ ok: true }),
  };
};

```

---

## File: workflows/index.ts

```typescript
import type { OrchestratorConfig } from "../types";
import { buildBuiltinWorkflows } from "./builtins";
import { registerWorkflow } from "./engine";
import { buildRooCodeBoomerangWorkflow } from "./roocode-boomerang";

let loaded = false;

export function loadWorkflows(config: OrchestratorConfig) {
  if (loaded) return;
  loaded = true;

  if (config.workflows?.enabled === false) return;

  const roocode = config.workflows?.roocodeBoomerang;
  if (roocode?.enabled !== false) {
    registerWorkflow(buildRooCodeBoomerangWorkflow(roocode?.steps));
  }

  for (const workflow of buildBuiltinWorkflows()) {
    registerWorkflow(workflow);
  }
}

```

---

## File: workflows/roocode-boomerang.ts

```typescript
import type { WorkflowStepConfig } from "../types";
import type { WorkflowDefinition, WorkflowStepDefinition } from "./types";

const defaultSteps: WorkflowStepDefinition[] = [
  {
    id: "plan",
    title: "Plan",
    workerId: "architect",
    prompt:
      "You are the architect. Create a concise plan for the task.\n\n" +
      "Task:\n{task}\n\n" +
      "Return a numbered checklist with 3-6 steps.",
    carry: true, // Must carry to pass plan to implement step
  },
  {
    id: "implement",
    title: "Implement",
    workerId: "coder",
    prompt:
      "You are the coder. Implement the plan for the task.\n\n" +
      "Task:\n{task}\n\n" +
      "Plan:\n{carry}\n\n" +
      "Return what you changed and any important notes.",
    carry: true,
  },
  {
    id: "review",
    title: "Review",
    workerId: "architect",
    prompt:
      "You are the reviewer. Check the implementation for correctness, edge cases, and missing tests.\n\n" +
      "Task:\n{task}\n\n" +
      "Implementation:\n{carry}\n\n" +
      "Return issues and recommended fixes (or say 'no issues').",
    carry: true,
  },
  {
    id: "fix",
    title: "Fix",
    workerId: "coder",
    prompt:
      "Apply fixes based on the review. If no fixes are needed, say 'No changes needed' and restate the final output.\n\n" +
      "Task:\n{task}\n\n" +
      "Review:\n{carry}",
    carry: true,
  },
];

function resolveStep(base: WorkflowStepDefinition | undefined, override: WorkflowStepConfig): WorkflowStepDefinition {
  const prompt = override.prompt ?? base?.prompt ?? "Task:\n{task}";
  return {
    id: override.id,
    title: override.title ?? base?.title ?? override.id,
    workerId: override.workerId ?? base?.workerId ?? "coder",
    prompt,
    carry: typeof override.carry === "boolean" ? override.carry : (base?.carry ?? true),
  };
}

export function buildRooCodeBoomerangWorkflow(overrides?: WorkflowStepConfig[]): WorkflowDefinition {
  let steps = defaultSteps;
  if (overrides && overrides.length > 0) {
    const byId = new Map(defaultSteps.map((s) => [s.id, s]));
    steps = overrides.map((s) => resolveStep(byId.get(s.id), s));
  }

  return {
    id: "roocode-boomerang",
    name: "RooCode Boomerang",
    description: "Plan, implement, review, and fix in a tight loop with bounded carry.",
    steps,
  };
}

```

---

## File: workflows/types.ts

```typescript
export type WorkflowAttachment = {
  type: "image" | "file";
  path?: string;
  base64?: string;
  mimeType?: string;
};

export type WorkflowStepDefinition = {
  id: string;
  title: string;
  workerId: string;
  prompt: string;
  carry?: boolean;
};

export type WorkflowDefinition = {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStepDefinition[];
};

export type WorkflowSecurityLimits = {
  maxSteps: number;
  maxTaskChars: number;
  maxCarryChars: number;
  perStepTimeoutMs: number;
};

export type WorkflowRunInput = {
  workflowId: string;
  task: string;
  attachments?: WorkflowAttachment[];
  autoSpawn?: boolean;
  limits: WorkflowSecurityLimits;
};

export type WorkflowStepResult = {
  id: string;
  title: string;
  workerId: string;
  status: "success" | "error";
  response?: string;
  error?: string;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
};

export type WorkflowRunResult = {
  workflowId: string;
  workflowName: string;
  startedAt: number;
  finishedAt: number;
  steps: WorkflowStepResult[];
};

```

