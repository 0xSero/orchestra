import { describe, expect, test } from "bun:test";
import { buildPendingTaskReminder } from "../../src/core/guardrails";
import { workerJobs } from "../../src/core/jobs";

describe("guardrails", () => {
  test("builds pending task reminder for running tasks", () => {
    const sessionId = `session-${Date.now()}`;
    const job = workerJobs.create({
      workerId: "coder",
      message: "do work",
      sessionId,
    });

    const reminder = buildPendingTaskReminder(sessionId);
    expect(reminder).toBeTruthy();
    expect(reminder).toContain(job.id);
    expect(reminder).toContain("task_await");

    workerJobs.cancel(job.id, { reason: "cleanup" });
  });

  test("skips reminder when no pending tasks", () => {
    const reminder = buildPendingTaskReminder(`session-${Date.now()}`);
    expect(reminder).toBeUndefined();
  });
});
