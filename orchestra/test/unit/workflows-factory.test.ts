import { describe, expect, test } from "bun:test";
import { createWorkflowEngine } from "../../src/workflows/factory";
import type { WorkflowDefinition } from "../../src/workflows/types";

describe("workflow factory", () => {
  test("skips registration when disabled", async () => {
    const engine = createWorkflowEngine({ config: { enabled: false }, deps: {} });
    await engine.start();
    expect(engine.list().length).toBe(0);
  });

  test("validates workflow limits", async () => {
    const engine = createWorkflowEngine({ config: { enabled: true }, deps: {} });
    const wf: WorkflowDefinition = {
      id: "wf",
      name: "Workflow",
      description: "Basic workflow for validation tests.",
      steps: [{ id: "s1", title: "Step", workerId: "alpha", prompt: "{task}" }],
    };
    engine.register(wf);

    await expect(
      engine.run(
        {
          workflowId: "missing",
          task: "task",
          limits: { maxSteps: 1, maxTaskChars: 10, maxCarryChars: 10, perStepTimeoutMs: 10 },
        },
        { resolveWorker: async () => "alpha", sendToWorker: async () => ({ success: true, response: "ok" }) },
      ),
    ).rejects.toThrow("Unknown workflow");

    await expect(
      engine.run(
        {
          workflowId: "wf",
          task: "toolong",
          limits: { maxSteps: 1, maxTaskChars: 2, maxCarryChars: 10, perStepTimeoutMs: 10 },
        },
        { resolveWorker: async () => "alpha", sendToWorker: async () => ({ success: true, response: "ok" }) },
      ),
    ).rejects.toThrow("maxTaskChars");

    await expect(
      engine.run(
        {
          workflowId: "wf",
          task: "task",
          limits: { maxSteps: 0, maxTaskChars: 10, maxCarryChars: 10, perStepTimeoutMs: 10 },
        },
        { resolveWorker: async () => "alpha", sendToWorker: async () => ({ success: true, response: "ok" }) },
      ),
    ).rejects.toThrow("maxSteps");
  });

  test("records errors and carry context", async () => {
    const engine = createWorkflowEngine({ config: { enabled: true }, deps: {} });
    const wf: WorkflowDefinition = {
      id: "wf",
      name: "Workflow",
      description: "Workflow that carries context between steps.",
      steps: [
        { id: "s1", title: "Step 1", workerId: "alpha", prompt: "{task}", carry: true },
        { id: "s2", title: "Step 2", workerId: "alpha", prompt: "{carry}", carry: true },
      ],
    };
    engine.register(wf);

    let call = 0;
    const result = await engine.run(
      {
        workflowId: "wf",
        task: "task",
        limits: { maxSteps: 5, maxTaskChars: 100, maxCarryChars: 10, perStepTimeoutMs: 10 },
      },
      {
        resolveWorker: async () => "alpha",
        sendToWorker: async () => {
          call += 1;
          if (call === 1) return { success: true, response: "step one response" };
          return { success: false, error: "boom" };
        },
      },
    );

    expect(result.steps.length).toBe(2);
    expect(result.steps[0]?.status).toBe("success");
    expect(result.steps[1]?.status).toBe("error");
  });

  test("starts, reports health, and stops builtins", async () => {
    const engine = createWorkflowEngine({ config: { enabled: true }, deps: {} });
    await engine.start();
    expect(engine.list().length).toBeGreaterThan(0);

    const health = await engine.health();
    expect(health.ok).toBe(true);

    await engine.stop();
    expect(engine.list().length).toBe(0);
  });
});
