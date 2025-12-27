import { describe, expect, test } from "bun:test";
import { createOrchestrator } from "../../src/orchestrator";
import type { OrchestratorConfig, WorkerInstance, WorkerProfile } from "../../src/types";
import type { WorkerManager } from "../../src/workers";
import type { WorkflowEngine } from "../../src/workflows/factory";

const profiles: Record<string, WorkerProfile> = {
  alpha: { id: "alpha", name: "Alpha", model: "model-a", purpose: "test", whenToUse: "testing" },
  beta: { id: "beta", name: "Beta", model: "model-b", purpose: "test", whenToUse: "testing" },
};

describe("orchestrator service", () => {
  test("ensures workers and delegates tasks with errors", async () => {
    const config: OrchestratorConfig = {
      profiles,
      spawn: [],
      autoSpawn: false,
      spawnPolicy: { default: { allowManual: false, onDemand: true } },
    };

    const instance: WorkerInstance = { profile: profiles.alpha, status: "ready", port: 0 };
    let getWorkerCalls = 0;
    const workers = {
      getWorker: () => (getWorkerCalls++ === 0 ? instance : undefined),
      spawnById: async () => instance,
      send: async () => ({ success: true, response: "ok" }),
      listWorkers: () => [instance],
      stopWorker: async () => true,
    } as unknown as WorkerManager;

    const orchestrator = createOrchestrator({
      config,
      deps: { api: {} as never, workers },
    });

    const existing = await orchestrator.ensureWorker({ workerId: "alpha", reason: "on-demand" });
    expect(existing).toBe(instance);

    const spawnedWorkers = {
      ...workers,
      getWorker: () => undefined,
      spawnById: async () => instance,
    } as unknown as WorkerManager;
    const spawnOrchestrator = createOrchestrator({
      config,
      deps: { api: {} as never, workers: spawnedWorkers },
    });
    const spawned = await spawnOrchestrator.ensureWorker({ workerId: "alpha", reason: "on-demand" });
    expect(spawned.profile.id).toBe("alpha");

    await expect(orchestrator.ensureWorker({ workerId: "alpha", reason: "manual" })).rejects.toThrow("disabled");

    const emptyOrchestrator = createOrchestrator({
      config: { ...config, profiles: {} },
      deps: { api: {} as never, workers },
    });
    await expect(emptyOrchestrator.delegateTask({ task: "do work" })).rejects.toThrow("No worker available");

    const failingWorkers = {
      ...workers,
      getWorker: () => undefined,
      send: async () => ({ success: false, error: "fail" }),
    } as unknown as WorkerManager;
    const failingOrchestrator = createOrchestrator({
      config,
      deps: { api: {} as never, workers: failingWorkers },
    });

    await expect(failingOrchestrator.delegateTask({ task: "do work", autoSpawn: false })).rejects.toThrow(
      "not running",
    );

    await expect(failingOrchestrator.delegateTask({ task: "do work" })).rejects.toThrow("fail");

    const successWorkers = {
      ...workers,
      getWorker: () => instance,
    } as unknown as WorkerManager;
    const successOrchestrator = createOrchestrator({
      config: { profiles: { alpha: profiles.alpha }, spawn: [], autoSpawn: false },
      deps: { api: {} as never, workers: successWorkers },
    });
    const delegated = await successOrchestrator.delegateTask({ task: "do work", autoSpawn: false });
    expect(delegated.response).toBe("ok");

    const health = await successOrchestrator.health();
    expect(health.ok).toBe(true);

    await orchestrator.start();
  });

  test("runs workflows and enforces availability", async () => {
    const config: OrchestratorConfig = {
      profiles,
      spawn: [],
      autoSpawn: false,
    };

    const workers = {
      getWorker: () => undefined,
      spawnById: async () => ({ profile: profiles.alpha, status: "ready", port: 0 }),
      send: async () => ({ success: true, response: "ok" }),
      listWorkers: () => [],
      stopWorker: async () => true,
    } as unknown as WorkerManager;

    const orchestrator = createOrchestrator({ config, deps: { api: {} as never, workers } });
    await expect(
      orchestrator.runWorkflow({ workflowId: "wf", task: "task" }),
    ).rejects.toThrow("Workflows are not enabled");

    const workflows = {
      run: async (
        _input: unknown,
        deps: {
          resolveWorker: (id: string, autoSpawn: boolean) => Promise<string>;
          sendToWorker: (
            id: string,
            message: string,
            options: { attachments?: unknown[]; timeoutMs: number },
          ) => Promise<{ success: boolean; response?: string }>;
        },
      ) => {
        const resolved = await deps.resolveWorker("alpha", true);
        await deps.sendToWorker(resolved, "task", { timeoutMs: 1 });
        const manual = await deps.resolveWorker("alpha", false);
        await deps.sendToWorker(manual, "task", { timeoutMs: 1 });
        return { steps: [], result: "ok" };
      },
    } as unknown as WorkflowEngine;
    const withWorkflows = createOrchestrator({ config, deps: { api: {} as never, workers, workflows } });
    const res = await withWorkflows.runWorkflow({ workflowId: "wf", task: "task" });
    expect(res.result).toBe("ok");
  });

  test("auto-spawns configured workers and stops them", async () => {
    const spawnCalls: string[] = [];
    const config: OrchestratorConfig = {
      profiles,
      spawn: ["alpha", "beta"],
      autoSpawn: true,
      spawnPolicy: { profiles: { beta: { autoSpawn: false } } },
    };

    const instance: WorkerInstance = { profile: profiles.alpha, status: "ready", port: 0 };
    const workers = {
      getWorker: () => undefined,
      spawnById: async (id: string) => {
        spawnCalls.push(id);
        return instance;
      },
      send: async () => ({ success: true, response: "ok" }),
      listWorkers: () => [instance],
      stopWorker: async () => true,
    } as unknown as WorkerManager;

    const orchestrator = createOrchestrator({
      config,
      deps: { api: {} as never, workers },
    });

    await orchestrator.start();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(spawnCalls).toEqual(["alpha"]);

    await orchestrator.stop();
  });

  test("auto-spawn ignores spawn failures", async () => {
    const spawnCalls: string[] = [];
    const config: OrchestratorConfig = {
      profiles,
      spawn: ["alpha"],
      autoSpawn: true,
    };

    const workers = {
      getWorker: () => undefined,
      spawnById: async (id: string) => {
        spawnCalls.push(id);
        throw new Error("spawn failed");
      },
      send: async () => ({ success: true, response: "ok" }),
      listWorkers: () => [],
      stopWorker: async () => true,
    } as unknown as WorkerManager;

    const orchestrator = createOrchestrator({
      config,
      deps: { api: {} as never, workers },
    });

    await orchestrator.start();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(spawnCalls).toEqual(["alpha"]);
  });
});
