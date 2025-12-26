import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApi } from "../../src/api";
import { WorkerRegistry } from "../../src/workers/registry";
import { spawnWorker } from "../../src/workers/spawn";
import { sendWorkerMessage } from "../../src/workers/send";
import { createWorkflowEngine } from "../../src/workflows/factory";
import type { WorkerProfile } from "../../src/types";
import type { WorkflowDefinition } from "../../src/workflows/types";
import { setupE2eEnv } from "../helpers/e2e-env";

let restoreEnv: (() => void) | undefined;

describe("workflow run", () => {
  beforeAll(async () => {
    const env = await setupE2eEnv();
    restoreEnv = env.restore;
  });

  afterAll(() => {
    restoreEnv?.();
  });

  test(
    "runs a workflow against a live worker",
    async () => {
      const api = createApi({ config: { directory: process.cwd() }, deps: {} });
      const registry = new WorkerRegistry();

      const profile: WorkerProfile = {
        id: "workflow-worker",
        name: "Workflow Worker",
        model: "opencode/gpt-5-nano",
        purpose: "Workflow worker",
        whenToUse: "Workflow testing",
      };

      const instance = await spawnWorker({
        api,
        registry,
        directory: process.cwd(),
        profile,
        timeoutMs: 60_000,
      });

      const engine = createWorkflowEngine({ config: { enabled: false }, deps: {} });
      const workflow: WorkflowDefinition = {
        id: "test-flow",
        name: "Test Flow",
        description: "Simple two-step flow",
        steps: [
          {
            id: "step-1",
            title: "Ping",
            workerId: profile.id,
            prompt: "Task: {task}\nReply with exactly: ping",
          },
          {
            id: "step-2",
            title: "Pong",
            workerId: profile.id,
            prompt: "Task: {task}\nReply with exactly: pong",
          },
        ],
      };

      engine.register(workflow);

      try {
        const result = await engine.run(
          {
            workflowId: workflow.id,
            task: "Ping pong",
            limits: {
              maxSteps: 4,
              maxTaskChars: 4000,
              maxCarryChars: 8000,
              perStepTimeoutMs: 120_000,
            },
          },
          {
            resolveWorker: async (workerId) => workerId,
            sendToWorker: async (workerId, message, options) => {
              const res = await sendWorkerMessage({
                registry,
                workerId,
                message,
                options: { timeoutMs: options.timeoutMs },
              });
              return { success: res.success, response: res.response, error: res.error };
            },
          }
        );

        expect(result.workflowId).toBe("test-flow");
        expect(result.steps.length).toBe(2);
        expect(result.steps[0].status).toBe("success");
        expect(result.steps[0].response?.toLowerCase()).toContain("ping");
        expect(result.steps[1].response?.toLowerCase()).toContain("pong");
      } finally {
        await instance.shutdown?.();
      }
    },
    180_000
  );
});
