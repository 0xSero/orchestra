import { describe, expect, test } from "bun:test";
import { onOrchestratorEvent } from "../../src/core/orchestrator-events";
import { registerWorkflow } from "../../src/workflows/engine";
import { runWorkflowWithDependencies } from "../../src/workflows/runner";
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

describe("workflow events", () => {
  test("emits started, step, and completed events with consistent runId", async () => {
    registerTestWorkflow("unit-events", [
      {
        id: "s1",
        title: "Step 1",
        workerId: "coder",
        prompt: "Do 1",
        carry: true,
      },
    ]);

    const events: Array<{ type: string; data: any }> = [];
    const off = onOrchestratorEvent((event) => {
      if (event.type.startsWith("orchestra.workflow")) {
        events.push({ type: event.type, data: event.data });
      }
    });

    const run = await runWorkflowWithDependencies(
      { workflowId: "unit-events", task: "do", limits },
      {
        resolveWorker: async (workerId) => workerId,
        sendToWorker: async () => ({ success: true, response: "ok" }),
      },
    );

    off();

    const started = events.find((e) => e.type === "orchestra.workflow.started");
    const step = events.find((e) => e.type === "orchestra.workflow.step");
    const completed = events.find(
      (e) => e.type === "orchestra.workflow.completed",
    );

    expect(started).toBeTruthy();
    expect(step).toBeTruthy();
    expect(completed).toBeTruthy();
    expect(step?.data?.runId).toBe(run.runId);
    expect(completed?.data?.runId).toBe(run.runId);
  });

  test("emits carry trimmed event when carry exceeds limits", async () => {
    registerTestWorkflow("unit-carry-trimmed", [
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
        prompt: "Carry: {carry}",
        carry: false,
      },
    ]);

    const events: Array<{ type: string; data: any }> = [];
    const off = onOrchestratorEvent((event) => {
      if (event.type.startsWith("orchestra.workflow")) {
        events.push({ type: event.type, data: event.data });
      }
    });

    const longArtifacts = Array.from(
      { length: 40 },
      (_, i) => `- file-${i}.ts`,
    ).join("\n");
    const response = [
      "## Summary",
      "- Did the thing",
      "",
      "## Actions",
      "- Action A",
      "",
      "## Artifacts",
      longArtifacts,
      "",
      "## Risks",
      "- None",
      "",
      "## Next",
      "- Review",
    ].join("\n");

    await runWorkflowWithDependencies(
      {
        workflowId: "unit-carry-trimmed",
        task: "do",
        limits: { ...limits, maxCarryChars: 300 },
      },
      {
        resolveWorker: async (workerId) => workerId,
        sendToWorker: async () => ({ success: true, response }),
      },
    );

    off();

    const trimmed = events.find(
      (e) => e.type === "orchestra.workflow.carry.trimmed",
    );
    expect(trimmed).toBeTruthy();
    expect(trimmed?.data?.workflowId).toBe("unit-carry-trimmed");
  });
});
