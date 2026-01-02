import { describe, expect, test } from "bun:test";
import { registerWorkflow } from "../../src/workflows/engine";
import {
  continueWorkflowWithDependencies,
  runWorkflowWithDependencies,
} from "../../src/workflows/runner";
import type { WorkflowStepDefinition } from "../../src/workflows/types";

const limits = {
  maxSteps: 4,
  maxTaskChars: 1000,
  maxCarryChars: 1000,
  perStepTimeoutMs: 5000,
};

const registerTestWorkflow = (id: string, steps: WorkflowStepDefinition[]) => {
  registerWorkflow({
    id,
    name: `Unit ${id}`,
    description: "unit workflow",
    steps,
  });
};

describe("workflow gating", () => {
  test("execution=step pauses after each step", async () => {
    registerTestWorkflow("unit-gate-step", [
      {
        id: "s1",
        title: "Step 1",
        workerId: "coder",
        prompt: "Do 1",
        carry: true,
      },
      {
        id: "s2",
        title: "Step 2",
        workerId: "architect",
        prompt: "Do 2",
        carry: true,
      },
    ]);

    const deps = {
      resolveWorker: async (workerId: string) => workerId,
      sendToWorker: async () => ({ success: true, response: "ok" }),
    };

    const run = await runWorkflowWithDependencies(
      { workflowId: "unit-gate-step", task: "do", limits },
      deps,
      { uiPolicy: { execution: "step", intervene: "on-error" } },
    );

    expect(run.status).toBe("paused");
    expect(run.steps.length).toBe(1);
    expect(run.currentStepIndex).toBe(1);

    const resumed = await continueWorkflowWithDependencies(run, deps);
    expect(resumed.status).toBe("success");
    expect(resumed.steps.length).toBe(2);
  });

  test("intervene=on-error pauses and retries the failed step", async () => {
    registerTestWorkflow("unit-gate-error", [
      {
        id: "s1",
        title: "Step 1",
        workerId: "coder",
        prompt: "Do 1",
        carry: true,
      },
    ]);

    let attempt = 0;
    const deps = {
      resolveWorker: async (workerId: string) => workerId,
      sendToWorker: async () => {
        attempt += 1;
        if (attempt === 1) return { success: false, error: "boom" };
        return { success: true, response: "ok" };
      },
    };

    const run = await runWorkflowWithDependencies(
      { workflowId: "unit-gate-error", task: "do", limits },
      deps,
      { uiPolicy: { execution: "auto", intervene: "on-error" } },
    );

    expect(run.status).toBe("paused");
    expect(run.currentStepIndex).toBe(0);
    expect(run.steps[0]?.status).toBe("error");

    const resumed = await continueWorkflowWithDependencies(run, deps);
    expect(resumed.status).toBe("success");
    expect(resumed.steps.length).toBe(2);
    expect(resumed.steps[1]?.status).toBe("success");
  });

  test("intervene=on-warning pauses when a step emits a warning", async () => {
    registerTestWorkflow("unit-gate-warning", [
      {
        id: "s1",
        title: "Step 1",
        workerId: "coder",
        prompt: "Do 1",
        carry: true,
      },
      {
        id: "s2",
        title: "Step 2",
        workerId: "architect",
        prompt: "Do 2",
        carry: true,
      },
    ]);

    const deps = {
      resolveWorker: async (workerId: string) => workerId,
      sendToWorker: async () => ({
        success: true,
        response: "ok",
        warning: "heads up",
      }),
    };

    const run = await runWorkflowWithDependencies(
      { workflowId: "unit-gate-warning", task: "do", limits },
      deps,
      { uiPolicy: { execution: "auto", intervene: "on-warning" } },
    );

    expect(run.status).toBe("paused");
    expect(run.currentStepIndex).toBe(1);
    expect(run.steps[0]?.warning).toBe("heads up");

    const resumed = await continueWorkflowWithDependencies(run, deps);
    expect(resumed.status).toBe("success");
    expect(resumed.steps.length).toBe(2);
  });
});
