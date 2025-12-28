import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSkillsApiServer } from "../src/api/skills-server";
import { createSkillsService } from "../src/skills/service";
import { setupE2eEnv } from "./helpers/e2e-env";

type TestUser = {
  id: string;
  onboarded: boolean;
  onboardedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type TestWorkerConfig = {
  id: string;
  userId: string;
  workerId: string;
  model: string | null;
  temperature: number | null;
  maxTokens: number | null;
  enabled: boolean;
  updatedAt: Date;
};

type TestWorkerState = {
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

function createTestDb() {
  let user: TestUser | null = null;
  const preferences = new Map<string, string | null>();
  const workerConfigs = new Map<string, TestWorkerConfig>();
  const workerStates = new Map<string, TestWorkerState>();
  const dbPath = "memory://opencode-test";

  const ensureUser = () => {
    if (user) return user;
    const now = new Date();
    user = {
      id: `user-${Math.random().toString(36).slice(2, 10)}`,
      onboarded: false,
      onboardedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    return user;
  };

  return {
    start: async () => {
      ensureUser();
    },
    stop: async () => {},
    health: async () => ({ ok: true }),
    getUser: () => user,
    createUser: () => ensureUser(),
    markOnboarded: () => {
      const next = ensureUser();
      const now = new Date();
      user = { ...next, onboarded: true, onboardedAt: now, updatedAt: now };
      return user;
    },
    getPreference: (key: string) => preferences.get(key) ?? null,
    setPreference: (key: string, value: string | null) => {
      preferences.set(key, value ?? null);
    },
    getAllPreferences: () => Object.fromEntries(preferences),
    deletePreference: (key: string) => {
      preferences.delete(key);
    },
    getWorkerConfig: (workerId: string) => workerConfigs.get(workerId) ?? null,
    setWorkerConfig: (
      workerId: string,
      config: { model?: string | null; temperature?: number | null; maxTokens?: number | null; enabled?: boolean },
    ) => {
      const next = workerConfigs.get(workerId) ?? {
        id: `cfg-${Math.random().toString(36).slice(2, 10)}`,
        userId: ensureUser().id,
        workerId,
        model: null,
        temperature: null,
        maxTokens: null,
        enabled: true,
        updatedAt: new Date(),
      };
      const updated: TestWorkerConfig = {
        ...next,
        model: config.model ?? next.model,
        temperature: config.temperature ?? next.temperature,
        maxTokens: config.maxTokens ?? next.maxTokens,
        enabled: config.enabled ?? next.enabled,
        updatedAt: new Date(),
      };
      workerConfigs.set(workerId, updated);
    },
    getAllWorkerConfigs: () => Array.from(workerConfigs.values()),
    clearWorkerConfig: (workerId: string) => {
      workerConfigs.delete(workerId);
    },
    getWorkerState: (workerId: string) => workerStates.get(workerId) ?? null,
    setWorkerState: (state: {
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
      lastResult?: TestWorkerState["lastResult"] | null;
      lastResultAt?: Date | null;
      lastResultJobId?: string | null;
      lastResultDurationMs?: number | null;
      error?: string | null;
      warning?: string | null;
    }) => {
      const now = new Date();
      const existing = workerStates.get(state.workerId);
      workerStates.set(state.workerId, {
        id: existing?.id ?? `state-${Math.random().toString(36).slice(2, 10)}`,
        userId: ensureUser().id,
        workerId: state.workerId,
        profileName: state.profileName ?? existing?.profileName ?? null,
        model: state.model ?? existing?.model ?? null,
        serverUrl: state.serverUrl ?? existing?.serverUrl ?? null,
        sessionId: state.sessionId ?? existing?.sessionId ?? null,
        uiSessionId: state.uiSessionId ?? existing?.uiSessionId ?? null,
        status: state.status ?? existing?.status ?? null,
        sessionMode: state.sessionMode ?? existing?.sessionMode ?? null,
        parentSessionId: state.parentSessionId ?? existing?.parentSessionId ?? null,
        startedAt: state.startedAt ?? existing?.startedAt ?? null,
        lastActivity: state.lastActivity ?? existing?.lastActivity ?? null,
        currentTask: state.currentTask ?? existing?.currentTask ?? null,
        lastResult: state.lastResult ?? existing?.lastResult ?? null,
        lastResultAt: state.lastResultAt ?? existing?.lastResultAt ?? null,
        lastResultJobId: state.lastResultJobId ?? existing?.lastResultJobId ?? null,
        lastResultDurationMs: state.lastResultDurationMs ?? existing?.lastResultDurationMs ?? null,
        error: state.error ?? existing?.error ?? null,
        warning: state.warning ?? existing?.warning ?? null,
        updatedAt: now,
      });
    },
    getAllWorkerStates: () => Array.from(workerStates.values()),
    clearWorkerState: (workerId: string) => {
      workerStates.delete(workerId);
    },
    isOnboarded: () => ensureUser().onboarded,
    getDbPath: () => dbPath,
  };
}

async function waitForSse(baseUrl: string, matcher: RegExp, timeoutMs = 4000) {
  return await new Promise<string>((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for SSE event"));
    }, timeoutMs);

    const req = request(`${baseUrl}/api/db/events`, (res) => {
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        buffer += chunk;
        if (matcher.test(buffer)) {
          clearTimeout(timer);
          resolve(buffer);
          req.destroy();
        }
      });
    });

    req.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    req.end();
  });
}

