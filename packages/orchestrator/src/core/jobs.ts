import { randomUUID } from "node:crypto";

export type WorkerJobStatus = "running" | "succeeded" | "failed" | "canceled";

export type WorkerJobReport = {
  summary?: string;
  details?: string;
  issues?: string[];
  notes?: string;
};

export type WorkerJobProgress = {
  message: string;
  percent?: number;
  updatedAt: number;
};

export type WorkerJob = {
  id: string;
  workerId: string;
  message: string;
  sessionId?: string;
  requestedBy?: string;
  status: WorkerJobStatus;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  responseText?: string;
  error?: string;
  report?: WorkerJobReport;
  progress?: WorkerJobProgress;
};

export type JobEventCallback = (
  job: WorkerJob,
  event: "created" | "progress" | "completed" | "failed" | "canceled",
) => void;

/** Maximum number of completed jobs to retain (tuned for 24/7 operation, override via config.tasks.jobs.maxCount) */
const DEFAULT_MAX_JOBS = 100;
/** Maximum age of completed jobs in ms (tuned for 24/7 operation, override via config.tasks.jobs.maxAgeMs) */
const DEFAULT_MAX_JOB_AGE_MS = 60 * 60 * 1000;
const NO_TIMEOUT = 0;

export interface JobsConfig {
  maxAgeMs?: number;
  maxCount?: number;
}

export class WorkerJobRegistry {
  private jobs = new Map<string, WorkerJob>();
  private waiters = new Map<string, Set<(job: WorkerJob) => void>>();
  private eventListeners = new Set<JobEventCallback>();
  private maxJobs: number;
  private maxJobAgeMs: number;

  constructor(config?: JobsConfig) {
    this.maxJobs = config?.maxCount ?? DEFAULT_MAX_JOBS;
    this.maxJobAgeMs = config?.maxAgeMs ?? DEFAULT_MAX_JOB_AGE_MS;
  }

  onJobEvent(callback: JobEventCallback): () => void {
    this.eventListeners.add(callback);
    return () => this.eventListeners.delete(callback);
  }

  private emitEvent(
    job: WorkerJob,
    event: "created" | "progress" | "completed" | "failed" | "canceled",
  ): void {
    for (const listener of this.eventListeners) {
      try {
        listener(job, event);
      } catch {
        // ignore listener errors
      }
    }
  }

