import type { IncomingMessage, ServerResponse } from "node:http";
import type { SkillsService } from "../skills/service";
import type { WorkerManager } from "../workers";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type SkillsRouterDeps = {
  skills: SkillsService;
  workers?: WorkerManager;
};

type ResponseLike = {
  status: number;
  body: JsonValue;
};

function setCors(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function readJson(req: IncomingMessage): Promise<any> {
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

function normalizeScope(value: any) {
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
        const skill = await deps.skills.create(body.input, normalizeScope(body.scope));
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
        const skill = await deps.skills.update(skillId, body.updates ?? {}, normalizeScope(body.scope));
        sendJson(res, 200, skill as unknown as JsonValue);
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : "Failed to update skill" });
      }
      return;
    }

    if (segments.length === 3 && req.method === "DELETE") {
      try {
        const body = await readJson(req);
        await deps.skills.delete(skillId, normalizeScope(body.scope));
        sendJson(res, 200, { success: true });
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : "Failed to delete skill" });
      }
      return;
    }

    if (segments.length === 4 && segments[3] === "duplicate" && req.method === "POST") {
      try {
        const body = await readJson(req);
        const skill = await deps.skills.duplicate(skillId, body.newId, normalizeScope(body.scope));
        sendJson(res, 201, skill as unknown as JsonValue);
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : "Failed to duplicate skill" });
      }
      return;
    }

    if (segments.length === 4 && segments[3] === "spawn" && req.method === "POST") {
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
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  };
}
