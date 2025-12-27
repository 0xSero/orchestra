import { afterAll, beforeAll, beforeEach, describe, expect, test, mock } from "bun:test";
import type { WorkerProfile } from "../../src/types";
import type { WorkerRegistry } from "../../src/workers/registry";

let resolveProfileModelResult: { profile: WorkerProfile; changes: Array<{ profileId: string; from: string; to: string; reason: string }>; fallbackModel?: string };
let workerEnv: Record<string, string> = {};
let workerMcp: Record<string, unknown> | undefined;
let bridgePath: string | undefined = "/bridge";
let defaultSessionMode: "linked" | "child" | "isolated" = "linked";
let startWorkerServerCalls = 0;
let createWorkerSessionCalls = 0;
let createWorkerSessionResponses: unknown[] = [];
let startEventForwardingCalls = 0;
let stopEventForwardingCalls = 0;
let closeSessionCalls = 0;
let startEventForwardingShouldThrow = false;
let shutdownShouldThrow = false;
let extractSdkErrorMessageValue: string | undefined;

const baseProfile: WorkerProfile = {
  id: "alpha",
  name: "Alpha",
  model: "model-a",
  purpose: "test",
  whenToUse: "testing",
};

const setupMocks = () => {
  mock.module("../../src/workers/spawn-model", () => ({
    resolveProfileModel: async () => resolveProfileModelResult,
  }));

  mock.module("../../src/ux/repo-context", () => ({
    getRepoContextForWorker: async () => "repo",
  }));

  mock.module("../../src/workers/event-forwarding", () => ({
    startEventForwarding: () => {
      startEventForwardingCalls += 1;
      if (startEventForwardingShouldThrow) throw new Error("forward failed");
      return { stop: () => {}, isActive: () => true };
    },
    stopEventForwarding: () => {
      stopEventForwardingCalls += 1;
    },
  }));

  mock.module("../../src/workers/spawn-bootstrap", () => ({
    buildBootstrapPromptArgs: (input: { sessionId: string; directory: string }) => ({
      path: { id: input.sessionId },
      body: { parts: [] },
      query: { directory: input.directory },
    }),
  }));

  mock.module("../../src/workers/spawn-env", () => ({
    getDefaultSessionMode: () => defaultSessionMode,
    resolveWorkerEnv: () => workerEnv,
    resolveWorkerMcp: async () => workerMcp,
  }));

  mock.module("../../src/workers/spawn-helpers", () => ({
    extractSdkData: (value: unknown) => {
      if (value && typeof value === "object" && "data" in (value as Record<string, unknown>)) {
        return (value as { data?: unknown }).data ?? value;
      }
      return value;
    },
    extractSdkErrorMessage: () => extractSdkErrorMessageValue,
    isValidPort: () => false,
    withTimeout: async <T>(promise: Promise<T>) => promise,
  }));

  mock.module("../../src/workers/spawn-plugin", () => ({
    normalizePluginPath: (value: string | undefined) => value,
    resolveWorkerBridgePluginPath: () => bridgePath,
  }));

  mock.module("../../src/workers/spawn-server", () => ({
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
    applyServerBundleToInstance: (instance: { shutdown?: () => Promise<void>; serverUrl?: string }, bundle: { server: { url: string } }) => {
      instance.shutdown = async () => {
        if (shutdownShouldThrow) throw new Error("shutdown failed");
      };
      instance.serverUrl = bundle.server.url;
      return bundle;
    },
  }));
};

let spawnWorker: typeof import("../../src/workers/spawn").spawnWorker;
let cleanupWorkerInstance: typeof import("../../src/workers/spawn").cleanupWorkerInstance;

describe("spawn worker", () => {
  beforeAll(async () => {
    setupMocks();
    ({ spawnWorker, cleanupWorkerInstance } = await import("../../src/workers/spawn"));
  });

  beforeEach(() => {
    resolveProfileModelResult = { profile: { ...baseProfile }, changes: [], fallbackModel: undefined };
    workerEnv = {};
    workerMcp = undefined;
    bridgePath = "/bridge";
    defaultSessionMode = "linked";
    startWorkerServerCalls = 0;
    createWorkerSessionCalls = 0;
    createWorkerSessionResponses = [];
    startEventForwardingCalls = 0;
    stopEventForwardingCalls = 0;
    closeSessionCalls = 0;
    startEventForwardingShouldThrow = false;
    shutdownShouldThrow = false;
    extractSdkErrorMessageValue = undefined;
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
    extractSdkErrorMessageValue = undefined;
    createWorkerSessionResponses = [{ data: { id: "session-1" } }];

    process.env.OPENCODE_WORKER_BRIDGE = "1";

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
    });

    expect(instance.status).toBe("ready");
    expect(instance.sessionId).toBe("session-1");
    expect(callbacks).toContain("resolved");
    expect(callbacks).toContain("fallback");
    expect(callbacks).toContain("register");
    expect(startEventForwardingCalls).toBeGreaterThan(0);
    expect(process.env.EXISTING_VAR).toBe("old");
    expect(process.env.NEW_VAR).toBeUndefined();

    delete process.env.OPENCODE_WORKER_BRIDGE;
    delete process.env.EXISTING_VAR;
  });

  test("retries session creation with worker bridge", async () => {
    resolveProfileModelResult = { profile: { ...baseProfile }, changes: [], fallbackModel: undefined };
    extractSdkErrorMessageValue = "worker bridge missing";
    createWorkerSessionResponses = [{ error: "bridge" }, { data: { id: "session-2" } }];

    const registry = { register: () => {}, updateStatus: () => {}, unregister: () => {} } as unknown as WorkerRegistry;
    const instance = await spawnWorker({
      api: {} as never,
      registry,
      directory: "/tmp",
      profile: { ...baseProfile, model: "auto" },
      timeoutMs: 1000,
    });

    expect(instance.sessionId).toBe("session-2");
    expect(startWorkerServerCalls).toBe(2);
    expect(createWorkerSessionCalls).toBe(2);
  });

  test("throws when session creation fails", async () => {
    resolveProfileModelResult = { profile: { ...baseProfile }, changes: [], fallbackModel: undefined };
    extractSdkErrorMessageValue = "session failed";
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
      }),
    ).rejects.toThrow("forward failed");

    expect(stopEventForwardingCalls).toBeGreaterThan(0);
    expect(closeSessionCalls).toBeGreaterThan(0);
  });

  test("cleanupWorkerInstance closes tracked sessions", () => {
    const sessionManager = { closeSession: () => {} };
    cleanupWorkerInstance({ profile: baseProfile, status: "ready", port: 0, sessionId: "session-9" } as never, sessionManager as never);
    expect(stopEventForwardingCalls).toBe(1);
  });
});

afterAll(() => {
  mock.restore();
});
