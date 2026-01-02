import { afterEach, describe, expect, test } from "bun:test";
import { createTaskTools } from "../../src/command/tasks";
import { createOrchestratorContext } from "../../src/context/orchestrator-context";
import { workerPool } from "../../src/core/worker-pool";
import { sendToWorker } from "../../src/workers/spawner";
import type {
  OrchestratorConfig,
  WorkerInstance,
  WorkerProfile,
} from "../../src/types";

const createClient = (): { client: any; promptCalls: any[] } => {
  const promptCalls: any[] = [];
  const providers = [
    {
      id: "openai",
      source: "config",
      models: {
        "gpt-4o-mini": { name: "GPT-4o mini" },
        "gpt-4.1-mini": { name: "GPT-4.1 mini" },
      },
    },
  ];

  const client = {
    session: {
      prompt: async (args: any) => {
        promptCalls.push(args);
        return { data: { parts: [{ type: "text", text: "ok" }] } };
      },
      message: async () => ({
        data: { parts: [{ type: "text", text: "ok" }] },
      }),
      messages: async () => ({
        data: [
          {
            info: { role: "assistant" },
            parts: [{ type: "text", text: "ok" }],
          },
        ],
      }),
    },
    config: {
      get: async () => ({ data: { model: "openai/gpt-4o-mini" } }),
      providers: async () => ({
        data: { providers, default: { openai: "gpt-4o-mini" } },
      }),
    },
    provider: {
      list: async () => ({ data: { providers } }),
    },
  };

  return { client, promptCalls };
};

const createConfig = (profile: WorkerProfile): OrchestratorConfig => ({
  basePort: 0,
  profiles: { [profile.id]: profile },
  spawn: [],
  autoSpawn: false,
  startupTimeout: 1000,
  healthCheckInterval: 1000,
});

const createWorkerInstance = (
  profile: WorkerProfile,
  client: any,
): WorkerInstance => ({
  profile: { ...profile },
  kind: "agent",
  execution: profile.execution,
  status: "ready",
  port: 0,
  directory: process.cwd(),
  startedAt: new Date(),
  modelRef: profile.model,
  modelPolicy: "dynamic",
  modelResolution: "configured",
  client,
  sessionId: "session-1",
});

afterEach(async () => {
  await workerPool.stopAll();
});

describe("worker model ops", () => {
  test("worker.model.set updates model used by sendToWorker", async () => {
    const profile: WorkerProfile = {
      id: "model-ops-agent",
      name: "Model Ops Agent",
      model: "openai/gpt-4o-mini",
      purpose: "Model ops test",
      whenToUse: "Unit tests",
      kind: "agent",
    };
    const { client, promptCalls } = createClient();
    const config = createConfig(profile);
    const context = createOrchestratorContext({
      directory: process.cwd(),
      client: client as any,
      config,
    });
    const tools = createTaskTools(context);
    const toolContext = {
      agent: "test",
      sessionID: "session-1",
      messageID: "msg",
    };

    workerPool.register(createWorkerInstance(profile, client));

    const started = JSON.parse(
      await tools.taskStart.execute(
        {
          kind: "op",
          op: "worker.model.set",
          task: "worker.model.set",
          worker: { workerId: profile.id, model: "openai/gpt-4.1-mini" },
        } as any,
        toolContext as any,
      ),
    );
    const awaited = JSON.parse(
      await tools.taskAwait.execute(
        { taskId: started.taskId } as any,
        toolContext as any,
      ),
    );
    expect(awaited.status).toBe("succeeded");

    const res = await sendToWorker(profile.id, "hello");
    expect(res.success).toBe(true);
    const lastPrompt = promptCalls.at(-1);
    expect(lastPrompt.body.model).toEqual({
      providerID: "openai",
      modelID: "gpt-4.1-mini",
    });
  });

  test("worker.model.reset restores configured default", async () => {
    const profile: WorkerProfile = {
      id: "model-ops-reset",
      name: "Model Ops Reset",
      model: "openai/gpt-4o-mini",
      purpose: "Model ops reset test",
      whenToUse: "Unit tests",
      kind: "agent",
    };
    const { client, promptCalls } = createClient();
    const config = createConfig(profile);
    const context = createOrchestratorContext({
      directory: process.cwd(),
      client: client as any,
      config,
    });
    const tools = createTaskTools(context);
    const toolContext = {
      agent: "test",
      sessionID: "session-1",
      messageID: "msg",
    };

    workerPool.register(createWorkerInstance(profile, client));

    const started = JSON.parse(
      await tools.taskStart.execute(
        {
          kind: "op",
          op: "worker.model.set",
          task: "worker.model.set",
          worker: { workerId: profile.id, model: "openai/gpt-4.1-mini" },
        } as any,
        toolContext as any,
      ),
    );
    await tools.taskAwait.execute(
      { taskId: started.taskId } as any,
      toolContext as any,
    );

    promptCalls.length = 0;

    const resetStarted = JSON.parse(
      await tools.taskStart.execute(
        {
          kind: "op",
          op: "worker.model.reset",
          task: "worker.model.reset",
          worker: { workerId: profile.id },
        } as any,
        toolContext as any,
      ),
    );
    const resetAwaited = JSON.parse(
      await tools.taskAwait.execute(
        { taskId: resetStarted.taskId } as any,
        toolContext as any,
      ),
    );
    expect(resetAwaited.status).toBe("succeeded");

    const res = await sendToWorker(profile.id, "hello again");
    expect(res.success).toBe(true);
    const lastPrompt = promptCalls.at(-1);
    expect(lastPrompt.body.model).toEqual({
      providerID: "openai",
      modelID: "gpt-4o-mini",
    });
  });
});