describe("db api e2e", () => {
  let restoreEnv: (() => void) | undefined;
  let projectDir: string;
  let homeDir: string;

  beforeAll(async () => {
    const env = await setupE2eEnv();
    restoreEnv = env.restore;
    projectDir = await mkdtemp(join(tmpdir(), "orch-db-e2e-project-"));
    homeDir = await mkdtemp(join(tmpdir(), "orch-db-e2e-home-"));
    process.env.OPENCODE_SKILLS_HOME = homeDir;
  });

  afterAll(() => {
    delete process.env.OPENCODE_SKILLS_HOME;
    restoreEnv?.();
  });

  test("supports snapshots, preferences, and onboarding", async () => {
    const skills = createSkillsService(projectDir);
    const db = createTestDb();
    await db.start();
    const api = createSkillsApiServer({ config: { port: 0 }, deps: { skills, db } });
    await api.start();

    try {
      const baseUrl = api.url!;
      const snapshotRes = await fetch(`${baseUrl}/api/db`);
      expect(snapshotRes.status).toBe(200);
      const snapshot = (await snapshotRes.json()) as {
        dbPath: string;
        user: { onboarded: boolean } | null;
        preferences: Record<string, string | null>;
      };
      expect(snapshot.dbPath).toBe("memory://opencode-test");
      expect(snapshot.user?.onboarded).toBe(false);
      expect(Object.keys(snapshot.preferences).length).toBe(0);

      const setPrefRes = await fetch(`${baseUrl}/api/db/preferences`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "onboarding.completed", value: "true" }),
      });
      expect(setPrefRes.status).toBe(200);
      const prefSnapshot = (await setPrefRes.json()) as { preferences: Record<string, string | null> };
      expect(prefSnapshot.preferences["onboarding.completed"]).toBe("true");

      const listPrefRes = await fetch(`${baseUrl}/api/db/preferences`);
      const prefs = (await listPrefRes.json()) as Record<string, string | null>;
      expect(prefs["onboarding.completed"]).toBe("true");

      const deletePrefRes = await fetch(`${baseUrl}/api/db/preferences/onboarding.completed`, {
        method: "DELETE",
      });
      expect(deletePrefRes.status).toBe(200);
      const prefsAfterDelete = (await (await fetch(`${baseUrl}/api/db/preferences`)).json()) as Record<
        string,
        string | null
      >;
      expect(prefsAfterDelete["onboarding.completed"]).toBeUndefined();

      const onboardRes = await fetch(`${baseUrl}/api/db/onboarded`, { method: "POST" });
      expect(onboardRes.status).toBe(200);
      const onboarded = (await onboardRes.json()) as { onboarded: boolean };
      expect(onboarded.onboarded).toBe(true);
    } finally {
      await api.stop();
      await db.stop();
    }
  });

  test("updates worker config and emits snapshots", async () => {
    const skills = createSkillsService(projectDir);
    const db = createTestDb();
    await db.start();
    const api = createSkillsApiServer({ config: { port: 0 }, deps: { skills, db } });
    await api.start();

    try {
      const baseUrl = api.url!;
      const ssePromise = waitForSse(baseUrl, /"workerId":"demo-worker"/);

      const updateRes = await fetch(`${baseUrl}/api/db/worker-config/demo-worker`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "opencode/gpt-5-nano",
          temperature: 0.35,
          maxTokens: 512,
          enabled: false,
        }),
      });
      expect(updateRes.status).toBe(200);

      await ssePromise;

      const configRes = await fetch(`${baseUrl}/api/db/worker-config/demo-worker`);
      expect(configRes.status).toBe(200);
      const config = (await configRes.json()) as {
        workerId: string;
        model: string | null;
        temperature: number | null;
        maxTokens: number | null;
        enabled: boolean;
      };
      expect(config.workerId).toBe("demo-worker");
      expect(config.model).toBe("opencode/gpt-5-nano");
      expect(config.temperature).toBe(0.35);
      expect(config.maxTokens).toBe(512);
      expect(config.enabled).toBe(false);

      const listRes = await fetch(`${baseUrl}/api/db/worker-config`);
      const list = (await listRes.json()) as Array<{ workerId: string }>;
      expect(list.some((entry) => entry.workerId === "demo-worker")).toBe(true);

      const deleteRes = await fetch(`${baseUrl}/api/db/worker-config/demo-worker`, { method: "DELETE" });
      expect(deleteRes.status).toBe(200);

      const missingRes = await fetch(`${baseUrl}/api/db/worker-config/demo-worker`);
      expect(missingRes.status).toBe(404);
    } finally {
      await api.stop();
      await db.stop();
    }
  });
});
