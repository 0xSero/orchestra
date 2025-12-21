import { describe, expect, test } from "bun:test";
import { registerWorkflow, runWorkflow } from "../src/workflows/engine";

registerWorkflow({
  id: "test-flow",
  name: "Test Flow",
  description: "Test workflow",
  steps: [
    {
      id: "step-one",
      title: "Step One",
      workerId: "coder",
      prompt: "Task:\n{task}",
      carry: true,
    },
    {
      id: "step-two",
      title: "Step Two",
      workerId: "architect",
      prompt: "Carry:\n{carry}",
      carry: true,
    },
  ],
});

const limits = {
  maxSteps: 4,
  maxTaskChars: 1000,
  maxCarryChars: 1000,
  perStepTimeoutMs: 10_000,
};

describe("workflow engine", () => {
  test("runs steps sequentially and carries output", async () => {
    const seenMessages: string[] = [];
    const result = await runWorkflow(
      { workflowId: "test-flow", task: "do the thing", limits },
      {
        resolveWorker: async (workerId) => workerId,
        sendToWorker: async (_workerId, message) => {
          seenMessages.push(message);
          return { success: true, response: `response-${seenMessages.length}` };
        },
      }
    );

    expect(result.steps.length).toBe(2);
    expect(result.steps[0]?.status).toBe("success");
    expect(result.steps[1]?.status).toBe("success");
    expect(seenMessages[1]).toContain("### Step One");
    expect(seenMessages[1]).toContain("response-1");
  });

  test("enforces task length limits", async () => {
    const longTask = "x".repeat(2000);
    await expect(
      runWorkflow(
        { workflowId: "test-flow", task: longTask, limits },
        {
          resolveWorker: async (workerId) => workerId,
          sendToWorker: async () => ({ success: true, response: "ok" }),
        }
      )
    ).rejects.toThrow("maxTaskChars");
  });

  test("enforces max steps limit", async () => {
    registerWorkflow({
      id: "five-step",
      name: "Five Step",
      description: "Too many steps",
      steps: [
        { id: "s1", title: "S1", workerId: "coder", prompt: "{task}" },
        { id: "s2", title: "S2", workerId: "coder", prompt: "{task}" },
        { id: "s3", title: "S3", workerId: "coder", prompt: "{task}" },
        { id: "s4", title: "S4", workerId: "coder", prompt: "{task}" },
        { id: "s5", title: "S5", workerId: "coder", prompt: "{task}" },
      ],
    });

    await expect(
      runWorkflow(
        { workflowId: "five-step", task: "do", limits },
        {
          resolveWorker: async (workerId) => workerId,
          sendToWorker: async () => ({ success: true, response: "ok" }),
        }
      )
    ).rejects.toThrow("maxSteps");
  });

  test("stops execution after a failed step", async () => {
    registerWorkflow({
      id: "fail-mid",
      name: "Fail Mid",
      description: "Stops on error",
      steps: [
        { id: "first", title: "First", workerId: "coder", prompt: "{task}", carry: true },
        { id: "second", title: "Second", workerId: "coder", prompt: "{task}", carry: true },
      ],
    });

    let call = 0;
    const result = await runWorkflow(
      { workflowId: "fail-mid", task: "do", limits },
      {
        resolveWorker: async (workerId) => workerId,
        sendToWorker: async () => {
          call += 1;
          if (call === 2) return { success: false, error: "boom" };
          return { success: true, response: "ok" };
        },
      }
    );

    expect(result.steps.length).toBe(2);
    expect(result.steps[1]?.status).toBe("error");
    expect(result.steps[1]?.error).toBe("boom");
  });

  test("does not include attachments after the first step", async () => {
    registerWorkflow({
      id: "attachments-flow",
      name: "Attachments",
      description: "Attachments first step only",
      steps: [
        { id: "one", title: "One", workerId: "coder", prompt: "{task}", carry: true },
        { id: "two", title: "Two", workerId: "coder", prompt: "{task}", carry: true },
      ],
    });

    const attachmentsSeen: Array<boolean> = [];
    await runWorkflow(
      {
        workflowId: "attachments-flow",
        task: "do",
        limits,
        attachments: [{ type: "file", path: "fake.txt" }],
      },
      {
        resolveWorker: async (workerId) => workerId,
        sendToWorker: async (_workerId, _message, options) => {
          attachmentsSeen.push(Array.isArray(options.attachments) && options.attachments.length > 0);
          return { success: true, response: "ok" };
        },
      }
    );

    expect(attachmentsSeen).toEqual([true, false]);
  });

  test("passes autoSpawn flag through resolveWorker", async () => {
    registerWorkflow({
      id: "auto-spawn",
      name: "Auto Spawn",
      description: "Checks auto spawn",
      steps: [{ id: "only", title: "Only", workerId: "coder", prompt: "{task}", carry: true }],
    });

    let seenAutoSpawn: boolean | undefined;
    await runWorkflow(
      { workflowId: "auto-spawn", task: "do", limits, autoSpawn: false },
      {
        resolveWorker: async (_workerId, autoSpawn) => {
          seenAutoSpawn = autoSpawn;
          return "coder";
        },
        sendToWorker: async () => ({ success: true, response: "ok" }),
      }
    );
    expect(seenAutoSpawn).toBe(false);
  });

  test("truncates carry to maxCarryChars", async () => {
    registerWorkflow({
      id: "carry-limit",
      name: "Carry Limit",
      description: "Carry truncation",
      steps: [
        { id: "step1", title: "Step1", workerId: "coder", prompt: "{task}", carry: true },
        { id: "step2", title: "Step2", workerId: "coder", prompt: "{carry}", carry: true },
      ],
    });

    const smallLimits = { ...limits, maxCarryChars: 10 };
    let carrySeen = "";
    let calls = 0;
    await runWorkflow(
      { workflowId: "carry-limit", task: "do", limits: smallLimits },
      {
        resolveWorker: async (workerId) => workerId,
        sendToWorker: async (_workerId, message) => {
          calls += 1;
          if (calls === 2) carrySeen = message;
          return { success: true, response: "0123456789ABCDEFGHIJ" };
        },
      }
    );

    expect(carrySeen.length).toBeGreaterThan(0);
    expect(carrySeen.includes("ABCDEFGHIJ")).toBe(true);
  });

  test("supports workflows with single step", async () => {
    registerWorkflow({
      id: "single-step",
      name: "Single",
      description: "One step",
      steps: [{ id: "only", title: "Only", workerId: "coder", prompt: "{task}", carry: true }],
    });

    const result = await runWorkflow(
      { workflowId: "single-step", task: "do", limits },
      {
        resolveWorker: async (workerId) => workerId,
        sendToWorker: async () => ({ success: true, response: "done" }),
      }
    );

    expect(result.steps.length).toBe(1);
    expect(result.steps[0]?.response).toBe("done");
  });

  test("records duration for each step", async () => {
    registerWorkflow({
      id: "duration",
      name: "Duration",
      description: "Duration records",
      steps: [{ id: "only", title: "Only", workerId: "coder", prompt: "{task}", carry: true }],
    });

    const result = await runWorkflow(
      { workflowId: "duration", task: "do", limits },
      {
        resolveWorker: async (workerId) => workerId,
        sendToWorker: async () => ({ success: true, response: "done" }),
      }
    );

    expect(result.steps[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("fails on unknown workflow", async () => {
    await expect(
      runWorkflow(
        { workflowId: "missing", task: "do", limits },
        {
          resolveWorker: async (workerId) => workerId,
          sendToWorker: async () => ({ success: true, response: "ok" }),
        }
      )
    ).rejects.toThrow("Unknown workflow");
  });

  test("does not carry when step.carry is false", async () => {
    registerWorkflow({
      id: "no-carry",
      name: "No Carry",
      description: "Carry disabled",
      steps: [
        { id: "first", title: "First", workerId: "coder", prompt: "{task}", carry: false },
        { id: "second", title: "Second", workerId: "coder", prompt: "Carry:\n{carry}", carry: true },
      ],
    });

    let secondMessage = "";
    await runWorkflow(
      { workflowId: "no-carry", task: "do", limits },
      {
        resolveWorker: async (workerId) => workerId,
        sendToWorker: async (_workerId, message) => {
          if (message.includes("Carry:")) secondMessage = message;
          return { success: true, response: "ok" };
        },
      }
    );

    expect(secondMessage).toContain("Carry:");
    expect(secondMessage).not.toContain("### First");
  });
});
