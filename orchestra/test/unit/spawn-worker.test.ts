import { beforeEach, describe, expect, test } from "bun:test";
import type { WorkerProfile } from "../../src/types";
import type { WorkerRegistry } from "../../src/workers/registry";
import { cleanupWorkerInstance, spawnWorker, type SpawnWorkerDeps } from "../../src/workers/spawn";

let resolveProfileModelResult: {
  profile: WorkerProfile;
  changes: Array<{ profileId: string; from: string; to: string; reason: string }>;
  fallbackModel?: string;
};
let workerEnv: Record<string, string> = {};
let workerMcp: Record<string, unknown> | undefined;
let defaultSessionMode: "linked" | "child" | "isolated" = "linked";
let startWorkerServerCalls = 0;
let createWorkerSessionCalls = 0;
let createWorkerSessionResponses: unknown[] = [];
let startEventForwardingCalls = 0;
let stopEventForwardingCalls = 0;
let closeSessionCalls = 0;
let startEventForwardingShouldThrow = false;
let shutdownShouldThrow = false;
let deps: SpawnWorkerDeps;

const baseProfile: WorkerProfile = {
  id: "alpha",
  name: "Alpha",
  model: "model-a",
  purpose: "test",
  whenToUse: "testing",
};

beforeEach(() => {
  resolveProfileModelResult = { profile: { ...baseProfile }, changes: [], fallbackModel: undefined };
  workerEnv = {};
  workerMcp = undefined;
  defaultSessionMode = "linked";
  startWorkerServerCalls = 0;
  createWorkerSessionCalls = 0;
  createWorkerSessionResponses = [];
  startEventForwardingCalls = 0;
  stopEventForwardingCalls = 0;
  closeSessionCalls = 0;
  startEventForwardingShouldThrow = false;
  shutdownShouldThrow = false;

  delete process.env.OPENCODE_WORKER_BRIDGE;
  delete process.env.OPENCODE_WORKER_PLUGIN_PATH;

  deps = {
    resolveProfileModel: async () => resolveProfileModelResult,
    resolveWorkerEnv: () => workerEnv,
    resolveWorkerMcp: async () => workerMcp,
    getDefaultSessionMode: () => defaultSessionMode,
    loadOpenCodeConfig: async () => ({}),
    mergeOpenCodeConfig: async (config) => config,
    getRepoContextForWorker: async () => "repo",
    startEventForwarding: () => {
      startEventForwardingCalls += 1;
      if (startEventForwardingShouldThrow) throw new Error("forward failed");
      return { stop: () => {}, isActive: () => true };
    },
    stopEventForwarding: (instance) => {
      stopEventForwardingCalls += 1;
      if (instance.eventForwardingHandle) {
        instance.eventForwardingHandle.stop();
        instance.eventForwardingHandle = undefined;
      }
    },
    buildBootstrapPromptArgs: (input: { sessionId: string; directory: string }) => ({
      path: { id: input.sessionId },
      body: { parts: [] },
      query: { directory: input.directory },
    }),
    resolveWorkerBridgePluginPath: () => "/tmp/worker-bridge-plugin.mjs",
    normalizePluginPath: (path) => path,
    startWorkerServer: async () => {
      startWorkerServerCalls += 1;
      return {
        client: {
          session: {
            prompt: async () => ({}),
          },
        },
        server: {
          url: `http://127.0.0.1:${4000 + startWorkerServerCalls}`,
          close: () => {},
        },
      };
    },
    createWorkerSession: async () => {
      createWorkerSessionCalls += 1;
      return createWorkerSessionResponses.shift() ?? { data: { id: "session-default" } };
    },
    applyServerBundleToInstance: (
      instance: { shutdown?: () => Promise<void>; serverUrl?: string },
      bundle: { server: { url: string } },
    ) => {
      instance.shutdown = async () => {
        if (shutdownShouldThrow) throw new Error("shutdown failed");
      };
      instance.serverUrl = bundle.server.url;
      return bundle;
    },
  };
});

