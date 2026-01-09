import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createTaskTools } from "../../../src/command/tasks";
import { createOrchestratorContext } from "../../../src/context/orchestrator-context";
import { workerPool } from "../../../src/core/worker-pool";
import type { OrchestratorConfig } from "../../../src/types";

const createConfig = (): OrchestratorConfig => ({
  basePort: 0,
  profiles: {},
  spawn: [],
  autoSpawn: false,
  startupTimeout: 1000,
  healthCheckInterval: 1000,
  agent: { name: "orchestrator" },
});

beforeEach(async () => {
  await workerPool.stopAll();
});

afterEach(async () => {
  await workerPool.stopAll();
});

describe("task tool access control", () => {
  test("allows Task API calls from the orchestrator agent", async () => {
    const config = createConfig();
    const context = createOrchestratorContext({
      directory: process.cwd(),
      config,
    });
    const tools = createTaskTools(context);

    const res = await tools.taskPeek.execute(
      { taskId: "missing-task" } as any,
      { agent: "orchestrator", sessionID: "session-main" } as any,
    );

    expect(JSON.parse(res)).toEqual({ id: "missing-task", status: "unknown" });
  });

  test("rejects Task API calls from non-orchestrator sessions", async () => {
    const config = createConfig();
    const context = createOrchestratorContext({
      directory: process.cwd(),
      config,
    });
    const tools = createTaskTools(context);

    await expect(
      tools.taskPeek.execute(
        { taskId: "missing-task" } as any,
        { agent: "coder", sessionID: "session-main" } as any,
      ),
    ).rejects.toThrow('Tool "task_peek" is restricted to the orchestrator.');
  });
});
