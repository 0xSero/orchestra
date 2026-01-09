import { describe, it, expect, beforeEach } from "bun:test";
import { JobsPersistence } from "../../../src/core/jobs-persistence";
import type { WorkerJob, WorkerJobStatus } from "../../../src/core/jobs";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("JobsPersistence", () => {
  let tempDir: string;
  let runningJobs: WorkerJob[];

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "orchestrator-test-"));
    runningJobs = [];
  });

  const createMockJob = (
    id: string,
    status: WorkerJobStatus,
    extra?: Partial<WorkerJob>,
  ): WorkerJob => ({
    id,
    workerId: "test-worker",
    message: `Test job ${id}`,
    status,
    startedAt: Date.now() - 1000,
    ...extra,
  });

  it("should persist non-running jobs to file", async () => {
    const completedJob = createMockJob("job-1", "succeeded", {
      finishedAt: Date.now(),
      durationMs: 1000,
      responseText: "Done",
    });

    runningJobs.push(completedJob);

    const persistence = new JobsPersistence(
      () => [...runningJobs],
      () => {},
      {
        filePath: join(tempDir, "jobs.json"),
        intervalMs: 60000,
      },
    );

    await persistence.persist();

    const filePath = join(tempDir, "jobs.json");
    const file = await Bun.file(filePath).json();
    expect(file.jobs).toHaveLength(1);
    expect(file.jobs[0].id).toBe("job-1");
    expect(file.jobs[0].status).toBe("succeeded");

    persistence.stop();
  });

  it("should persist all jobs including running jobs", async () => {
    const runningJob = createMockJob("job-1", "running");

    runningJobs.push(runningJob);

    const persistence = new JobsPersistence(
      () => [...runningJobs],
      () => {},
      {
        filePath: join(tempDir, "jobs.json"),
        intervalMs: 60000,
      },
    );

    await persistence.persist();

    const filePath = join(tempDir, "jobs.json");
    const file = await Bun.file(filePath).json();
    expect(file.jobs).toHaveLength(1);
    expect(file.jobs[0].id).toBe("job-1");
    expect(file.jobs[0].status).toBe("running");

    persistence.stop();
  });

  it("should restore running jobs as failed on startup", async () => {
    const failedResults: Array<{ jobId: string; reason: string }> = [];

    const persistence = new JobsPersistence(
      () => [...runningJobs],
      (jobId: string, reason: string) => {
        failedResults.push({ jobId, reason });
      },
      {
        filePath: join(tempDir, "jobs.json"),
        intervalMs: 60000,
      },
    );

    const runningJob = createMockJob("persisted-job-1", "running");
    runningJobs.push(runningJob);

    await persistence.persist();

    runningJobs.length = 0;

    await persistence.restoreRunningJobs();

    expect(failedResults).toHaveLength(1);
    expect(failedResults[0].jobId).toBe("persisted-job-1");
    expect(failedResults[0].reason).toBe("Process crashed");

    persistence.stop();
  });

  it("should use config override", () => {
    const persistence = new JobsPersistence(
      () => [],
      () => {},
      {
        enabled: false,
        intervalMs: 10000,
        filePath: join(tempDir, "jobs.json"),
      },
    );

    const config = persistence.getConfig();
    expect(config.enabled).toBe(false);
    expect(config.intervalMs).toBe(10000);

    persistence.stop();
  });

  it("should use default config", () => {
    const persistence = new JobsPersistence(
      () => [],
      () => {},
    );

    const config = persistence.getConfig();
    expect(config.enabled).toBe(true);
    expect(config.intervalMs).toBe(30000);

    persistence.stop();
  });

  it("should start and stop interval", () => {
    const persistence = new JobsPersistence(
      () => [],
      () => {},
      {
        intervalMs: 100,
        filePath: join(tempDir, "jobs.json"),
      },
    );

    persistence.start();
    expect(persistence.getIsRunning()).toBe(true);

    persistence.stop();
    expect(persistence.getIsRunning()).toBe(false);
  });

  it("should handle empty jobs list", async () => {
    const persistence = new JobsPersistence(
      () => [],
      () => {},
      {
        filePath: join(tempDir, "jobs.json"),
        intervalMs: 60000,
      },
    );

    await persistence.persist();

    const filePath = join(tempDir, "jobs.json");
    const exists = await Bun.file(filePath).exists();
    expect(exists).toBe(false);

    persistence.stop();
  });

  it("should handle write errors gracefully", async () => {
    const persistence = new JobsPersistence(
      () => [],
      () => {},
      {
        filePath: join(tempDir, "nonexistent", "nested", "jobs.json"),
        intervalMs: 60000,
      },
    );

    await persistence.persist();

    persistence.stop();
  });

  it("should clear persisted file", async () => {
    const completedJob = createMockJob("job-1", "succeeded");
    runningJobs.push(completedJob);

    const persistence = new JobsPersistence(
      () => [...runningJobs],
      () => {},
      {
        filePath: join(tempDir, "jobs.json"),
        intervalMs: 60000,
      },
    );

    await persistence.persist();

    const filePath = join(tempDir, "jobs.json");
    const exists1 = await Bun.file(filePath).exists();
    expect(exists1).toBe(true);

    await persistence.clear();

    const exists2 = await Bun.file(filePath).exists();
    expect(exists2).toBe(false);

    persistence.stop();
  });

  it("should preserve job fields during persistence", async () => {
    const completedJob = createMockJob("job-1", "failed", {
      finishedAt: Date.now(),
      durationMs: 500,
      error: "Something went wrong",
      report: {
        summary: "Task failed",
        details: "Detailed error info",
        issues: ["issue1", "issue2"],
        notes: "Additional notes",
      },
      progress: {
        message: "Processing",
        percent: 100,
        updatedAt: Date.now(),
      },
    });

    runningJobs.push(completedJob);

    const persistence = new JobsPersistence(
      () => [...runningJobs],
      () => {},
      {
        filePath: join(tempDir, "jobs.json"),
        intervalMs: 60000,
      },
    );

    await persistence.persist();

    const filePath = join(tempDir, "jobs.json");
    const file = await Bun.file(filePath).json();
    const persisted = file.jobs[0];

    expect(persisted.id).toBe("job-1");
    expect(persisted.workerId).toBe("test-worker");
    expect(persisted.message).toBe("Test job job-1");
    expect(persisted.status).toBe("failed");
    expect(persisted.error).toBe("Something went wrong");
    expect(persisted.report.summary).toBe("Task failed");
    expect(persisted.report.issues).toEqual(["issue1", "issue2"]);
    expect(persisted.progress.percent).toBe(100);

    persistence.stop();
  });
});
