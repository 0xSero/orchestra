import { describe, expect, test } from "bun:test";
import type { OrchestratorService } from "../../src/orchestrator";
import type { OrchestratorConfig } from "../../src/types";
import type { WorkerManager } from "../../src/workers";
import type { WorkflowEngine } from "../../src/workflows/factory";
import { createCompactionTransform, createSystemTransform, createToolGuard } from "../../src/tools/hooks";
import { createWorkerTools } from "../../src/tools/worker-tools";
import { createWorkflowTools } from "../../src/tools/workflow-tools";

const workers = {
  listWorkers: () => [
    {
      profile: { id: "alpha", name: "Alpha", model: "model-a" },
      status: "ready",
      port: 1234,
      serverUrl: "http://127.0.0.1:1234",
    },
  ],
  listProfiles: () => [
    {
      id: "alpha",
      name: "Alpha",
      model: "model-a",
      purpose: "test",
      whenToUse: "testing",
      supportsVision: true,
      supportsWeb: false,
    },
  ],
  stopWorker: async (workerId: string) => workerId === "alpha",
  send: async () => ({ success: true, response: "pong" }),
  jobs: {
    create: () => ({ id: "job-1" }),
    await: async () => ({ id: "job-1", status: "completed" }),
    setResult: () => {},
    list: () => [{ id: "job-1", workerId: "vision", status: "running" }],
  },
  getSummary: () => "summary",
} as unknown as WorkerManager;

const orchestrator = {
  ensureWorker: async ({ workerId }: { workerId: string }) => ({
    profile: { id: workerId, model: "model-a" },
    status: "ready",
    port: 5555,
  }),
  delegateTask: async () => ({ response: "done" }),
  runWorkflow: async () => ({ result: "ok" }),
} as unknown as OrchestratorService;

describe("tool hooks", () => {
  test("guards manual and on-demand spawning", async () => {
    const config: OrchestratorConfig = {
      profiles: {},
      spawn: [],
      autoSpawn: false,
      spawnPolicy: {
        default: { allowManual: false, onDemand: false },
      },
    };

    const guard = createToolGuard(config);

    await expect(
      guard({ tool: "spawn_worker" }, { args: { profileId: "alpha" } }),
    ).rejects.toThrow("Spawning worker");

    await expect(
      guard({ tool: "ask_worker" }, { args: { workerId: "alpha", autoSpawn: true } }),
    ).rejects.toThrow("On-demand spawn");
  });

  test("injects system context and pending vision jobs", async () => {
    const config: OrchestratorConfig = {
      profiles: {},
      spawn: [],
      autoSpawn: false,
      ui: { injectSystemContext: true, systemContextMaxWorkers: 3 },
    };

    const systemTransform = createSystemTransform(config, workers);
    const output = { system: [] as string[] };
    await systemTransform({}, output);
    expect(output.system.some((entry) => entry.includes("summary"))).toBe(true);
    expect(output.system.some((entry) => entry.includes("pending-vision-analysis"))).toBe(true);

    const compactionTransform = createCompactionTransform(config, workers);
    const compactionOutput = { context: [] as string[] };
    await compactionTransform({ sessionID: "session-1" }, compactionOutput);
    expect(compactionOutput.context[0]).toContain("summary");
  });
});

describe("tool definitions", () => {
  test("worker tools execute and return serialized responses", async () => {
    const tools = createWorkerTools({ orchestrator, workers });

    const spawn = await tools.spawn_worker.execute({ profileId: "alpha" });
    expect(spawn).toContain("alpha");

    const stopped = await tools.stop_worker.execute({ workerId: "alpha" });
    expect(stopped).toContain("Stopped");

    const listed = await tools.list_workers.execute({});
    expect(listed).toContain("alpha");

    const profiles = await tools.list_profiles.execute({});
    expect(profiles).toContain("Alpha");

    const reply = await tools.ask_worker.execute({ workerId: "alpha", message: "ping" });
    expect(reply).toBe("pong");

    const asyncReply = await tools.ask_worker_async.execute(
      { workerId: "alpha", message: "ping" },
      { sessionID: "session-1", agent: "agent-1" },
    );
    expect(asyncReply).toContain("job-1");

    const awaited = await tools.await_worker_job.execute({ jobId: "job-1" });
    expect(awaited).toContain("job-1");

    const delegated = await tools.delegate_task.execute({ task: "do it" });
    expect(delegated).toBe("done");
  });

  test("ask_worker_async records failures in jobs registry", async () => {
    let recordedError = "";
    const failingWorkers = {
      ...workers,
      send: async () => ({ success: false, error: "worker failed" }),
      jobs: {
        create: () => ({ id: "job-2" }),
        await: async () => ({ id: "job-2", status: "failed" }),
        setResult: (_id: string, result: { error?: string }) => {
          recordedError = result.error ?? "";
        },
        list: () => [],
      },
    } as unknown as WorkerManager;

    const tools = createWorkerTools({ orchestrator, workers: failingWorkers });
    await tools.ask_worker_async.execute({ workerId: "alpha", message: "ping" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(recordedError).toContain("worker failed");
  });

  test("workflow tools list and run", async () => {
    const workflows = {
      list: () => [{ id: "workflow-1" }],
    } as unknown as WorkflowEngine;

    const tools = createWorkflowTools({ orchestrator, workflows });
    const list = await tools.list_workflows.execute({});
    expect(list).toContain("workflow-1");

    const run = await tools.run_workflow.execute({ workflowId: "workflow-1", task: "run" });
    expect(run).toContain("ok");
  });
});
