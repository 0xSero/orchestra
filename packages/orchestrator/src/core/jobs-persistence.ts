import { existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import type { WorkerJob, WorkerJobStatus } from "./jobs";

export interface JobsPersistenceConfig {
  enabled: boolean;
  intervalMs: number;
  filePath: string;
}

export interface PersistedJobData {
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
  report?: {
    summary?: string;
    details?: string;
    issues?: string[];
    notes?: string;
  };
  progress?: {
    message: string;
    percent?: number;
    updatedAt: number;
  };
}

export interface PersistedJobsFile {
  version: 1;
  persistedAt: number;
  jobs: PersistedJobData[];
}

export class JobsPersistence {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private readonly getJobs: () => WorkerJob[];
  private readonly config: JobsPersistenceConfig;
  private readonly onRunningJobFailed: (jobId: string, reason: string) => void;

  constructor(
    getJobs: () => WorkerJob[],
    onRunningJobFailed: (jobId: string, reason: string) => void,
    config?: Partial<JobsPersistenceConfig>,
  ) {
    this.getJobs = getJobs;
    this.onRunningJobFailed = onRunningJobFailed;
    this.config = {
      enabled: config?.enabled ?? true,
      intervalMs: config?.intervalMs ?? 30000,
      filePath:
        config?.filePath ??
        join(process.cwd(), ".opencode", "orchestra", "jobs.json"),
    };
  }

  start(): void {
    if (!this.config.enabled || this.isRunning) return;
    this.isRunning = true;
    this.intervalId = setInterval(() => {
      void this.persist();
    }, this.config.intervalMs);
  }

  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }

  getConfig(): JobsPersistenceConfig {
    return { ...this.config };
  }

  async persist(): Promise<void> {
    const jobs = this.getJobs();
    const persistableJobs = jobs.filter((j) => j.status !== "running");

    const runningJobs = jobs.filter((j) => j.status === "running");
    const allPersistable = [...persistableJobs, ...runningJobs];

    if (allPersistable.length === 0) return;

    const data: PersistedJobData[] = allPersistable.map((job) => ({
      id: job.id,
      workerId: job.workerId,
      message: job.message,
      sessionId: job.sessionId,
      requestedBy: job.requestedBy,
      status: job.status,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      durationMs: job.durationMs,
      responseText: job.responseText,
      error: job.error,
      report: job.report,
      progress: job.progress,
    }));

    await this.writeAtomically(data);
  }

  async restoreRunningJobs(): Promise<void> {
    if (!existsSync(this.config.filePath)) return;

    try {
      const raw = await readFile(this.config.filePath, "utf8");
      const file = JSON.parse(raw) as PersistedJobsFile;

      if (!file.jobs) return;

      for (const job of file.jobs) {
        if (job.status === "running") {
          this.onRunningJobFailed(job.id, "Process crashed");
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  async clear(): Promise<void> {
    try {
      await unlink(this.config.filePath).catch(() => {});
    } catch {
      // Ignore errors
    }
  }

  private async writeAtomically(data: PersistedJobData[]): Promise<void> {
    const fileContent: PersistedJobsFile = {
      version: 1,
      persistedAt: Date.now(),
      jobs: data,
    };

    await mkdir(dirname(this.config.filePath), { recursive: true }).catch(
      () => {},
    );

    const tmp = join(
      tmpdir(),
      `opencode-orch-jobs-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
    );

    try {
      await writeFile(tmp, JSON.stringify(fileContent, null, 2), "utf8");
      await rename(tmp, this.config.filePath);
    } catch {
      try {
        await writeFile(
          this.config.filePath,
          JSON.stringify(fileContent, null, 2),
          "utf8",
        );
        await unlink(tmp).catch(() => {});
      } catch {
        await unlink(tmp).catch(() => {});
      }
    }
  }
}

export function getDefaultJobsPersistenceConfig(): JobsPersistenceConfig {
  return {
    enabled: true,
    intervalMs: 30000,
    filePath: join(process.cwd(), ".opencode", "orchestra", "jobs.json"),
  };
}
