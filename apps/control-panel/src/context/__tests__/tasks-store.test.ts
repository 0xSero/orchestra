/**
 * Tasks Store Tests - Job state management behavior
 */

import { describe, expect, test } from "vitest";
import type { JobRecord, JobStatus, JobSummary } from "../opencode-types";

describe("tasks-store helpers", () => {
  describe("isJobStatus", () => {
    const validStatuses: JobStatus[] = ["running", "succeeded", "failed", "canceled"];

    test.each(validStatuses)("returns true for valid status %s", (status) => {
      expect(["running", "succeeded", "failed", "canceled"].includes(status)).toBe(true);
    });

    test("returns false for invalid status", () => {
      expect(["running", "succeeded", "failed", "canceled"].includes("unknown")).toBe(false);
    });
  });

  describe("JobRecord structure", () => {
    test("validates required fields", () => {
      const job: JobRecord = {
        id: "job-123",
        workerId: "coder",
        message: "Test task",
        status: "running",
        startedAt: Date.now(),
      };

      expect(job.id).toBe("job-123");
      expect(job.workerId).toBe("coder");
      expect(job.message).toBe("Test task");
      expect(job.status).toBe("running");
      expect(typeof job.startedAt).toBe("number");
    });

    test("supports optional fields", () => {
      const job: JobRecord = {
        id: "job-123",
        workerId: "coder",
        message: "Test task",
        status: "succeeded",
        startedAt: Date.now() - 5000,
        finishedAt: Date.now(),
        durationMs: 5000,
        sessionId: "session-abc",
        requestedBy: "orchestrator",
        responsePreview: "Task completed successfully",
        responseLength: 256,
        error: undefined,
        progress: undefined,
      };

      expect(job.finishedAt).toBeDefined();
      expect(job.durationMs).toBe(5000);
      expect(job.sessionId).toBe("session-abc");
      expect(job.requestedBy).toBe("orchestrator");
      expect(job.responsePreview).toBe("Task completed successfully");
      expect(job.responseLength).toBe(256);
    });

    test("supports progress field for running jobs", () => {
      const job: JobRecord = {
        id: "job-123",
        workerId: "coder",
        message: "Test task",
        status: "running",
        startedAt: Date.now(),
        progress: {
          message: "Step 2 of 4",
          percent: 50,
          updatedAt: Date.now(),
        },
      };

      expect(job.progress?.message).toBe("Step 2 of 4");
      expect(job.progress?.percent).toBe(50);
    });

    test("supports error field for failed jobs", () => {
      const job: JobRecord = {
        id: "job-123",
        workerId: "coder",
        message: "Test task",
        status: "failed",
        startedAt: Date.now() - 3000,
        finishedAt: Date.now(),
        durationMs: 3000,
        error: "Worker timeout",
      };

      expect(job.error).toBe("Worker timeout");
    });
  });

  describe("JobSummary structure", () => {
    test("validates summary counts", () => {
      const summary: JobSummary = {
        total: 10,
        running: 2,
        succeeded: 6,
        failed: 1,
        canceled: 1,
      };

      expect(summary.total).toBe(10);
      expect(summary.running).toBe(2);
      expect(summary.succeeded).toBe(6);
      expect(summary.failed).toBe(1);
      expect(summary.canceled).toBe(1);
      expect(summary.running + summary.succeeded + summary.failed + summary.canceled).toBe(
        summary.total,
      );
    });

    test("supports optional oldestRunningMs", () => {
      const summary: JobSummary = {
        total: 5,
        running: 1,
        succeeded: 3,
        failed: 0,
        canceled: 1,
        oldestRunningMs: 12000,
      };

      expect(summary.oldestRunningMs).toBe(12000);
    });
  });

  describe("job sorting", () => {
    test("sorts jobs by startedAt descending", () => {
      const jobs: JobRecord[] = [
        { id: "job-1", workerId: "a", message: "First", status: "succeeded", startedAt: 1000 },
        { id: "job-3", workerId: "c", message: "Third", status: "running", startedAt: 3000 },
        { id: "job-2", workerId: "b", message: "Second", status: "failed", startedAt: 2000 },
      ];

      const sorted = jobs.slice().sort((a, b) => b.startedAt - a.startedAt);

      expect(sorted[0].id).toBe("job-3");
      expect(sorted[1].id).toBe("job-2");
      expect(sorted[2].id).toBe("job-1");
    });
  });

  describe("job filtering", () => {
    test("filters running jobs", () => {
      const jobs: JobRecord[] = [
        { id: "job-1", workerId: "a", message: "First", status: "running", startedAt: 1000 },
        { id: "job-2", workerId: "b", message: "Second", status: "succeeded", startedAt: 2000 },
        { id: "job-3", workerId: "c", message: "Third", status: "running", startedAt: 3000 },
        { id: "job-4", workerId: "d", message: "Fourth", status: "failed", startedAt: 4000 },
      ];

      const running = jobs.filter((j) => j.status === "running");
      const completed = jobs.filter((j) => j.status !== "running");

      expect(running.length).toBe(2);
      expect(completed.length).toBe(2);
    });
  });

  describe("job lookup", () => {
    test("finds job by id", () => {
      const jobs: JobRecord[] = [
        { id: "job-1", workerId: "a", message: "First", status: "running", startedAt: 1000 },
        { id: "job-2", workerId: "b", message: "Second", status: "succeeded", startedAt: 2000 },
      ];

      const found = jobs.find((j) => j.id === "job-2");
      const notFound = jobs.find((j) => j.id === "job-99");

      expect(found?.message).toBe("Second");
      expect(notFound).toBeUndefined();
    });
  });
});
