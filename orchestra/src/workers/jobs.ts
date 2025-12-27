import { randomUUID } from "node:crypto";

export type WorkerJobStatus = "running" | "succeeded" | "failed" | "canceled";

export type WorkerJobReport = {
  summary?: string;
  details?: string;
  issues?: string[];
  notes?: string;
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
};

const MAX_JOBS = 200;
const MAX_JOB_AGE_MS = 24 * 60 * 60 * 1000;

export class WorkerJobRegistry {
  private jobs = new Map<string, WorkerJob>();
  private waiters = new Map<string, Set<(job: WorkerJob) => void>>();

  create(input: { workerId: string; message: string; sessionId?: string; requestedBy?: string }): WorkerJob {
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
    this.prune();
    return job;
  }

  get(id: string): WorkerJob | undefined {
    return this.jobs.get(id);
  }

  list(options?: { workerId?: string; limit?: number }): WorkerJob[] {
    const limit = Math.max(1, options?.limit ?? 50);
    return [...this.jobs.values()]
      .filter((j) => (options?.workerId ? j.workerId === options.workerId : true))
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);
  }

  setResult(id: string, input: { responseText: string; report?: WorkerJobReport }): void {
    const job = this.jobs.get(id);
    if (!job || job.status !== "running") return;
    job.status = "succeeded";
    job.responseText = input.responseText;
    job.report = input.report;
    job.finishedAt = Date.now();
    job.durationMs = job.finishedAt - job.startedAt;
    this.notify(id, job);
    this.prune();
  }

  setError(id: string, input: { error: string; report?: WorkerJobReport }): void {
    const job = this.jobs.get(id);
    if (!job || job.status !== "running") return;
    job.status = "failed";
    job.error = input.error;
    job.report = input.report;
    job.finishedAt = Date.now();
    job.durationMs = job.finishedAt - job.startedAt;
    this.notify(id, job);
    this.prune();
  }

  attachReport(id: string, report: WorkerJobReport): void {
    const job = this.jobs.get(id);
    if (!job) return;
    job.report = { ...(job.report ?? {}), ...report };
    this.prune();
  }

  async await(id: string, options?: { timeoutMs?: number }): Promise<WorkerJob> {
    const existing = this.jobs.get(id);
    if (!existing) throw new Error(`Unknown job "${id}"`);
    if (existing.status !== "running") return existing;

    const timeoutMs = options?.timeoutMs ?? 600_000;
    return await new Promise<WorkerJob>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.offWaiter(id, onDone);
        reject(new Error(`Timed out waiting for job "${id}" after ${timeoutMs}ms`));
      }, timeoutMs);
      const onDone = (job: WorkerJob) => {
        clearTimeout(timer);
        resolve(job);
      };
      this.onWaiter(id, onDone);
    });
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
    for (const cb of set) {
      cb(job);
    }
  }

  private prune() {
    const now = Date.now();
    for (const [id, job] of this.jobs) {
      if (job.status === "running") continue;
      const ageMs = now - (job.finishedAt ?? job.startedAt);
      if (ageMs <= MAX_JOB_AGE_MS) continue;
      if (this.waiters.has(id)) continue;
      this.jobs.delete(id);
    }

    if (this.jobs.size <= MAX_JOBS) return;
    for (const [id, job] of this.jobs) {
      if (this.jobs.size <= MAX_JOBS) break;
      if (job.status === "running") continue;
      if (this.waiters.has(id)) continue;
      this.jobs.delete(id);
    }
  }
}
