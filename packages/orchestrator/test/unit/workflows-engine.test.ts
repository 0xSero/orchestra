import { describe, expect, test } from "bun:test";
import { registerWorkflow, runWorkflow } from "../../src/workflows/engine";
import type {
  WorkflowAttachment,
  WorkflowStepDefinition,
} from "../../src/workflows/types";

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

describe("workflow engine unit", () => {
  test("runs steps sequentially, carries output, and scopes attachments", async () => {
    registerTestWorkflow("unit-flow-carry", [
      {
        id: "step-one",
        title: "Step One",
        workerId: "coder",
        prompt: "Task: {task}",
        carry: true,
      },
      {
        id: "step-two",
        title: "Step Two",
        workerId: "architect",
        prompt: "Carry: {carry}",
        carry: true,
      },
    ]);

    const prompts: string[] = [];
    const attachmentsSeen: Array<unknown | undefined> = [];
    const autoSpawnSeen: Array<boolean | undefined> = [];

    const attachments: WorkflowAttachment[] = [
      { type: "file", path: "/tmp/test.txt" },
    ];
    const result = await runWorkflow(
      {
        workflowId: "unit-flow-carry",
        task: "do the thing",
        limits,
        attachments,
      },
      {
        resolveWorker: async (workerId, autoSpawn) => {
          autoSpawnSeen.push(autoSpawn);
          return workerId;
        },
        sendToWorker: async (workerId, message, options) => {
          prompts.push(message);
          attachmentsSeen.push(options.attachments);
          return {
            success: true,
            response: workerId === "coder" ? "STEP_ONE_OK" : "STEP_TWO_OK",
          };
        },
      },
    );

    expect(result.steps.length).toBe(2);
    expect(result.status).toBe("success");
    expect(result.steps[0]?.status).toBe("success");
    expect(result.steps[1]?.status).toBe("success");
    expect(result.currentStepIndex).toBe(2);
    expect(prompts[1]).toContain("### Step One");
    expect(prompts[1]).toContain("#### Summary");
    expect(prompts[1]).toContain("STEP_ONE_OK");
    expect(attachmentsSeen[0]).toBeTruthy();
    expect(attachmentsSeen[1]).toBeUndefined();
    expect(autoSpawnSeen.every((value) => value === true)).toBe(true);
  });

  test("stops after a failed step", async () => {
    registerTestWorkflow("unit-flow-error", [
      {
        id: "step-one",
        title: "Step One",
        workerId: "coder",
        prompt: "Reply with STEP_ONE_OK",
        carry: true,
      },
      {
        id: "step-two",
        title: "Step Two",
        workerId: "architect",
        prompt: "Reply with STEP_TWO_OK",
        carry: true,
      },
    ]);

    const result = await runWorkflow(
      { workflowId: "unit-flow-error", task: "do the thing", limits },
      {
        resolveWorker: async (workerId) => workerId,
        sendToWorker: async (workerId) => {
          if (workerId === "architect") {
            return { success: false, error: "failed" };
          }
          return { success: true, response: "STEP_ONE_OK" };
        },
      },
    );

    expect(result.steps.length).toBe(2);
    expect(result.status).toBe("error");
    expect(result.steps[0]?.status).toBe("success");
    expect(result.steps[1]?.status).toBe("error");
    expect(result.steps[1]?.error).toBe("failed");
  });

  test("uses step-specific timeout capped by limits", async () => {
    registerTestWorkflow("unit-flow-timeout", [
      {
        id: "step-one",
        title: "Step One",
        workerId: "coder",
        prompt: "Reply with STEP_ONE_OK",
        carry: false,
        timeoutMs: 2000,
      },
      {
        id: "step-two",
        title: "Step Two",
        workerId: "architect",
        prompt: "Reply with STEP_TWO_OK",
        carry: false,
        timeoutMs: 9000,
      },
    ]);

    const timeouts: number[] = [];
    await runWorkflow(
      {
        workflowId: "unit-flow-timeout",
        task: "do the thing",
        limits: { ...limits, perStepTimeoutMs: 5000 },
      },
      {
        resolveWorker: async (workerId) => workerId,
        sendToWorker: async (_workerId, _message, options) => {
          timeouts.push(options.timeoutMs);
          return { success: true, response: "ok" };
        },
      },
    );

    expect(timeouts).toEqual([2000, 5000]);
  });

  test("rejects workflows that exceed limits", async () => {
    registerTestWorkflow("unit-flow-limits", [
      {
        id: "step-one",
        title: "Step One",
        workerId: "coder",
        prompt: "Reply with STEP_ONE_OK",
        carry: true,
      },
      {
        id: "step-two",
        title: "Step Two",
        workerId: "architect",
        prompt: "Reply with STEP_TWO_OK",
        carry: true,
      },
    ]);

    await expect(
      runWorkflow(
        {
          workflowId: "unit-flow-limits",
          task: "do the thing",
          limits: { ...limits, maxSteps: 1 },
        },
        {
          resolveWorker: async (workerId) => workerId,
          sendToWorker: async () => ({ success: true, response: "ok" }),
        },
      ),
    ).rejects.toThrow("maxSteps=1");
  });

  test("carries only schema sections and truncates oversized carry", async () => {
    registerTestWorkflow("unit-flow-carry-schema", [
      {
        id: "step-one",
        title: "Step One",
        workerId: "coder",
        prompt: "Task: {task}",
        carry: true,
      },
      {
        id: "step-two",
        title: "Step Two",
        workerId: "architect",
        prompt: "Carry:\n{carry}",
        carry: false,
      },
    ]);

    const longArtifacts = Array.from(
      { length: 50 },
      (_, i) => `- file-${i}.ts`,
    ).join("\n");
    const response = [
      "## Summary",
      "- Did the thing",
      "",
      "## Actions",
      "- Took action A",
      "",
      "## Artifacts",
      longArtifacts,
      "",
      "## Risks",
      "- None",
      "",
      "## Next",
      "- Review changes",
    ].join("\n");

    const prompts: string[] = [];
    await runWorkflow(
      {
        workflowId: "unit-flow-carry-schema",
        task: "do the thing",
        limits: { ...limits, maxCarryChars: 400 },
      },
      {
        resolveWorker: async (workerId) => workerId,
        sendToWorker: async (_workerId, message) => {
          prompts.push(message);
          return { success: true, response };
        },
      },
    );

    expect(prompts[1]).toContain("#### Summary");
    expect(prompts[1]).toContain("#### Artifacts");
    expect(prompts[1]).toContain("#### Risks");
    expect(prompts[1]).toContain("#### Next");
    expect(prompts[1]).not.toContain("#### Actions");
    expect(prompts[1]).toContain("...(truncated)");
  });
});
