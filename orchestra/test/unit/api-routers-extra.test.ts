import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { createDbRouter } from "../../src/api/db-router";
import { createSessionsRouter } from "../../src/api/sessions-router";
import { createSkillsRouter } from "../../src/api/skills-router";
import { createSkillsApiServer } from "../../src/api/skills-server";
import { createSystemRouter } from "../../src/api/system-router";
import { createSkillsEvents } from "../../src/skills/events";
import type { SessionManagerEvent, TrackedSession, WorkerSessionManager } from "../../src/workers";
import type { WorkerManager } from "../../src/workers";
import type { Skill, SkillInput, SkillScope } from "../../src/types";

const withServer = async <T>(handler: Parameters<typeof createServer>[0], run: (baseUrl: string) => Promise<T>) => {
  const server = createServer((req, res) => handler(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    return await run(baseUrl);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
};

const createMockReq = (input: { url?: string; method?: string; body?: string }) => {
  const chunks = input.body ? [Buffer.from(input.body)] : [];
  const asyncIterable = {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
  const events = new Map<string, Array<() => void>>();
  return {
    url: input.url,
    method: input.method,
    on: (event: string, handler: () => void) => {
      const list = events.get(event) ?? [];
      list.push(handler);
      events.set(event, list);
    },
    ...asyncIterable,
  } as unknown as IncomingMessage;
};

const createMockRes = () => {
  const headers = new Map<string, string>();
  const writes: string[] = [];
  const res = {
    statusCode: 0,
    headers,
    writes,
    setHeader: (key: string, value: string) => {
      headers.set(key, value);
    },
    writeHead: (status: number, nextHeaders?: Record<string, string>) => {
      res.statusCode = status;
      if (nextHeaders) {
        for (const [key, value] of Object.entries(nextHeaders)) {
          headers.set(key, value);
        }
      }
    },
    write: (chunk: string) => {
      writes.push(String(chunk));
    },
    end: (chunk?: string) => {
      if (chunk) writes.push(String(chunk));
    },
  } as unknown as ServerResponse & { writes: string[]; headers: Map<string, string> };
  return res;
};

describe("db router extra coverage", () => {
  test("handles missing URL, OPTIONS, and preference edge cases", async () => {
    const now = new Date();
    const prefs = new Map<string, string | null>();
    let preferenceChanged: string | undefined;
    let workerConfigChanged: string | undefined;
    let throwOnWorkerConfig = false;

    const db = {
      getDbPath: () => "/tmp/opencode.db",
      getUser: () => ({ id: "user-1", onboarded: false, createdAt: now, updatedAt: now, onboardedAt: null }),
      getAllPreferences: () => Object.fromEntries(prefs),
      getAllWorkerConfigs: () => [],
      setPreference: (key: string, value: string | null) => {
        prefs.set(key, value);
      },
      deletePreference: (key: string) => {
        prefs.delete(key);
      },
      getWorkerConfig: () => undefined,
      setWorkerConfig: () => {
        if (throwOnWorkerConfig) throw new Error("worker config failed");
      },
      clearWorkerConfig: () => {},
      markOnboarded: () => ({ id: "user-1", onboarded: true, createdAt: now, updatedAt: now, onboardedAt: now }),
    };

    const handler = createDbRouter({
      db: db as never,
      onPreferencesChanged: (key) => {
        preferenceChanged = key;
      },
      onWorkerConfigChanged: (key) => {
        workerConfigChanged = key;
      },
    });

    const missingReq = createMockReq({ method: "GET" });
    const missingRes = createMockRes();
    await handler(missingReq, missingRes);
    expect(missingRes.statusCode).toBe(400);

    await withServer(handler, async (baseUrl) => {
      const optionsRes = await fetch(`${baseUrl}/api/db`, { method: "OPTIONS" });
      expect(optionsRes.status).toBe(204);

      const notFound = await fetch(`${baseUrl}/api/not-db`);
      expect(notFound.status).toBe(404);

      const updateBatch = await fetch(`${baseUrl}/api/db/preferences`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: { theme: "light", mode: null } }),
      });
      expect(updateBatch.status).toBe(200);
      expect(preferenceChanged).toBe("mode");

      const invalidPayload = await fetch(`${baseUrl}/api/db/preferences`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foo: "bar" }),
      });
      expect(invalidPayload.status).toBe(400);

      const invalidJson = await fetch(`${baseUrl}/api/db/preferences`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "{ invalid",
      });
      expect(invalidJson.status).toBe(400);

      const deleted = await fetch(`${baseUrl}/api/db/preferences/theme`, { method: "DELETE" });
      expect(deleted.status).toBe(200);

      const missingWorkerId = await fetch(`${baseUrl}/api/db/worker-config`, { method: "PUT" });
      expect(missingWorkerId.status).toBe(404);

      const invalidWorker = await fetch(`${baseUrl}/api/db/worker-config/worker-1`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify("bad"),
      });
      expect(invalidWorker.status).toBe(400);

      throwOnWorkerConfig = true;
      const workerConfigFail = await fetch(`${baseUrl}/api/db/worker-config/worker-1`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "bad" }),
      });
      expect(workerConfigFail.status).toBe(400);
      throwOnWorkerConfig = false;

      const deleteWorker = await fetch(`${baseUrl}/api/db/worker-config/worker-1`, { method: "DELETE" });
      expect(deleteWorker.status).toBe(200);
      expect(workerConfigChanged).toBe("worker-1");
    });
  });
});

