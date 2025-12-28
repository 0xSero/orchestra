import { describe, expect, test } from "bun:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createDbRouter } from "../../src/api/db-router";
import { createSessionsRouter } from "../../src/api/sessions-router";
import { createSkillsRouter } from "../../src/api/skills-router";
import { createSkillsEvents } from "../../src/skills/events";
import type { Skill, SkillInput, SkillScope } from "../../src/types";
import type { SessionManagerEvent, WorkerManager, WorkerSessionManager } from "../../src/workers";

type RequestHandler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

const withServer = async <T>(handler: RequestHandler, run: (baseUrl: string) => Promise<T>) => {
  const server = createServer((req, res) => {
    void handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    return await run(baseUrl);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
};

describe("system router", () => {
  test("returns system process info and handles kill endpoints", async () => {
    const stdout = [
      "root 123 0.1 0.2 1000 2000 ? S 10:00 0:00 opencode serve",
      "root 456 0.0 0.1 1000 1000 ? S 10:00 0:00 vite",
    ].join("\n");

    const { createSystemRouter } = await import("../../src/api/system-router");
    const handler = createSystemRouter({
      execAsync: async (cmd) => {
        if (cmd.includes("ps aux")) {
          return { stdout, stderr: "" };
        }
        return { stdout: "", stderr: "" };
      },
    });

    await withServer(handler, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/system/processes`);
      const data = (await res.json()) as { count: number; processes: Array<{ type: string }> };
      expect(data.count).toBe(2);
      expect(data.processes[0].type).toBe("opencode-serve");

      const killRes = await fetch(`${baseUrl}/api/system/processes/123`, { method: "DELETE" });
      const killData = (await killRes.json()) as { success: boolean };
      expect(killData.success).toBe(true);

      const killAllRes = await fetch(`${baseUrl}/api/system/processes/kill-all-serve`, { method: "POST" });
      const killAllData = (await killAllRes.json()) as { killed: number };
      expect(killAllData.killed).toBe(1);

      const missingRes = await fetch(`${baseUrl}/api/system/missing`);
      expect(missingRes.status).toBe(404);
    });
  });
});

describe("skills router", () => {
  test("handles CRUD routes and events", async () => {
    const events = createSkillsEvents();
    const store = new Map<string, Skill>();
    const buildSource = (scope: SkillScope): Skill["source"] =>
      scope === "global"
        ? { type: "global", path: "/tmp/opencode-skills" }
        : { type: "project", path: "/tmp/opencode-skills" };
    const buildSkill = (input: SkillInput, scope: SkillScope): Skill => {
      const name = input.frontmatter.name ?? input.id;
      const source = buildSource(scope);
      return {
        id: input.id,
        frontmatter: { ...input.frontmatter, name },
        systemPrompt: input.systemPrompt ?? "",
        source,
        filePath: "/tmp/SKILL.md",
        hasScripts: false,
        hasReferences: false,
        hasAssets: false,
      };
    };

    const skillsService = {
      events,
      list: async () => Array.from(store.values()),
      get: async (id: string) => store.get(id),
      create: async (input: SkillInput, scope: SkillScope) => {
        const skill = buildSkill(input, scope);
        store.set(skill.id, skill);
        events.emit({ type: "skill.created", skill });
        return skill;
      },
      update: async (id: string, updates: Partial<SkillInput>, scope: SkillScope) => {
        const current = store.get(id);
        if (!current) throw new Error("missing");
        const updated = {
          ...current,
          frontmatter: { ...current.frontmatter, ...updates.frontmatter, name: id },
          source: buildSource(scope),
          systemPrompt: updates.systemPrompt ?? current.systemPrompt,
        };
        store.set(id, updated);
        events.emit({ type: "skill.updated", skill: updated });
        return updated;
      },
      delete: async (id: string) => store.delete(id),
      duplicate: async (sourceId: string, newId: string, scope: SkillScope) => {
        const current = store.get(sourceId);
        if (!current) throw new Error("missing");
        const clone = {
          ...current,
          id: newId,
          source: buildSource(scope),
        };
        store.set(newId, clone);
        events.emit({ type: "skill.created", skill: clone });
        return clone;
      },
    };

    const workers = {
      spawnById: async (skillId: string) => ({
        profile: { id: skillId, model: "model-a" },
        status: "ready",
        port: 4000,
      }),
    } as unknown as WorkerManager;

    const handler = createSkillsRouter({ skills: skillsService, workers });

    await withServer(handler, async (baseUrl) => {
      const listRes = await fetch(`${baseUrl}/api/skills`);
      expect(listRes.status).toBe(200);

      const createRes = await fetch(`${baseUrl}/api/skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { id: "alpha", frontmatter: { description: "Alpha", model: "auto" }, systemPrompt: "Hello" },
          scope: "project",
        }),
      });
      expect(createRes.status).toBe(201);

      const getRes = await fetch(`${baseUrl}/api/skills/alpha`);
      const getData = (await getRes.json()) as { id: string };
      expect(getData.id).toBe("alpha");

      const updateRes = await fetch(`${baseUrl}/api/skills/alpha`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: { frontmatter: { description: "Updated", model: "auto" } }, scope: "project" }),
      });
      expect(updateRes.status).toBe(200);

      const duplicateRes = await fetch(`${baseUrl}/api/skills/alpha/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newId: "alpha-copy", scope: "project" }),
      });
      expect(duplicateRes.status).toBe(201);

      const badDuplicate = await fetch(`${baseUrl}/api/skills/alpha/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(badDuplicate.status).toBe(400);

      const spawnRes = await fetch(`${baseUrl}/api/skills/alpha/spawn`, { method: "POST" });
      expect(spawnRes.status).toBe(201);

      const deleteRes = await fetch(`${baseUrl}/api/skills/alpha`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "project" }),
      });
      expect(deleteRes.status).toBe(200);

      const controller = new AbortController();
      const eventsRes = await fetch(`${baseUrl}/api/skills/events`, { signal: controller.signal });
      expect(eventsRes.headers.get("content-type")).toContain("text/event-stream");
      await eventsRes.body?.cancel();
      controller.abort();
    });
  });
});

