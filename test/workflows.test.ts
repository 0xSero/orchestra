import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { registerWorkflow, runWorkflow } from "../src/workflows/engine";
import { spawnWorker, sendToWorker, stopWorker } from "../src/workers/spawner";
import type { WorkerProfile } from "../src/types";

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

registerWorkflow({
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
  perStepTimeoutMs: 120_000,
};

describe("workflow engine integration", () => {
  const spawned = new Set<string>();

  beforeAll(async () => {
    for (const profile of Object.values(profiles)) {
      const instance = await spawnWorker(profile, {
        basePort: 0,
        timeout: 60_000,
        directory: process.cwd(),
      });
      spawned.add(instance.profile.id);
    }
  }, 180_000);

  afterAll(async () => {
    for (const id of spawned) {
      await stopWorker(id).catch(() => {});
    }
  });

  test(
    "runs steps sequentially and carries output via real workers",
    async () => {
      const result = await runWorkflow(
        { workflowId: "test-flow", task: "do the thing", limits },
        {
          resolveWorker: async (workerId) => workerId,
          sendToWorker: async (workerId, message, options) =>
            sendToWorker(workerId, message, { attachments: options.attachments, timeout: options.timeoutMs }),
        }
      );

      expect(result.steps.length).toBe(2);
      expect(result.steps[0]?.status).toBe("success");
      expect(result.steps[1]?.status).toBe("success");
      expect(result.steps[0]?.response ?? "").toContain("STEP_ONE_OK");
      expect(result.steps[1]?.response ?? "").toContain("STEP_TWO_OK");
    },
    180_000
  );
});