describe("skills router extra coverage", () => {
  test("covers error branches and missing dependencies", async () => {
    const events = createSkillsEvents();
    const skills = {
      events,
      list: async () => {
        throw new Error("list failed");
      },
      get: async () => undefined,
      create: async () => {
        throw new Error("create failed");
      },
      update: async () => {
        throw new Error("update failed");
      },
      delete: async () => {
        throw new Error("delete failed");
      },
      duplicate: async () => {
        throw new Error("duplicate failed");
      },
    };

    const handler = createSkillsRouter({ skills: skills as never });

    const missingReq = createMockReq({ method: "GET" });
    const missingRes = createMockRes();
    await handler(missingReq, missingRes);
    expect(missingRes.statusCode).toBe(400);

    await withServer(handler, async (baseUrl) => {
      const optionsRes = await fetch(`${baseUrl}/api/skills`, { method: "OPTIONS" });
      expect(optionsRes.status).toBe(204);

      const badPrefix = await fetch(`${baseUrl}/api/unknown`);
      expect(badPrefix.status).toBe(404);

      const listRes = await fetch(`${baseUrl}/api/skills`);
      expect(listRes.status).toBe(500);

      const getRes = await fetch(`${baseUrl}/api/skills/missing`);
      expect(getRes.status).toBe(404);

      const missingId = await fetch(`${baseUrl}/api/skills`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: {} }),
      });
      expect(missingId.status).toBe(404);

      const updateRes = await fetch(`${baseUrl}/api/skills/missing`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: {} }),
      });
      expect(updateRes.status).toBe(400);

      const deleteRes = await fetch(`${baseUrl}/api/skills/missing`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(deleteRes.status).toBe(400);

      const duplicateRes = await fetch(`${baseUrl}/api/skills/missing/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newId: "copy" }),
      });
      expect(duplicateRes.status).toBe(400);

      const spawnRes = await fetch(`${baseUrl}/api/skills/missing/spawn`, { method: "POST" });
      expect(spawnRes.status).toBe(501);
    });
  });

  test("handles worker spawn errors", async () => {
    const events = createSkillsEvents();
    const skillsStore = new Map<string, Skill>();
    const skills = {
      events,
      list: async () => Array.from(skillsStore.values()),
      get: async (id: string) => skillsStore.get(id),
      create: async (input: SkillInput, scope: SkillScope) => {
        const skill: Skill = {
          id: input.id,
          frontmatter: { ...input.frontmatter, name: input.frontmatter.name ?? input.id },
          systemPrompt: input.systemPrompt ?? "",
          source: { type: scope },
          filePath: "/tmp/SKILL.md",
          hasScripts: false,
          hasReferences: false,
          hasAssets: false,
        };
        skillsStore.set(skill.id, skill);
        return skill;
      },
      update: async () => {
        throw new Error("update failed");
      },
      delete: async () => true,
      duplicate: async () => {
        throw new Error("duplicate failed");
      },
    };

    const workers = {
      spawnById: async () => {
        throw new Error("spawn failed");
      },
    } as unknown as WorkerManager;

    const handler = createSkillsRouter({ skills, workers });

    await withServer(handler, async (baseUrl) => {
      await fetch(`${baseUrl}/api/skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { id: "alpha", frontmatter: { description: "Alpha", model: "auto" } },
          scope: "project",
        }),
      });

      const spawnRes = await fetch(`${baseUrl}/api/skills/alpha/spawn`, { method: "POST" });
      expect(spawnRes.status).toBe(400);
    });
  });
});