describe("sessions router", () => {
  test("serves session endpoints", async () => {
    const now = new Date();
    const session = {
      workerId: "worker-1",
      sessionId: "session-1",
      mode: "linked",
      parentSessionId: undefined,
      serverUrl: "http://localhost",
      createdAt: now,
      lastActivity: now,
      status: "active",
      messageCount: 1,
      toolCount: 2,
      recentActivity: [
        {
          id: "act-1",
          type: "message",
          timestamp: now,
          summary: "Hello",
          details: { key: "value" },
        },
      ],
    };

    const listeners = new Set<(event: SessionManagerEvent) => void>();
    const sessionManager = {
      getSummary: () => ({
        total: 1,
        byMode: { linked: 1, child: 0, isolated: 0 },
        byStatus: { active: 1, idle: 0, closed: 0, error: 0 },
        sessions: [session],
      }),
      getActiveSessions: () => [session],
      getSessionsByMode: (mode: string) => (mode === "linked" ? [session] : []),
      getSessionByWorker: (workerId: string) => (workerId === "worker-1" ? session : undefined),
      getSession: (sessionId: string) => (sessionId === "session-1" ? session : undefined),
      closeSession: () => {},
      on: (handler: (event: SessionManagerEvent) => void) => {
        listeners.add(handler);
        return () => listeners.delete(handler);
      },
    } as unknown as WorkerSessionManager;

    const workers = {
      stopWorker: async () => true,
    } as unknown as WorkerManager;

    const handler = createSessionsRouter({ sessionManager, workers });

    await withServer(handler, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/sessions`);
      expect(res.status).toBe(200);

      const activeRes = await fetch(`${baseUrl}/api/sessions/active`);
      expect(activeRes.status).toBe(200);

      const modeRes = await fetch(`${baseUrl}/api/sessions/by-mode/linked`);
      expect(modeRes.status).toBe(200);

      const badMode = await fetch(`${baseUrl}/api/sessions/by-mode/invalid`);
      expect(badMode.status).toBe(400);

      const workerRes = await fetch(`${baseUrl}/api/sessions/worker/worker-1`);
      expect(workerRes.status).toBe(200);

      const missingWorker = await fetch(`${baseUrl}/api/sessions/worker/none`);
      expect(missingWorker.status).toBe(404);

      const sessionRes = await fetch(`${baseUrl}/api/sessions/session-1`);
      expect(sessionRes.status).toBe(200);

      const missingSession = await fetch(`${baseUrl}/api/sessions/missing`);
      expect(missingSession.status).toBe(404);

      const activityRes = await fetch(`${baseUrl}/api/sessions/session-1/activity?limit=1&offset=0`);
      expect(activityRes.status).toBe(200);

      const deleteRes = await fetch(`${baseUrl}/api/sessions/session-1`, { method: "DELETE" });
      expect(deleteRes.status).toBe(200);

      const controller = new AbortController();
      const eventsRes = await fetch(`${baseUrl}/api/sessions/events`, { signal: controller.signal });
      expect(eventsRes.headers.get("content-type")).toContain("text/event-stream");
      await eventsRes.body?.cancel();
      controller.abort();
    });
  });
});

describe("db router and skills server", () => {
  test("handles snapshot, preferences, worker config, and onboarding", async () => {
    const now = new Date();
    const workerConfig = {
      id: "cfg-1",
      userId: "user-1",
      workerId: "worker-1",
      model: "model-a",
      temperature: 0.5,
      maxTokens: 1000,
      enabled: true,
      updatedAt: now,
    };

    const db = {
      getDbPath: () => "/tmp/opencode.db",
      getUser: () => ({ id: "user-1", onboarded: false, createdAt: now, updatedAt: now, onboardedAt: null }),
      getAllPreferences: () => ({ theme: "dark" }),
      getAllWorkerConfigs: () => [workerConfig],
      getAllWorkerStates: () => [],
      setPreference: () => {},
      deletePreference: () => {},
      getWorkerConfig: () => workerConfig,
      setWorkerConfig: () => {},
      clearWorkerConfig: () => {},
      markOnboarded: () => ({ id: "user-1", onboarded: true, createdAt: now, updatedAt: now, onboardedAt: now }),
    };

    const handler = createDbRouter({ db: db as never });

    await withServer(handler, async (baseUrl) => {
      const snapshot = await fetch(`${baseUrl}/api/db`);
      expect(snapshot.status).toBe(200);

      const prefs = await fetch(`${baseUrl}/api/db/preferences`);
      expect(prefs.status).toBe(200);

      const updatePref = await fetch(`${baseUrl}/api/db/preferences`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "theme", value: "light" }),
      });
      expect(updatePref.status).toBe(200);

      const badPref = await fetch(`${baseUrl}/api/db/preferences`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "theme", value: { bad: true } }),
      });
      expect(badPref.status).toBe(400);

      const workerList = await fetch(`${baseUrl}/api/db/worker-config`);
      expect(workerList.status).toBe(200);

      const updateWorker = await fetch(`${baseUrl}/api/db/worker-config/worker-1`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "model-b", temperature: 0.7 }),
      });
      expect(updateWorker.status).toBe(200);

      const onboard = await fetch(`${baseUrl}/api/db/onboarded`, { method: "POST" });
      expect(onboard.status).toBe(200);

      const controller = new AbortController();
      const eventsRes = await fetch(`${baseUrl}/api/db/events`, { signal: controller.signal });
      expect(eventsRes.headers.get("content-type")).toContain("text/event-stream");
      await eventsRes.body?.cancel();
      controller.abort();
    });
  });

  test("routes missing db and sessions endpoints", async () => {
    const skills = {
      events: createSkillsEvents(),
      list: async () => [],
      get: async () => undefined,
      create: async () => {
        throw new Error("not used");
      },
      update: async () => {
        throw new Error("not used");
      },
      delete: async () => false,
      duplicate: async () => {
        throw new Error("not used");
      },
    };

    const { createSkillsApiServer } = await import("../../src/api/skills-server");
    const api = createSkillsApiServer({ config: { port: 0 }, deps: { skills } });
    await api.start();
    const baseUrl = api.url!;

    const dbRes = await fetch(`${baseUrl}/api/db`);
    expect(dbRes.status).toBe(501);

    const sessionsRes = await fetch(`${baseUrl}/api/sessions`);
    expect(sessionsRes.status).toBe(501);

    await api.stop();
  });
});
