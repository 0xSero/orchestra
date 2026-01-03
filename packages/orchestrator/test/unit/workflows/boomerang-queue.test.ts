import { describe, expect, test } from "bun:test";
import type { BoomerangQueueTask } from "../../../src/workflows/runner";
import { runBoomerangQueueWithDependencies } from "../../../src/workflows/runner";
import { registerWorkflow } from "../../../src/workflows/engine";
import { buildBoomerangRunWorkflow } from "../../../src/workflows/boomerang-run";

const limits = {
  maxSteps: 4,
  maxTaskChars: 4000,
  maxCarryChars: 4000,
  perStepTimeoutMs: 5000,
};

const tasks: BoomerangQueueTask[] = [
  { id: "task-00", path: "tasks/task-00.md", content: "Task zero" },
  { id: "task-01", path: "tasks/task-01.md", content: "Task one" },
  { id: "task-02", path: "tasks/task-02.md", content: "Task two" },
];

describe("boomerang queue runner", () => {
  test("runs tasks in order and records results", async () => {
    registerWorkflow(buildBoomerangRunWorkflow());
    const prompts: string[] = [];

    const run = await runBoomerangQueueWithDependencies(
      {
        workflowId: "boomerang-run",
        task: "run queue",
        tasks,
        limits,
      },
      {
        resolveWorker: async (workerId) => workerId,
        sendToWorker: async (_workerId, message) => {
          prompts.push(message);
          return { success: true, response: `ok-${prompts.length}` };
        },
      },
    );

    expect(run.status).toBe("success");
    expect(run.steps.map((step) => step.title)).toEqual(
      tasks.map((task) => task.id),
    );
    expect(prompts.length).toBe(tasks.length);
    expect(prompts[0]).toContain(tasks[0].content);
    expect(prompts[1]).toContain(tasks[1].content);
    expect(prompts[2]).toContain(tasks[2].content);
  });

  test("waits for idle and avoids overlapping sends", async () => {
    registerWorkflow(buildBoomerangRunWorkflow());
    let ready = false;
    let waitCalls = 0;
    let inFlight = 0;
    let overlaps = 0;

    const run = await runBoomerangQueueWithDependencies(
      {
        workflowId: "boomerang-run",
        task: "run queue",
        tasks,
        limits,
      },
      {
        resolveWorker: async (workerId) => workerId,
        waitForWorkerReady: async () => {
          waitCalls += 1;
          ready = true;
        },
        sendToWorker: async () => {
          inFlight += 1;
          if (inFlight > 1) overlaps += 1;
          if (!ready) return { success: false, error: "not ready" };
          ready = false;
          await new Promise((resolve) => setTimeout(resolve, 1));
          inFlight -= 1;
          return { success: true, response: "ok" };
        },
      },
    );

    expect(run.status).toBe("success");
    expect(waitCalls).toBe(tasks.length);
    expect(overlaps).toBe(0);
  });
});
