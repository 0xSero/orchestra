import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createWorkflowEngine } from "../../src/workflows/factory";
import { buildBuiltinWorkflows } from "../../src/workflows/builtins";
import { setupE2eEnv } from "../helpers/e2e-env";
import type { WorkerProfile } from "../../src/types";
import { createTestWorkerRuntime } from "../helpers/worker-runtime";

const MODEL = "opencode/gpt-5-nano";
const directory = process.cwd();

const SYSTEM_PROMPT = "Test mode: reply with exactly \"OK\" and nothing else.";

function makeProfile(input: Omit<WorkerProfile, "model" | "systemPrompt">): WorkerProfile {
  return { ...input, model: MODEL, systemPrompt: SYSTEM_PROMPT };
}

const profiles: Record<string, WorkerProfile> = {
  explorer: makeProfile({
    id: "explorer",
    name: "Explorer",
    purpose: "Find code",
    whenToUse: "search",
  }),
  coder: makeProfile({
    id: "coder",
    name: "Coder",
    purpose: "Implement",
    whenToUse: "code",
  }),
  reviewer: makeProfile({
    id: "reviewer",
    name: "Reviewer",
    purpose: "Review",
    whenToUse: "review",
  }),
};

const limits = {
  maxSteps: 3,
  maxTaskChars: 4000,
  maxCarryChars: 8000,
  perStepTimeoutMs: 45_000,
};

const task = "Reply with OK only. Do not use tools.";

describe("builtin workflows integration", () => {
  let restoreEnv: (() => void) | undefined;
  let runtime: Awaited<ReturnType<typeof createTestWorkerRuntime>> | undefined;
  const workflowEngine = createWorkflowEngine({ config: { enabled: true }, deps: {} });

  beforeAll(async () => {
    const env = await setupE2eEnv();
    restoreEnv = env.restore;

    runtime = await createTestWorkerRuntime({ profiles, directory, timeoutMs: 60_000 });
    for (const profile of Object.values(profiles)) {
      await runtime.workers.spawn(profile);
    }
    await workflowEngine.start();
  }, 120_000);

  afterAll(async () => {
    await workflowEngine.stop();
    await runtime?.stop();
    restoreEnv?.();
  });

  test(
    "runs a built-in workflow successfully",
    async () => {
      const workflow = buildBuiltinWorkflows().find((entry) => entry.id === "bug-triage");
      if (!workflow) throw new Error("Expected built-in workflow 'bug-triage' to exist.");

      const result = await workflowEngine.run(
        { workflowId: workflow.id, task, limits },
        {
          resolveWorker: async (workerId) => workerId,
          sendToWorker: async (workerId, message, options) =>
            runtime!.workers.send(workerId, message, { attachments: options.attachments, timeout: options.timeoutMs }),
        }
      );

      expect(result.steps.length).toBe(workflow.steps.length);
      for (const step of result.steps) {
        expect(step.status).toBe("success");
        expect((step.response ?? "").length).toBeGreaterThan(0);
      }
    },
    240_000
  );
});