describe("spawn worker", () => {
  test("marks model resolution as configured when models match", async () => {
    resolveProfileModelResult = { profile: { ...baseProfile, model: "model-a" }, changes: [], fallbackModel: undefined };
    createWorkerSessionResponses = [{ data: { id: "session-configured" } }];

    const registry = { register: () => {}, updateStatus: () => {}, unregister: () => {} } as unknown as WorkerRegistry;
    const instance = await spawnWorker({
      api: {} as never,
      registry,
      directory: "/tmp",
      profile: { ...baseProfile, model: "model-a" },
      timeoutMs: 1000,
      deps,
    });

    expect(instance.modelResolution).toBe("configured");
  });

  test("spawns successfully with callbacks and restores env", async () => {
    const callbacks: string[] = [];
    const registry = { register: () => {}, updateStatus: () => {}, unregister: () => {} } as unknown as WorkerRegistry;

    resolveProfileModelResult = {
      profile: { ...baseProfile, model: "model-x", temperature: 0.7, injectRepoContext: true },
      changes: [{ profileId: "alpha", from: "auto", to: "model-x", reason: "test" }],
      fallbackModel: "model-x",
    };

    workerEnv = { EXISTING_VAR: "new", NEW_VAR: "set" };
    process.env.EXISTING_VAR = "old";
    delete process.env.NEW_VAR;

    workerMcp = { server: { token: "x" } };
    createWorkerSessionResponses = [{ data: { id: "session-1" } }];

    const sessionManager = {
      registerSession: () => callbacks.push("register"),
      closeSession: () => callbacks.push("close"),
    };

    const instance = await spawnWorker({
      api: {} as never,
      registry,
      directory: "/tmp",
      profile: { ...baseProfile, model: "auto" },
      timeoutMs: 1000,
      callbacks: {
        onModelResolved: () => callbacks.push("resolved"),
        onModelFallback: () => callbacks.push("fallback"),
      },
      sessionManager: sessionManager as never,
      communication: {} as never,
      deps,
    });

    expect(instance.status).toBe("ready");
    expect(instance.sessionId).toBe("session-1");
    expect(callbacks).toContain("resolved");
    expect(callbacks).toContain("fallback");
    expect(callbacks).toContain("register");
    expect(startEventForwardingCalls).toBeGreaterThan(0);
    expect(process.env.EXISTING_VAR).toBe("old");
    expect(process.env.NEW_VAR).toBeUndefined();

    delete process.env.EXISTING_VAR;
  });

  test("retries session creation with worker bridge", async () => {
    resolveProfileModelResult = { profile: { ...baseProfile }, changes: [], fallbackModel: undefined };
    createWorkerSessionResponses = [{ error: { message: "worker bridge missing" } }, { data: { id: "session-2" } }];

    const registry = { register: () => {}, updateStatus: () => {}, unregister: () => {} } as unknown as WorkerRegistry;
    const instance = await spawnWorker({
      api: {} as never,
      registry,
      directory: "/tmp",
      profile: { ...baseProfile, model: "auto" },
      timeoutMs: 1000,
      deps,
    });

    expect(instance.sessionId).toBe("session-2");
    expect(startWorkerServerCalls).toBe(2);
    expect(createWorkerSessionCalls).toBe(2);
  });

  test("throws when session creation fails", async () => {
    resolveProfileModelResult = { profile: { ...baseProfile }, changes: [], fallbackModel: undefined };
    createWorkerSessionResponses = [{ error: "session failed" }];
    shutdownShouldThrow = true;

    const registry = { register: () => {}, updateStatus: () => {}, unregister: () => {} } as unknown as WorkerRegistry;

    await expect(
      spawnWorker({
        api: {} as never,
        registry,
        directory: "/tmp",
        profile: { ...baseProfile, model: "auto" },
        timeoutMs: 1000,
        deps,
      }),
    ).rejects.toThrow("session failed");

    expect(stopEventForwardingCalls).toBeGreaterThan(0);
  });

  test("closes sessions when forwarding fails", async () => {
    resolveProfileModelResult = { profile: { ...baseProfile }, changes: [], fallbackModel: undefined };
    createWorkerSessionResponses = [{ data: { id: "session-3" } }];
    startEventForwardingShouldThrow = true;

    const registry = { register: () => {}, updateStatus: () => {}, unregister: () => {} } as unknown as WorkerRegistry;
    const sessionManager = {
      registerSession: () => {},
      closeSession: () => {
        closeSessionCalls += 1;
      },
    };

    await expect(
      spawnWorker({
        api: {} as never,
        registry,
        directory: "/tmp",
        profile: { ...baseProfile, model: "auto" },
        timeoutMs: 1000,
        sessionManager: sessionManager as never,
        communication: {} as never,
        deps,
      }),
    ).rejects.toThrow("forward failed");

    expect(stopEventForwardingCalls).toBeGreaterThan(0);
    expect(closeSessionCalls).toBeGreaterThan(0);
  });

  test("ignores repo context and bootstrap prompt failures", async () => {
    resolveProfileModelResult = {
      profile: { ...baseProfile, model: "auto", injectRepoContext: true },
      changes: [],
      fallbackModel: undefined,
    };
    createWorkerSessionResponses = [{ data: { id: "session-4" } }];

    deps.getRepoContextForWorker = async () => {
      throw new Error("repo failed");
    };
    deps.withTimeout = async () => {
      throw new Error("prompt failed");
    };

    const registry = { register: () => {}, updateStatus: () => {}, unregister: () => {} } as unknown as WorkerRegistry;
    const instance = await spawnWorker({
      api: {} as never,
      registry,
      directory: "/tmp",
      profile: { ...baseProfile, model: "auto" },
      timeoutMs: 1000,
      deps,
    });

    expect(instance.status).toBe("ready");
  });

  test("cleanupWorkerInstance closes tracked sessions", () => {
    stopEventForwardingCalls = 0;
    const sessionManager = { closeSession: () => {} };
    const instance = {
      profile: baseProfile,
      status: "ready",
      port: 0,
      sessionId: "session-9",
      eventForwardingHandle: { stop: () => { stopEventForwardingCalls += 1; }, isActive: () => true },
    };

    cleanupWorkerInstance(instance as never, sessionManager as never);
    expect(stopEventForwardingCalls).toBe(1);
  });
});
