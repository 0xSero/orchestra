import { describe, expect, test } from "bun:test";
import type { WorkerInstance, WorkerProfile } from "../../src/types";
import { createWorkerManager } from "../../src/workers/manager";

describe("worker manager", () => {
  test("requires api dependency", () => {
    expect(() =>
      createWorkerManager({
        config: {
          basePort: 10000,
          timeout: 1000,
          directory: process.cwd(),
          profiles: {},
        },
        deps: {},
      }),
    ).toThrow("requires api");
  });

  test("spawns workers, reuses existing instances, and emits events", async () => {
    const events: string[] = [];
    const profiles: Record<string, WorkerProfile> = {
      alpha: {
        id: "alpha",
        name: "Alpha",
        model: "model-a",
        purpose: "test",
        whenToUse: "testing",
      },
    };

    const spawnWorker = async (input: {
      registry: { register: (instance: WorkerInstance) => void };
      profile: WorkerProfile;
      callbacks?: {
        onModelResolved?: (change: { profileId: string; from: string; to: string; reason: string }) => void;
        onModelFallback?: (profileId: string, model: string, reason: string) => void;
      };
    }) => {
      input.callbacks?.onModelResolved?.({ profileId: input.profile.id, from: "a", to: "b", reason: "test" });
      input.callbacks?.onModelFallback?.(input.profile.id, input.profile.model, "fallback");
      const instance: WorkerInstance = {
        profile: input.profile,
        status: "ready",
        port: 1234,
        directory: process.cwd(),
        startedAt: new Date(),
        sessionId: "session-1",
      };
      input.registry.register(instance);
      return instance;
    };

    const manager = createWorkerManager({
      config: {
        basePort: 10000,
        timeout: 1000,
        directory: process.cwd(),
        profiles,
      },
      deps: {
        api: {} as never,
        communication: {
          emit: (type: string) => events.push(type),
        } as never,
        spawnWorker: spawnWorker as never,
      },
    });
    const health = await manager.health();
    expect(health.ok).toBe(true);

    const first = await manager.spawnById("alpha");
    const second = await manager.spawnById("alpha");

    expect(first).toBe(second);
    expect(manager.getProfile("alpha")?.id).toBe("alpha");
    expect(manager.listProfiles().length).toBe(1);
    expect(events).toContain("orchestra.worker.reused");
    expect(events).toContain("orchestra.model.resolved");
    expect(events).toContain("orchestra.model.fallback");
  });

  test("rejects missing or disabled profiles", async () => {
    const profiles: Record<string, WorkerProfile> = {
      disabled: {
        id: "disabled",
        name: "Disabled",
        model: "model-a",
        purpose: "test",
        whenToUse: "testing",
        enabled: false,
      },
    };

    const manager = createWorkerManager({
      config: {
        basePort: 10000,
        timeout: 1000,
        directory: process.cwd(),
        profiles,
      },
      deps: { api: {} as never },
    });

    await expect(manager.spawnById("missing")).rejects.toThrow("Unknown worker profile");
    await expect(manager.spawnById("disabled")).rejects.toThrow("disabled by configuration");
  });

  test("sends messages with memory hooks and stops workers", async () => {
    const profiles: Record<string, WorkerProfile> = {
      alpha: {
        id: "alpha",
        name: "Alpha",
        model: "model-a",
        purpose: "test",
        whenToUse: "testing",
      },
    };

    let injected = 0;
    let recorded = 0;
    const memory = {
      enabled: true,
      inject: async () => {
        injected += 1;
        return true;
      },
      record: async () => {
        recorded += 1;
      },
    };

    const sendWorkerMessage = async (input: {
      registry: { get: (id: string) => WorkerInstance | undefined };
      beforePrompt?: (instance: WorkerInstance) => Promise<void>;
    }) => {
      const instance = input.registry.get("alpha")!;
      if (input.beforePrompt) await input.beforePrompt(instance);
      return { success: true, response: "ok" };
    };

    let cleaned = false;
    const cleanupWorkerInstance = () => {
      cleaned = true;
    };

    const manager = createWorkerManager({
      config: {
        basePort: 10000,
        timeout: 1000,
        directory: process.cwd(),
        profiles,
      },
      deps: {
        api: {} as never,
        memory: memory as never,
        sendWorkerMessage: sendWorkerMessage as never,
        cleanupWorkerInstance: cleanupWorkerInstance as never,
        spawnWorker: async (input: {
          registry: { register: (instance: WorkerInstance) => void };
          profile: WorkerProfile;
        }) => {
          const instance: WorkerInstance = {
            profile: input.profile,
            status: "ready",
            port: 0,
            directory: process.cwd(),
            startedAt: new Date(),
            sessionId: "session-1",
            client: {} as never,
          };
          input.registry.register(instance);
          return instance;
        },
      },
    });

    await manager.spawnById("alpha");
    const result = await manager.send("alpha", "hello", { from: "tester" });
    expect(result.success).toBe(true);
    expect(injected).toBe(1);
    expect(recorded).toBeGreaterThan(0);
    expect(manager.getWorker("alpha")?.profile.id).toBe("alpha");
    expect(manager.listWorkers().length).toBe(1);
    expect(manager.getSummary()).toContain("alpha");

    const stopped = await manager.stopWorker("alpha");
    expect(stopped).toBe(true);
    expect(cleaned).toBe(true);

    const missingStop = await manager.stopWorker("missing");
    expect(missingStop).toBe(false);
  });

  test("emits subagent events when sending with parent session", async () => {
    const events: string[] = [];
    const profiles: Record<string, WorkerProfile> = {
      alpha: {
        id: "alpha",
        name: "Alpha",
        model: "model-a",
        purpose: "test",
        whenToUse: "testing",
      },
    };

    const manager = createWorkerManager({
      config: {
        basePort: 10000,
        timeout: 1000,
        directory: process.cwd(),
        profiles,
      },
      deps: {
        api: {
          session: {
            create: async () => ({ data: { id: "ui-session-1" } }),
            prompt: async () => ({ data: { id: "msg-1" } }),
          },
        } as never,
        communication: {
          emit: (type: string) => events.push(type),
        } as never,
        sendWorkerMessage: async () => ({ success: true, response: "ok" }),
        spawnWorker: async (input: {
          registry: { register: (instance: WorkerInstance) => void };
          profile: WorkerProfile;
        }) => {
          const instance: WorkerInstance = {
            profile: input.profile,
            status: "ready",
            port: 0,
            directory: process.cwd(),
            startedAt: new Date(),
            sessionId: "session-1",
          };
          input.registry.register(instance);
          return instance;
        },
      },
    });

    await manager.spawnById("alpha");
    await manager.send("alpha", "hello", { sessionId: "parent-1" });

    expect(events).toContain("orchestra.subagent.active");
    expect(events).toContain("orchestra.subagent.closed");
    expect(events).toContain("orchestra.worker.completed");
  });

  test("emits error events and job failure updates", async () => {
    const events: string[] = [];
    const profiles: Record<string, WorkerProfile> = {
      alpha: {
        id: "alpha",
        name: "Alpha",
        model: "model-a",
        purpose: "test",
        whenToUse: "testing",
      },
    };

    const manager = createWorkerManager({
      config: {
        basePort: 10000,
        timeout: 1000,
        directory: process.cwd(),
        profiles,
      },
      deps: {
        api: {} as never,
        communication: {
          emit: (type: string) => events.push(type),
        } as never,
        sendWorkerMessage: async (input) => {
          input.registry.updateStatus("alpha", "error", "boom");
          return { success: false, error: "boom" };
        },
        spawnWorker: async (input: {
          registry: { register: (instance: WorkerInstance) => void };
          profile: WorkerProfile;
        }) => {
          const instance: WorkerInstance = {
            profile: input.profile,
            status: "ready",
            port: 0,
            directory: process.cwd(),
            startedAt: new Date(),
            sessionId: "session-1",
            client: {} as never,
          };
          input.registry.register(instance);
          return instance;
        },
      },
    });

    await manager.start();
    await manager.spawnById("alpha");
    await manager.send("alpha", "fail");
    expect(events).toContain("orchestra.worker.error");

    const job = manager.jobs.create({ workerId: "alpha", message: "task" });
    manager.jobs.setResult(job.id, { error: "failed" });
    expect(manager.jobs.get(job.id)).toBeTruthy();
    expect(manager.jobs.list().length).toBeGreaterThan(0);
    manager.jobs.attachReport(job.id, { summary: "done" });
    const awaited = await manager.jobs.await(job.id, { timeoutMs: 10 });
    expect(awaited.status).toBe("failed");
    expect(events).toContain("orchestra.worker.job");
    await manager.stopWorker("alpha");
    expect(events).toContain("orchestra.worker.stopped");
    await manager.stop();
  });

  test("emits job success updates", () => {
    const events: string[] = [];
    const profiles: Record<string, WorkerProfile> = {
      alpha: {
        id: "alpha",
        name: "Alpha",
        model: "model-a",
        purpose: "test",
        whenToUse: "testing",
      },
    };

    const manager = createWorkerManager({
      config: {
        basePort: 10000,
        timeout: 1000,
        directory: process.cwd(),
        profiles,
      },
      deps: {
        api: {} as never,
        communication: {
          emit: (type: string) => events.push(type),
        } as never,
      },
    });

    const job = manager.jobs.create({ workerId: "alpha", message: "task" });
    manager.jobs.setResult(job.id, { responseText: "ok" });
    expect(manager.jobs.get(job.id)?.status).toBe("succeeded");
    expect(events).toContain("orchestra.worker.job");
  });
});
