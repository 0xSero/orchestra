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

    // DELETE /api/sessions/:sessionId - Close a session
    if (segments.length === 3 && req.method === "DELETE") {
      const sessionId = segments[2];
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
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  };
}