describe("sessions router extra coverage", () => {
  test("covers error branches and event broadcasting", async () => {
    const now = new Date();
    const session: TrackedSession = {
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

    let eventListener: ((event: SessionManagerEvent) => void) | undefined;
    let throwOnSummary = false;
    let throwOnActive = false;
    let throwOnMode = false;
    let throwOnWorker = false;
    let throwOnSession = false;

    const sessionManager = {
      getSummary: () => {
        if (throwOnSummary) throw new Error("summary fail");
        return {
          total: 1,
          byMode: { linked: 1, child: 0, isolated: 0 },
          byStatus: { active: 1, idle: 0, closed: 0, error: 0, busy: 0 },
          sessions: [session],
        };
      },
      getActiveSessions: () => {
        if (throwOnActive) throw new Error("active fail");
        return [session];
      },
      getSessionsByMode: (mode: string) => {
        if (throwOnMode) throw new Error("mode fail");
        return mode === "linked" ? [session] : [];
      },
      getSessionByWorker: () => {
        if (throwOnWorker) throw new Error("worker fail");
        return session;
      },
      getSession: (id: string) => {
        if (throwOnSession) throw new Error("session fail");
        if (id !== session.sessionId) return undefined;
        return session;
      },
      closeSession: () => {},
      on: (handler: (event: SessionManagerEvent) => void) => {
        eventListener = handler;
        return () => {
          eventListener = undefined;
        };
      },
    } as unknown as WorkerSessionManager;

    let stopWorkerSuccess = false;
    const workers = {
      stopWorker: async () => stopWorkerSuccess,
    } as unknown as WorkerManager;

    const handler = createSessionsRouter({ sessionManager, workers });

    const missingReq = createMockReq({ method: "GET" });
    const missingRes = createMockRes();
    await handler(missingReq, missingRes);
    expect(missingRes.statusCode).toBe(400);

    const sseReq = createMockReq({ method: "GET", url: "/api/sessions/events" });
    const sseRes = createMockRes();
    await handler(sseReq, sseRes);
    eventListener?.({
      type: "session.message",
      session,
      activity: session.recentActivity[0],
    });
    expect(sseRes.writes.join("")).toContain("session.message");

    await withServer(handler, async (baseUrl) => {
      const invalidPrefix = await fetch(`${baseUrl}/api/unknown`);
      expect(invalidPrefix.status).toBe(404);

      const optionsRes = await fetch(`${baseUrl}/api/sessions`, { method: "OPTIONS" });
      expect(optionsRes.status).toBe(204);

      throwOnSummary = true;
      const summaryRes = await fetch(`${baseUrl}/api/sessions`);
      expect(summaryRes.status).toBe(500);
      throwOnSummary = false;

      throwOnActive = true;
      const activeRes = await fetch(`${baseUrl}/api/sessions/active`);
      expect(activeRes.status).toBe(500);
      throwOnActive = false;

      throwOnMode = true;
      const modeRes = await fetch(`${baseUrl}/api/sessions/by-mode/linked`);
      expect(modeRes.status).toBe(500);
      throwOnMode = false;

      throwOnWorker = true;
      const workerRes = await fetch(`${baseUrl}/api/sessions/worker/worker-1`);
      expect(workerRes.status).toBe(500);
      throwOnWorker = false;

      throwOnSession = true;
      const sessionRes = await fetch(`${baseUrl}/api/sessions/session-1`);
      expect(sessionRes.status).toBe(500);
      const activityRes = await fetch(`${baseUrl}/api/sessions/session-1/activity`);
      expect(activityRes.status).toBe(500);
      throwOnSession = false;

      const deleteRes = await fetch(`${baseUrl}/api/sessions/session-1`, { method: "DELETE" });
      expect(deleteRes.status).toBe(500);

      const missingActivity = await fetch(`${baseUrl}/api/sessions/unknown/activity`);
      expect(missingActivity.status).toBe(404);

      const deleteMissing = await fetch(`${baseUrl}/api/sessions/unknown`, { method: "DELETE" });
      expect(deleteMissing.status).toBe(404);

      stopWorkerSuccess = true;
      const deleteOk = await fetch(`${baseUrl}/api/sessions/session-1`, { method: "DELETE" });
      expect(deleteOk.status).toBe(200);

      const unknownRes = await fetch(`${baseUrl}/api/sessions/unknown-path`);
      expect(unknownRes.status).toBe(404);
    });
  });
});

describe("system router extra coverage", () => {
  test("handles options, error branches, and kill failures", async () => {
    let scenario = "success";
    const execAsync = async (command: string) => {
      if (command.includes("ps aux")) {
        if (scenario === "ps-error") throw new Error("ps failed");
        return {
          stdout: [
            "root 10 0.1 0.2 1000 2000 ? S 10:00 0:00 opencode",
            "root 20 0.1 0.2 1000 2000 ? S 10:00 0:00 bun serve",
            "root 30 0.1 0.2 1000 2000 ? S 10:00 0:00 opencode serve",
          ].join("\n"),
          stderr: "",
        };
      }
      if (command.startsWith("kill")) {
        if (scenario === "kill-error") throw new Error("kill failed");
        if (scenario === "kill-partial" && command.includes("30")) {
          throw new Error("kill partial");
        }
      }
      return { stdout: "", stderr: "" };
    };

    const handler = createSystemRouter({ execAsync });

    await withServer(handler, async (baseUrl) => {
      const optionsRes = await fetch(`${baseUrl}/api/system/processes`, { method: "OPTIONS" });
      expect(optionsRes.status).toBe(204);

      scenario = "ps-error";
      const psError = await fetch(`${baseUrl}/api/system/processes`);
      const psErrorData = await psError.json();
      expect(psErrorData.count).toBe(0);

      scenario = "success";
      const processes = await fetch(`${baseUrl}/api/system/processes`);
      const processData = await processes.json();
      expect(processData.processes.some((p: { type: string }) => p.type === "opencode-main")).toBe(true);
      expect(processData.processes.some((p: { type: string }) => p.type === "bun")).toBe(true);

      scenario = "kill-error";
      const killRes = await fetch(`${baseUrl}/api/system/processes/10`, { method: "DELETE" });
      expect(killRes.status).toBe(500);

      scenario = "kill-partial";
      const killAllRes = await fetch(`${baseUrl}/api/system/processes/kill-all-serve`, { method: "POST" });
      const killAllData = await killAllRes.json();
      expect(killAllData.errors.length).toBeGreaterThan(0);

      scenario = "ps-error";
      const killAllFail = await fetch(`${baseUrl}/api/system/processes/kill-all-serve`, { method: "POST" });
      const killAllFailData = await killAllFail.json();
      expect(killAllFailData.errors.length).toBe(0);
    });

    const errorHandler = createSystemRouter({
      execAsync,
      getOpencodeProcesses: async () => {
        throw new Error("process scan failed");
      },
    });
    await withServer(errorHandler, async (baseUrl) => {
      const killAll = await fetch(`${baseUrl}/api/system/processes/kill-all-serve`, { method: "POST" });
      const data = await killAll.json();
      expect(data.errors.length).toBeGreaterThan(0);
    });
  });
});

describe("skills API server extra coverage", () => {
  test("handles sessions/system routes and port conflicts", async () => {
    const events = createSkillsEvents();
    const store = new Map<string, Skill>();
    const skills = {
      events,
      list: async () => Array.from(store.values()),
      get: async (id: string) => store.get(id),
      create: async (input: SkillInput, scope: SkillScope) => {
        const skill: Skill = {
          id: input.id,
          frontmatter: { ...input.frontmatter, name: input.frontmatter.name ?? input.id },
          systemPrompt: input.systemPrompt ?? "",
          source: { type: scope },
          filePath: "/tmp/SKILL.md",
          hasScripts: false,
          hasReferences: false,
          hasAssets: false,
        };
        store.set(skill.id, skill);
        return skill;
      },
      update: async (id: string) => store.get(id) as Skill,
      delete: async () => true,
      duplicate: async (id: string, newId: string) => {
        const current = store.get(id) as Skill;
        const clone = { ...current, id: newId };
        store.set(newId, clone);
        return clone;
      },
    };

    const now = new Date();
    const db = {
      getDbPath: () => "/tmp/opencode.db",
      getUser: () => ({ id: "user-1", onboarded: false, createdAt: now, updatedAt: now, onboardedAt: null }),
      getAllPreferences: () => ({ theme: "dark" }),
      getAllWorkerConfigs: () => [],
      setPreference: () => {},
      deletePreference: () => {},
      getWorkerConfig: () => undefined,
      setWorkerConfig: () => {},
      clearWorkerConfig: () => {},
      markOnboarded: () => ({ id: "user-1", onboarded: true, createdAt: now, updatedAt: now, onboardedAt: now }),
    };

    const sessionManager = {
      getSummary: () => ({
        total: 0,
        byMode: { linked: 0, child: 0, isolated: 0 },
        byStatus: { active: 0, idle: 0, closed: 0, error: 0, busy: 0 },
        sessions: [],
      }),
      on: () => () => {},
    } as unknown as WorkerSessionManager;

    const workers = {
      sessionManager,
    } as WorkerManager;

    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as AddressInfo).port;

    const api = createSkillsApiServer({
      config: { port },
      deps: { skills, db: db as never, workers },
    });
    await api.start();
    const baseUrl = api.url!;

    const sessionsRes = await fetch(`${baseUrl}/api/sessions`);
    expect(sessionsRes.status).toBe(200);

    const systemRes = await fetch(`${baseUrl}/api/system/processes`);
    expect(systemRes.status).toBe(200);

    const dbRes = await fetch(`${baseUrl}/api/db`);
    expect(dbRes.status).toBe(200);

    await api.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test("handles startup errors gracefully", async () => {
    const events = createSkillsEvents();
    const skills = {
      events,
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

    const api = createSkillsApiServer({
      config: { port: -1 },
      deps: { skills: skills as never },
    });
    await api.start();
    expect(api.url).toBeDefined();
    await api.stop();
  });

  test("handles non-EADDRINUSE server errors", async () => {
    const events = createSkillsEvents();
    const skills = {
      events,
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

    const server = new EventEmitter() as unknown as Server & EventEmitter;
    server.listen = () => {
      queueMicrotask(() => {
        const err = new Error("listen failed") as NodeJS.ErrnoException;
        err.code = "EACCES";
        server.emit("error", err);
      });
      return server;
    };
    server.close = (cb?: () => void) => {
      cb?.();
      return server;
    };
    server.address = () => null;

    const api = createSkillsApiServer({
      config: { port: 0 },
      deps: {
        skills: skills as never,
        createServer: () => server,
      },
    });
    await api.start();
    expect(api.url).toBeUndefined();
  });
});