  create(input: {
    workerId: string;
    message: string;
    sessionId?: string;
    requestedBy?: string;
  }): WorkerJob {
    const id = randomUUID();
    const job: WorkerJob = {
      id,
      workerId: input.workerId,
      message: input.message,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.requestedBy ? { requestedBy: input.requestedBy } : {}),
      status: "running",
      startedAt: Date.now(),
    };
    this.jobs.set(id, job);
    this.emitEvent(job, "created");
    this.prune();
    return job;
  }

  get(id: string): WorkerJob | undefined {
    return this.jobs.get(id);
  }

  list(options?: {
    workerId?: string;
    sessionId?: string;
    status?: WorkerJobStatus;
    limit?: number;
  }): WorkerJob[] {
    const limit = Math.max(1, options?.limit ?? 50);
    const arr = [...this.jobs.values()]
      .filter((j) =>
        options?.workerId ? j.workerId === options.workerId : true,
      )
      .filter((j) =>
        options?.sessionId ? j.sessionId === options.sessionId : true,
      )
      .filter((j) => (options?.status ? j.status === options.status : true))
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);
    return arr;
  }

  getRunningJobs(): WorkerJob[] {
    return [...this.jobs.values()].filter((j) => j.status === "running");
  }

  getAllJobs(): WorkerJob[] {
    return [...this.jobs.values()];
  }

  getRunningJobsCount(): number {
    return this.getRunningJobs().length;
  }

  updateProgress(
    id: string,
    progress: { message: string; percent?: number },
  ): void {
    const job = this.jobs.get(id);
    if (!job || job.status !== "running") return;
    job.progress = {
      message: progress.message,
      percent: progress.percent,
      updatedAt: Date.now(),
    };
    this.emitEvent(job, "progress");
  }

  setResult(id: string, input: { responseText: string }): void {
    const job = this.jobs.get(id);
    if (!job || job.status !== "running") return;
    job.status = "succeeded";
    job.responseText = input.responseText;
    job.finishedAt = Date.now();
    job.durationMs = job.finishedAt - job.startedAt;
    this.emitEvent(job, "completed");
    this.notify(id, job);
    this.prune();
  }

  setError(id: string, input: { error: string }): void {
    const job = this.jobs.get(id);
    if (!job || job.status !== "running") return;
    job.status = "failed";
    job.error = input.error;
    job.finishedAt = Date.now();
    job.durationMs = job.finishedAt - job.startedAt;
    this.emitEvent(job, "failed");
    this.notify(id, job);
    this.prune();
  }

  cancel(id: string, input?: { reason?: string }): void {
    const job = this.jobs.get(id);
    if (!job || job.status !== "running") return;
    job.status = "canceled";
    if (input?.reason) job.error = input.reason;
    job.finishedAt = Date.now();
    job.durationMs = job.finishedAt - job.startedAt;
    this.emitEvent(job, "canceled");
    this.notify(id, job);
    this.prune();
  }

  attachReport(id: string, report: WorkerJobReport): void {
    const job = this.jobs.get(id);
    if (!job) return;
    job.report = { ...(job.report ?? {}), ...report };
    this.prune();
  }

  async await(
    id: string,
    options?: { timeoutMs?: number; noTimeout?: boolean },
  ): Promise<WorkerJob> {
    const existing = this.jobs.get(id);
    if (!existing) throw new Error(`Unknown job "${id}"`);
    if (existing.status !== "running") return existing;

    const timeoutMs = options?.noTimeout
      ? NO_TIMEOUT
      : (options?.timeoutMs ?? 600_000);

    return await new Promise<WorkerJob>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          this.offWaiter(id, onDone);
          const job = this.jobs.get(id);
          const elapsed = job ? Date.now() - job.startedAt : timeoutMs;
          const progressInfo = job?.progress
            ? ` (last progress: ${job.progress.message})`
            : "";
          reject(
            new Error(
              `Timed out waiting for job "${id}" after ${elapsed}ms${progressInfo}`,
            ),
          );
        }, timeoutMs);
      }

      const onDone = (job: WorkerJob) => {
        if (timer) clearTimeout(timer);
        resolve(job);
      };
      this.onWaiter(id, onDone);
    });
  }

  getJobSummary(): {
    total: number;
    running: number;
    succeeded: number;
    failed: number;
    canceled: number;
    oldestRunningMs?: number;
  } {
    const jobs = [...this.jobs.values()];
    const running = jobs.filter((j) => j.status === "running");
    const now = Date.now();
    const oldestRunning =
      running.length > 0
        ? Math.min(...running.map((j) => j.startedAt))
        : undefined;

    return {
      total: jobs.length,
      running: running.length,
      succeeded: jobs.filter((j) => j.status === "succeeded").length,
      failed: jobs.filter((j) => j.status === "failed").length,
      canceled: jobs.filter((j) => j.status === "canceled").length,
      oldestRunningMs: oldestRunning ? now - oldestRunning : undefined,
    };
  }

  private onWaiter(id: string, cb: (job: WorkerJob) => void) {
    const set = this.waiters.get(id) ?? new Set();
    set.add(cb);
    this.waiters.set(id, set);
  }

  private offWaiter(id: string, cb: (job: WorkerJob) => void) {
    const set = this.waiters.get(id);
    if (!set) return;
    set.delete(cb);
    if (set.size === 0) this.waiters.delete(id);
  }

  private notify(id: string, job: WorkerJob) {
    const set = this.waiters.get(id);
    if (!set) return;
    this.waiters.delete(id);
    set.forEach((cb) => cb(job));
  }

  private prune() {
    const now = Date.now();
    for (const [id, job] of this.jobs) {
      if (job.status === "running") continue;
      const ageMs = now - (job.finishedAt ?? job.startedAt);
      if (ageMs <= this.maxJobAgeMs) continue;
      if (this.waiters.has(id)) continue;
      this.jobs.delete(id);
    }

    if (this.jobs.size <= this.maxJobs) return;
    for (const [id, job] of this.jobs) {
      if (this.jobs.size <= this.maxJobs) break;
      if (job.status === "running") continue;
      if (this.waiters.has(id)) continue;
      this.jobs.delete(id);
    }
  }

  pruneStaleJobs(): void {
    this.prune();
  }

  configure(config: JobsConfig): void {
    this.maxJobs = config.maxCount ?? this.maxJobs;
    this.maxJobAgeMs = config.maxAgeMs ?? this.maxJobAgeMs;
  }

  getConfig(): { maxJobs: number; maxJobAgeMs: number } {
    return {
      maxJobs: this.maxJobs,
      maxJobAgeMs: this.maxJobAgeMs,
    };
  }
}

export const workerJobs = new WorkerJobRegistry();
