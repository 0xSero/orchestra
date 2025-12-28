import { describe, expect, test } from "bun:test";
import { createCommandRouter } from "../../src/commands";
import type { ApiService } from "../../src/api";
import type { MemoryService } from "../../src/memory";
import type { OrchestratorService } from "../../src/orchestrator";
import type { WorkerManager } from "../../src/workers";
import type { WorkerInstance } from "../../src/types";
import { createTestConfig, createTestProfile } from "../helpers/fixtures";

describe("orchestrator command verbs", () => {
  test("routes verb-style commands through the base command", async () => {
    const profile = createTestProfile("alpha", { model: "test-model" });
    const jobs = {
      list: () => [],
    };
    const workers = {
      getProfile: (id: string) => (id === profile.id ? profile : undefined),
      listProfiles: () => [profile],
      listWorkers: () => [],
      stopWorker: async () => true,
      getWorker: () => undefined,
      spawnById: async () => ({ profile, port: 17001 } as WorkerInstance),
      send: async () => ({ success: true, response: "ok" }),
      health: async () => ({ ok: true }),
      jobs,
    } as unknown as WorkerManager;

    const orchestrator = {
      ensureWorker: async () => ({ profile, port: 17001 } as WorkerInstance),
      health: async () => ({ ok: true }),
    } as unknown as OrchestratorService;

    const memory = {
      enabled: false,
      getScope: () => "global",
      getProjectId: () => undefined,
      health: async () => ({ ok: true }),
    } as unknown as MemoryService;

    const deps = {
      api: { health: async () => ({ ok: true }) } as ApiService,
      orchestrator,
      workers,
      memory,
      config: createTestConfig({
        profiles: { [profile.id]: profile },
        commands: { enabled: true, prefix: "orchestrator." },
      }),
      projectDir: process.cwd(),
    };

    const router = createCommandRouter(deps);

    const status = await router.execute({ command: "orchestrator", text: "status" });
    expect(status).toContain("Workers: 0 running / 1 profiles");

    const spawned = await router.execute({ command: "orchestrator", text: "spawn alpha" });
    expect(spawned).toContain("Spawned alpha");

    const aliasStatus = await router.execute({ command: "orchestra", text: "status json" });
    expect(aliasStatus).toContain("\"workersRunning\": 0");
  });

  test("stops workers with the verb-style stop command", async () => {
    const profile = createTestProfile("beta", { model: "test-model" });
    const stopped: string[] = [];
    const jobs = {
      list: () => [],
    };
    const now = new Date();
    const workers = {
      getProfile: (id: string) => (id === profile.id ? profile : undefined),
      listProfiles: () => [profile],
      listWorkers: () =>
        [
          {
            profile,
            port: 17002,
            status: "ready",
            startedAt: now,
          } as unknown as WorkerInstance,
        ],
      stopWorker: async (id: string) => {
        stopped.push(id);
        return true;
      },
      getWorker: () => undefined,
      spawnById: async () => ({ profile, port: 17002 } as WorkerInstance),
      send: async () => ({ success: true, response: "ok" }),
      health: async () => ({ ok: true }),
      jobs,
    } as unknown as WorkerManager;

    const orchestrator = {
      ensureWorker: async () => ({ profile, port: 17002 } as WorkerInstance),
      health: async () => ({ ok: true }),
    } as unknown as OrchestratorService;

    const memory = {
      enabled: false,
      getScope: () => "global",
      getProjectId: () => undefined,
      health: async () => ({ ok: true }),
    } as unknown as MemoryService;

    const deps = {
      api: { health: async () => ({ ok: true }) } as ApiService,
      orchestrator,
      workers,
      memory,
      config: createTestConfig({
        profiles: { [profile.id]: profile },
        commands: { enabled: true, prefix: "orchestrator." },
      }),
      projectDir: process.cwd(),
    };

    const router = createCommandRouter(deps);
    const output = await router.execute({ command: "orchestrator", text: "stop beta" });

    expect(output).toContain("Stopped beta.");
    expect(stopped).toEqual(["beta"]);
  });
});
