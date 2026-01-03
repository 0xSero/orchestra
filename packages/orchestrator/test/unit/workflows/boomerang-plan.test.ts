import { describe, expect, test } from "bun:test";
import type { OrchestratorConfig } from "../../../src/types";
import { loadWorkflows } from "../../../src/workflows";
import {
  getWorkflow,
  registerWorkflow,
  runWorkflow,
} from "../../../src/workflows/engine";
import { buildBoomerangPlanWorkflow } from "../../../src/workflows/boomerang-plan";

const limits = {
  maxSteps: 4,
  maxTaskChars: 4000,
  maxCarryChars: 4000,
  perStepTimeoutMs: 5000,
};

describe("boomerang-plan workflow", () => {
  test("registers via loadWorkflows", () => {
    const config: OrchestratorConfig = {
      basePort: 0,
      profiles: {},
      spawn: [],
      autoSpawn: false,
      startupTimeout: 0,
      healthCheckInterval: 0,
      workflows: { enabled: true },
    };

    loadWorkflows(config);
    const workflow = getWorkflow("boomerang-plan");
    expect(workflow).toBeTruthy();
  });

  test("runs with DI and includes planning instructions", async () => {
    registerWorkflow(buildBoomerangPlanWorkflow());
    const prompts: string[] = [];

    const result = await runWorkflow(
      {
        workflowId: "boomerang-plan",
        task: "Target directory: packages/orchestrator\nGoal: add a new feature",
        limits,
      },
      {
        resolveWorker: async (workerId) => workerId,
        sendToWorker: async (_workerId, message) => {
          prompts.push(message);
          return { success: true, response: "ok" };
        },
      },
    );

    expect(result.status).toBe("success");
    expect(result.steps.length).toBe(1);
    expect(prompts[0]).toContain("scope.md");
    expect(prompts[0]).toContain("rules.md");
    expect(prompts[0]).toContain("tasks/task-00");
    expect(prompts[0]).toContain("Target directory: packages/orchestrator");
  });
});
