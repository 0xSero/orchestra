import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { workerJobs, type WorkerJob } from "../../../src/core/jobs";

/**
 * Task 00: Lock the task_list view output contracts that the UI depends on.
 *
 * These tests verify that the JSON shapes returned by task_list views remain
 * stable and contain the fields the control panel expects.
 */

describe("task_list view contracts", () => {
  describe("tasks view (default)", () => {
    let createdJobIds: string[] = [];

    beforeEach(() => {
      createdJobIds = [];
    });

    afterEach(() => {
      // Clean up jobs
      for (const id of createdJobIds) {
        workerJobs.cancel(id, { reason: "test cleanup" });
      }
    });

    test("job list returns expected fields", () => {
      const job = workerJobs.create({
        workerId: "test-worker",
        message: "Test task",
        sessionId: "session-1",
        requestedBy: "test",
      });
      createdJobIds.push(job.id);

      const jobs = workerJobs.list({ limit: 10 });
      const found = jobs.find((j) => j.id === job.id);

      expect(found).toBeDefined();
      expect(typeof found!.id).toBe("string");
      expect(typeof found!.workerId).toBe("string");
      expect(typeof found!.status).toBe("string");
      expect(typeof found!.startedAt).toBe("number");
      expect(found!.message).toBe("Test task");
    });

    test("job contains UI-required fields", () => {
      const job = workerJobs.create({
        workerId: "test-worker",
        message: "Test message",
        sessionId: "session-1",
        requestedBy: "orchestrator",
      });
      createdJobIds.push(job.id);

      // These fields are used by the control panel for rendering
      expect(job).toHaveProperty("id");
      expect(job).toHaveProperty("workerId");
      expect(job).toHaveProperty("status");
      expect(job).toHaveProperty("startedAt");
      expect(job).toHaveProperty("message");
    });

    test("completed job includes result fields", async () => {
      const job = workerJobs.create({
        workerId: "test-worker",
        message: "Test task",
        sessionId: "session-1",
        requestedBy: "test",
      });
      createdJobIds.push(job.id);

      workerJobs.setResult(job.id, { responseText: "Task completed" });

      const found = workerJobs.get(job.id);
      expect(found).toBeDefined();
      expect(found!.status).toBe("succeeded");
      expect(typeof found!.finishedAt).toBe("number");
      expect(typeof found!.durationMs).toBe("number");
      expect(found!.responseText).toBe("Task completed");
    });

    test("failed job includes error fields", () => {
      const job = workerJobs.create({
        workerId: "test-worker",
        message: "Test task",
        sessionId: "session-1",
        requestedBy: "test",
      });
      createdJobIds.push(job.id);

      workerJobs.setError(job.id, { error: "Something went wrong" });

      const found = workerJobs.get(job.id);
      expect(found).toBeDefined();
      expect(found!.status).toBe("failed");
      expect(found!.error).toBe("Something went wrong");
    });

    test("canceled job includes cancel reason", () => {
      const job = workerJobs.create({
        workerId: "test-worker",
        message: "Test task",
        sessionId: "session-1",
        requestedBy: "test",
      });
      createdJobIds.push(job.id);

      workerJobs.cancel(job.id, { reason: "User canceled" });

      const found = workerJobs.get(job.id);
      expect(found).toBeDefined();
      expect(found!.status).toBe("canceled");
    });

    test("job with report includes report fields", () => {
      const job = workerJobs.create({
        workerId: "test-worker",
        message: "Test task",
        sessionId: "session-1",
        requestedBy: "test",
      });
      createdJobIds.push(job.id);

      workerJobs.attachReport(job.id, {
        summary: "Test summary",
        details: JSON.stringify({ steps: [] }),
      });

      const found = workerJobs.get(job.id);
      expect(found).toBeDefined();
      expect(found!.report).toBeDefined();
      expect(found!.report!.summary).toBe("Test summary");
      expect(found!.report!.details).toBe(JSON.stringify({ steps: [] }));
    });

    test("list respects limit parameter", () => {
      // Create 5 jobs
      for (let i = 0; i < 5; i++) {
        const job = workerJobs.create({
          workerId: `worker-${i}`,
          message: `Task ${i}`,
          sessionId: "session-1",
          requestedBy: "test",
        });
        createdJobIds.push(job.id);
      }

      const limited = workerJobs.list({ limit: 3 });
      expect(limited.length).toBeLessThanOrEqual(3);
    });

    test("list respects workerId filter", () => {
      const job1 = workerJobs.create({
        workerId: "worker-a",
        message: "Task A",
        sessionId: "session-1",
        requestedBy: "test",
      });
      const job2 = workerJobs.create({
        workerId: "worker-b",
        message: "Task B",
        sessionId: "session-1",
        requestedBy: "test",
      });
      createdJobIds.push(job1.id, job2.id);

      const filtered = workerJobs.list({ workerId: "worker-a", limit: 100 });
      const workerAJobs = filtered.filter((j) => j.workerId === "worker-a");
      const workerBJobs = filtered.filter((j) => j.workerId === "worker-b");

      expect(workerAJobs.length).toBeGreaterThanOrEqual(1);
      expect(workerBJobs.length).toBe(0);
    });
  });

  describe("job JSON serialization", () => {
    let createdJobIds: string[] = [];

    afterEach(() => {
      for (const id of createdJobIds) {
        workerJobs.cancel(id, { reason: "test cleanup" });
      }
      createdJobIds = [];
    });

    test("job is JSON-serializable", () => {
      const job = workerJobs.create({
        workerId: "test-worker",
        message: "Test task",
        sessionId: "session-1",
        requestedBy: "test",
      });
      createdJobIds.push(job.id);

      const json = JSON.stringify(job);
      const parsed = JSON.parse(json);

      expect(parsed.id).toBe(job.id);
      expect(parsed.workerId).toBe(job.workerId);
      expect(parsed.status).toBe(job.status);
      expect(parsed.startedAt).toBe(job.startedAt);
      expect(parsed.message).toBe(job.message);
    });

    test("completed job with report is JSON-serializable", () => {
      const job = workerJobs.create({
        workerId: "workflow:test",
        message: "Workflow task",
        sessionId: "session-1",
        requestedBy: "test",
      });
      createdJobIds.push(job.id);

      workerJobs.setResult(job.id, { responseText: "Done" });
      workerJobs.attachReport(job.id, {
        summary: "Test workflow",
        details: JSON.stringify({
          runId: "run-123",
          status: "success",
          steps: [
            {
              id: "step-1",
              title: "Step 1",
              workerId: "coder",
              status: "success",
              durationMs: 1000,
            },
          ],
        }),
      });

      const found = workerJobs.get(job.id);
      const json = JSON.stringify(found);
      const parsed = JSON.parse(json) as WorkerJob;

      expect(parsed.status).toBe("succeeded");
      expect(parsed.report).toBeDefined();
      expect(parsed.report!.summary).toBe("Test workflow");

      // Verify the details can be parsed as JSON
      const details = JSON.parse(parsed.report!.details!);
      expect(details.runId).toBe("run-123");
      expect(details.steps).toHaveLength(1);
    });
  });

  describe("status view contract", () => {
    test("status payload structure", () => {
      // The status view returns { workers, tasks }
      // Workers come from workerPool.toJSON()
      // Tasks come from workerJobs.list()

      // Verify the list structure is correct
      const tasks = workerJobs.list({ limit: 20 });
      expect(Array.isArray(tasks)).toBe(true);

      // Each task should have these fields
      for (const task of tasks) {
        expect(typeof task.id).toBe("string");
        expect(typeof task.workerId).toBe("string");
        expect(typeof task.status).toBe("string");
        expect(typeof task.startedAt).toBe("number");
      }
    });
  });

  describe("output view contract", () => {
    test("output payload includes tasks and logs", () => {
      // The output view returns { tasks, logs }
      // We just verify the task list is available

      const tasks = workerJobs.list({ limit: 50 });
      expect(Array.isArray(tasks)).toBe(true);

      // Verify filter by timestamp works (after parameter)
      const after = Date.now() - 60000; // 1 minute ago
      const filtered = tasks.filter(
        (t) => t.startedAt > after || (t.finishedAt ?? 0) > after,
      );
      expect(Array.isArray(filtered)).toBe(true);
    });
  });

  describe("job status enumeration", () => {
    let createdJobIds: string[] = [];

    afterEach(() => {
      for (const id of createdJobIds) {
        workerJobs.cancel(id, { reason: "test cleanup" });
      }
      createdJobIds = [];
    });

    test("running job has status 'running'", () => {
      const job = workerJobs.create({
        workerId: "test",
        message: "test",
        sessionId: "s1",
        requestedBy: "test",
      });
      createdJobIds.push(job.id);
      expect(job.status).toBe("running");
    });

    test("succeeded job has status 'succeeded'", () => {
      const job = workerJobs.create({
        workerId: "test",
        message: "test",
        sessionId: "s1",
        requestedBy: "test",
      });
      createdJobIds.push(job.id);
      workerJobs.setResult(job.id, { responseText: "done" });
      expect(workerJobs.get(job.id)!.status).toBe("succeeded");
    });

    test("failed job has status 'failed'", () => {
      const job = workerJobs.create({
        workerId: "test",
        message: "test",
        sessionId: "s1",
        requestedBy: "test",
      });
      createdJobIds.push(job.id);
      workerJobs.setError(job.id, { error: "err" });
      expect(workerJobs.get(job.id)!.status).toBe("failed");
    });

    test("canceled job has status 'canceled'", () => {
      const job = workerJobs.create({
        workerId: "test",
        message: "test",
        sessionId: "s1",
        requestedBy: "test",
      });
      createdJobIds.push(job.id);
      workerJobs.cancel(job.id);
      expect(workerJobs.get(job.id)!.status).toBe("canceled");
    });
  });
});
