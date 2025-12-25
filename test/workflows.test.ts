import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createWorkflowEngine } from "../src/workflows/factory";
import type { WorkerProfile } from "../src/types";
import { createTestWorkerRuntime } from "./helpers/worker-runtime";

const MODEL = "opencode/gpt-5-nano";

const profiles: Record<string, WorkerProfile> = {
  coder: {
    id: "coder",
    name: "Coder",
    model: MODEL,
    purpose: "Writes and edits code",
    whenToUse: "Implementation tasks and code changes",
  },
  architect: {
    id: "architect",
    name: "Architect",
    model: MODEL,
    purpose: "Designs systems and plans",
    whenToUse: "Planning or architecture tasks",
  },
};

const workflowEngine = createWorkflowEngine({ config: { enabled: true } });

workflowEngine.register({
  id: "test-flow",
  name: "Test Flow",
  description: "Integration workflow",
  steps: [
    {
      id: "step-one",
      title: "Step One",
      workerId: "coder",
      prompt: "Reply with exactly: STEP_ONE_OK",
      carry: true,
    },
    {
      id: "step-two",
      title: "Step Two",
      workerId: "architect",
      prompt: "Reply with exactly: STEP_TWO_OK",
      carry: true,
    },
  ],
});

const limits = {
  maxSteps: 4,
  maxTaskChars: 1000,
  maxCarryChars: 1000,
  perStepTimeoutMs: 60_000,
};

describe("workflow engine integration", () => {
  let runtime: Awaited<ReturnType<typeof createTestWorkerRuntime>> | undefined;

  beforeAll(async () => {
    runtime = await createTestWorkerRuntime({ profiles, directory: process.cwd(), timeoutMs: 60_000 });
    for (const profile of Object.values(profiles)) {
      await runtime.workers.spawn(profile);
    }
    await workflowEngine.start();
  }, 120_000);

  afterAll(async () => {
    await workflowEngine.stop();
    await runtime?.stop();
  });

  test(
    "runs steps sequentially and carries output via real workers",
    async () => {
      const result = await workflowEngine.run(
        { workflowId: "test-flow", task: "do the thing", limits },
        {
          resolveWorker: async (workerId) => workerId,
          sendToWorker: async (workerId, message, options) =>
            runtime!.workers.send(workerId, message, { attachments: options.attachments, timeout: options.timeoutMs }),
        }
      );

      expect(result.steps.length).toBe(2);
      expect(result.steps[0]?.status).toBe("success");
      expect(result.steps[1]?.status).toBe("success");
      expect(result.steps[0]?.response ?? "").toContain("STEP_ONE_OK");
      expect(result.steps[1]?.response ?? "").toContain("STEP_TWO_OK");
    },
    120_000
  );
});
