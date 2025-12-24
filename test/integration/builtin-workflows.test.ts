import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnWorker, sendToWorker, stopWorker } from "../../src/workers/spawner";
import { registerWorkflow, runWorkflow } from "../../src/workflows/engine";
import { buildBuiltinWorkflows } from "../../src/workflows/builtins";
import { setupE2eEnv } from "../helpers/e2e-env";
import type { WorkerProfile } from "../../src/types";

const MODEL = "opencode/gpt-5-nano";
const directory = process.cwd();

const profiles: Record<string, WorkerProfile> = {
  explorer: {
    id: "explorer",
    name: "Explorer",
    model: MODEL,
    purpose: "Find code",
    whenToUse: "search",
  },
  coder: {
    id: "coder",
    name: "Coder",
    model: MODEL,
    purpose: "Implement",
    whenToUse: "code",
  },
  reviewer: {
    id: "reviewer",
    name: "Reviewer",
    model: MODEL,
    purpose: "Review",
    whenToUse: "review",
  },
  security: {
    id: "security",
    name: "Security",
    model: MODEL,
    purpose: "Security review",
    whenToUse: "security",
  },
  architect: {
    id: "architect",
    name: "Architect",
    model: MODEL,
    purpose: "Plan",
    whenToUse: "architecture",
  },
  qa: {
    id: "qa",
    name: "QA",
    model: MODEL,
    purpose: "QA",
    whenToUse: "testing",
  },
  product: {
    id: "product",
    name: "Product",
    model: MODEL,
    purpose: "Specs",
    whenToUse: "requirements",
  },
  analyst: {
    id: "analyst",
    name: "Analyst",
    model: MODEL,
    purpose: "Insights",
    whenToUse: "analysis",
  },
  docs: {
    id: "docs",
    name: "Docs",
    model: MODEL,
    purpose: "Docs",
    whenToUse: "research",
  },
};

const limits = {
  maxSteps: 6,
  maxTaskChars: 12000,
  maxCarryChars: 24000,
  perStepTimeoutMs: 150_000,
};

const task = "Reply with OK only. Do not use tools.";

describe("builtin workflows integration", () => {
  let restoreEnv: (() => void) | undefined;
  const spawned = new Set<string>();

  beforeAll(async () => {
    const env = await setupE2eEnv();
    restoreEnv = env.restore;

    for (const profile of Object.values(profiles)) {
      const instance = await spawnWorker(profile, {
        basePort: 0,
        timeout: 60_000,
        directory,
      });
      spawned.add(instance.profile.id);
    }

    for (const workflow of buildBuiltinWorkflows()) {
      registerWorkflow(workflow);
    }
  }, 240_000);

  afterAll(async () => {
    for (const id of spawned) {
      await stopWorker(id).catch(() => {});
    }
    restoreEnv?.();
  });

  test(
    "runs all built-in workflows successfully",
    async () => {
      const workflows = buildBuiltinWorkflows();
      for (const workflow of workflows) {
        const result = await runWorkflow(
          { workflowId: workflow.id, task, limits },
          {
            resolveWorker: async (workerId) => workerId,
            sendToWorker: async (workerId, message, options) =>
              sendToWorker(workerId, message, { attachments: options.attachments, timeout: options.timeoutMs }),
          }
        );

        expect(result.steps.length).toBe(workflow.steps.length);
        for (const step of result.steps) {
          expect(step.status).toBe("success");
          expect((step.response ?? "").length).toBeGreaterThan(0);
        }
      }
    },
    900_000
  );
});
