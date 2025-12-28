import { describe, expect, test } from "bun:test";
import type { OrchestratorService } from "../../src/orchestrator";
import { createTools } from "../../src/tools";
import type { OrchestratorConfig } from "../../src/types";
import type { WorkerManager } from "../../src/workers";

describe("tools service", () => {
  test("creates tool registry and transforms", async () => {
    const config: OrchestratorConfig = {
      basePort: 18000,
      profiles: {},
      spawn: [],
      autoSpawn: false,
      startupTimeout: 120_000,
      healthCheckInterval: 10_000,
      ui: { injectSystemContext: false },
    };

    const orchestrator = {
      ensureWorker: async () => ({ profile: { id: "alpha", model: "model-a" }, status: "ready", port: 0 }),
      delegateTask: async () => ({ workerId: "alpha", response: "ok" }),
      runWorkflow: async () => ({ result: "ok" }),
    } as unknown as OrchestratorService;

    const workers = {
      getSummary: () => "summary",
      jobs: { list: () => [] },
    } as unknown as WorkerManager;

    const service = createTools({ config, deps: { orchestrator, workers } });
    expect(Object.keys(service.tool).length).toBeGreaterThan(0);

    const output = { system: [] as string[] };
    await service.systemTransform({}, output);
    expect(output.system.length).toBe(0);

    const compaction = { context: [] as string[] };
    await service.compaction({ sessionID: "session-1" }, compaction);
    expect(compaction.context.length).toBe(0);

    await service.guard({ tool: "spawn_worker" }, { args: { profileId: "" } });
    await service.start();
    await service.stop();
    const health = await service.health();
    expect(health.ok).toBe(true);
  });
});
