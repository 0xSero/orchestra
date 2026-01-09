import { describe, it, expect } from "bun:test";
import { WorkerJobRegistry, type JobsConfig } from "../../../src/core/jobs";

describe("WorkerJobRegistry", () => {
  describe("pruning with configurable limits", () => {
    it("should prune jobs when age exceeds maxAgeMs", () => {
      const registry = new WorkerJobRegistry({
        maxAgeMs: 1000,
        maxCount: 100,
      });

      const oldJob = registry.create({
        workerId: "worker-1",
        message: "Old job",
      });
      oldJob.status = "succeeded";
      (oldJob as any).finishedAt = Date.now() - 2000;

      const newJob = registry.create({
        workerId: "worker-1",
        message: "New job",
      });
      newJob.status = "succeeded";
      (newJob as any).finishedAt = Date.now() - 500;

      registry.pruneStaleJobs();

      expect(registry.get(oldJob.id)).toBeUndefined();
      expect(registry.get(newJob.id)).toBeDefined();
    });

    it("should prune jobs when count exceeds maxCount", () => {
      const registry = new WorkerJobRegistry({
        maxAgeMs: 3600000,
        maxCount: 3,
      });

      const jobs: string[] = [];
      for (let i = 0; i < 5; i++) {
        const job = registry.create({
          workerId: "worker-1",
          message: `Job ${i}`,
        });
        job.status = "succeeded";
        (job as any).finishedAt = Date.now() - 1000;
        jobs.push(job.id);
      }

      registry.pruneStaleJobs();

      const allJobs = registry.list();
      expect(allJobs.length).toBeLessThanOrEqual(3);
    });

    it("should never prune running jobs", () => {
      const registry = new WorkerJobRegistry({
        maxAgeMs: 1,
        maxCount: 1,
      });

      const runningJob = registry.create({
        workerId: "worker-1",
        message: "Running job",
      });

      const completedJob = registry.create({
        workerId: "worker-1",
        message: "Completed job",
      });
      completedJob.status = "succeeded";
      (completedJob as any).finishedAt = Date.now() - 10000;

      registry.pruneStaleJobs();

      expect(registry.get(runningJob.id)).toBeDefined();
      expect(registry.get(completedJob.id)).toBeUndefined();
    });

    it("should use default limits when not configured", () => {
      const registry = new WorkerJobRegistry();

      const config = registry.getConfig();
      expect(config.maxJobAgeMs).toBe(3600000);
      expect(config.maxJobs).toBe(100);
    });

    it("should respect custom config limits", () => {
      const config: JobsConfig = {
        maxAgeMs: 5000,
        maxCount: 5,
      };
      const registry = new WorkerJobRegistry(config);

      const actualConfig = registry.getConfig();
      expect(actualConfig.maxJobAgeMs).toBe(5000);
      expect(actualConfig.maxJobs).toBe(5);
    });

    it("should update config via configure method", () => {
      const registry = new WorkerJobRegistry();

      registry.configure({ maxAgeMs: 10000, maxCount: 50 });

      const config = registry.getConfig();
      expect(config.maxJobAgeMs).toBe(10000);
      expect(config.maxJobs).toBe(50);
    });

    it("should only update provided config values", () => {
      const registry = new WorkerJobRegistry({
        maxAgeMs: 5000,
        maxCount: 50,
      });

      registry.configure({ maxAgeMs: 10000 });

      const config = registry.getConfig();
      expect(config.maxJobAgeMs).toBe(10000);
      expect(config.maxJobs).toBe(50);
    });

    it("should not prune jobs waiting on await", async () => {
      const registry = new WorkerJobRegistry({
        maxAgeMs: 1,
        maxCount: 1,
      });

      const job = registry.create({
        workerId: "worker-1",
        message: "Job with waiter",
      });

      const awaitPromise = registry.await(job.id);

      job.status = "succeeded";
      (job as any).finishedAt = Date.now() - 10000;

      registry.pruneStaleJobs();

      expect(registry.get(job.id)).toBeDefined();

      awaitPromise.catch(() => {});
    });

    it("should prune old jobs and keep newer ones", () => {
      const registry = new WorkerJobRegistry({
        maxAgeMs: 2000,
        maxCount: 100,
      });

      const oldJob = registry.create({
        workerId: "worker-1",
        message: "Old job",
      });
      oldJob.status = "succeeded";
      (oldJob as any).finishedAt = Date.now() - 3000;

      const newJob = registry.create({
        workerId: "worker-1",
        message: "New job",
      });
      newJob.status = "succeeded";
      (newJob as any).finishedAt = Date.now() - 500;

      const jobs = registry.list();
      expect(jobs.length).toBe(1);
      expect(jobs[0].id).toBe(newJob.id);
    });
  });

  describe("periodic cleanup integration", () => {
    it("should expose pruneStaleJobs for periodic cleanup", () => {
      const registry = new WorkerJobRegistry();

      expect(typeof registry.pruneStaleJobs).toBe("function");
    });
  });
});
