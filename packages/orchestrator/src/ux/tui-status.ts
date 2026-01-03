/**
 * TUI Status Monitor - Real-time status tracking for the orchestrator
 *
 * Provides live visibility into:
 * - Active workers and their states
 * - Running tasks and their progress
 * - Session counts and activity
 * - Subagent spawns and completions
 */

import type { WorkerInstance } from "../types";
import { workerPool } from "../core/worker-pool";
import { workerJobs, type WorkerJob } from "../core/jobs";
import { onOrchestratorEvent } from "../core/orchestrator-events";

export type StatusUpdateCallback = (status: OrchestratorStatus) => void;
export type ToastFn = (
  message: string,
  variant: "success" | "info" | "warning" | "error",
) => Promise<void>;

export interface WorkerStatus {
  id: string;
  name: string;
  status: "starting" | "ready" | "busy" | "error" | "stopped";
  model: string;
  currentTask?: string;
  sessionId?: string;
  lastActivity?: Date;
  port?: number;
}

export interface TaskStatus {
  id: string;
  workerId: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  message: string;
  startedAt: number;
  durationMs?: number;
  elapsedMs?: number;
  progress?: {
    message: string;
    percent?: number;
    updatedAt: number;
  };
}

export interface OrchestratorStatus {
  timestamp: number;
  workers: WorkerStatus[];
  tasks: TaskStatus[];
  summary: {
    totalWorkers: number;
    readyWorkers: number;
    busyWorkers: number;
    errorWorkers: number;
    activeTasks: number;
    completedTasks: number;
    failedTasks: number;
    oldestTaskMs?: number;
  };
}

const statusListeners: Set<StatusUpdateCallback> = new Set();
const lastWorkerStates: Map<string, string> = new Map();
let toastFn: ToastFn | null = null;
let verboseToasts = false;
let longTaskAlertMs = 300_000; // 5 minutes

export function setStatusToastFn(fn: ToastFn): void {
  toastFn = fn;
}

export function setVerboseToasts(enabled: boolean): void {
  verboseToasts = enabled;
}

export function setLongTaskAlertMs(ms: number): void {
  longTaskAlertMs = ms;
}

export function onStatusUpdate(callback: StatusUpdateCallback): () => void {
  statusListeners.add(callback);
  return () => statusListeners.delete(callback);
}

function notifyStatusUpdate(): void {
  const status = getOrchestratorStatus();
  for (const listener of statusListeners) {
    try {
      listener(status);
    } catch {
      // ignore listener errors
    }
  }
}

export function getOrchestratorStatus(): OrchestratorStatus {
  const now = Date.now();

  const workers = workerPool.list().map(
    (w): WorkerStatus => ({
      id: w.profile.id,
      name: w.profile.name,
      status: w.status,
      model: w.profile.model,
      currentTask: w.currentTask,
      sessionId: w.sessionId,
      lastActivity: w.lastActivity,
      port: w.port,
    }),
  );

  const allJobs = workerJobs.list({ limit: 100 });
  const tasks = allJobs.map(
    (j): TaskStatus => ({
      id: j.id,
      workerId: j.workerId,
      status: j.status as TaskStatus["status"],
      message: j.message ?? "",
      startedAt: j.startedAt,
      durationMs: j.durationMs,
      elapsedMs: j.status === "running" ? now - j.startedAt : undefined,
      progress: j.progress,
    }),
  );

  const runningTasks = tasks.filter((t) => t.status === "running");
  const completedTasks = tasks.filter((t) => t.status === "succeeded").length;
  const failedTasks = tasks.filter((t) => t.status === "failed").length;
  const oldestTaskMs =
    runningTasks.length > 0
      ? Math.max(...runningTasks.map((t) => t.elapsedMs ?? 0))
      : undefined;

  return {
    timestamp: now,
    workers,
    tasks,
    summary: {
      totalWorkers: workers.length,
      readyWorkers: workers.filter((w) => w.status === "ready").length,
      busyWorkers: workers.filter((w) => w.status === "busy").length,
      errorWorkers: workers.filter((w) => w.status === "error").length,
      activeTasks: runningTasks.length,
      completedTasks,
      failedTasks,
      oldestTaskMs,
    },
  };
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600_000)
    return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
  return `${Math.floor(ms / 3600_000)}h ${Math.floor((ms % 3600_000) / 60_000)}m`;
}

export function getStatusSummaryMarkdown(): string {
  const status = getOrchestratorStatus();
  const { summary, workers, tasks } = status;

  const lines: string[] = [
    "# 🎛️ Orchestrator Status",
    "",
    "## Summary",
    `- **Workers**: ${summary.totalWorkers} total (${summary.readyWorkers} ready, ${summary.busyWorkers} busy, ${summary.errorWorkers} error)`,
    `- **Tasks**: ${summary.activeTasks} active, ${summary.completedTasks} completed, ${summary.failedTasks} failed`,
  ];

  if (summary.oldestTaskMs) {
    const isLong = summary.oldestTaskMs > longTaskAlertMs;
    lines.push(
      `- **Longest Running**: ${formatElapsed(summary.oldestTaskMs)}${isLong ? " ⚠️ LONG" : ""}`,
    );
  }
  lines.push("");

  if (workers.length > 0) {
    lines.push("## Workers");
    lines.push("| Worker | Status | Model | Current Task |");
    lines.push("|--------|--------|-------|--------------|");
    for (const w of workers) {
      const taskPreview = w.currentTask
        ? w.currentTask.slice(0, 40) + (w.currentTask.length > 40 ? "..." : "")
        : "—";
      const statusEmoji =
        w.status === "ready"
          ? "🟢"
          : w.status === "busy"
            ? "🟡"
            : w.status === "error"
              ? "🔴"
              : "⚪";
      lines.push(
        `| ${statusEmoji} ${w.name} | ${w.status} | ${w.model.split("/").pop()} | ${taskPreview} |`,
      );
    }
    lines.push("");
  }

  const runningTasks = tasks.filter((t) => t.status === "running");
  if (runningTasks.length > 0) {
    lines.push("## Running Tasks");
    lines.push("| Task ID | Worker | Elapsed | Progress | Message |");
    lines.push("|---------|--------|---------|----------|---------|");
    for (const t of runningTasks.slice(0, 15)) {
      const elapsed = t.elapsedMs ? formatElapsed(t.elapsedMs) : "—";
      const isLong = (t.elapsedMs ?? 0) > longTaskAlertMs;
      const elapsedDisplay = isLong ? `⚠️ ${elapsed}` : elapsed;
      const progress = t.progress ? t.progress.message.slice(0, 20) : "—";
      const msgPreview =
        t.message.slice(0, 30) + (t.message.length > 30 ? "..." : "");
      lines.push(
        `| ${t.id.slice(0, 8)} | ${t.workerId} | ${elapsedDisplay} | ${progress} | ${msgPreview} |`,
      );
    }
    if (runningTasks.length > 15) {
      lines.push(`| ... | +${runningTasks.length - 15} more | | | |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function startStatusMonitor(): () => void {
  const unsubscribeWorkerUpdate = workerPool.on(
    "update",
    (instance: WorkerInstance) => {
      const id = instance.profile.id;
      const newStatus = instance.status;
      const prevStatus = lastWorkerStates.get(id);

      if (prevStatus !== newStatus) {
        lastWorkerStates.set(id, newStatus);

        if (toastFn && verboseToasts) {
          const emoji =
            newStatus === "ready"
              ? "🟢"
              : newStatus === "busy"
                ? "🟡"
                : newStatus === "error"
                  ? "🔴"
                  : "⚪";
          void toastFn(
            `${emoji} ${instance.profile.name}: ${newStatus}`,
            newStatus === "error" ? "error" : "info",
          );
        }

        notifyStatusUpdate();
      }
    },
  );

  const unsubscribeWorkerSpawn = workerPool.on(
    "spawn",
    (instance: WorkerInstance) => {
      lastWorkerStates.set(instance.profile.id, instance.status);

      if (toastFn && verboseToasts) {
        void toastFn(`🚀 Worker spawned: ${instance.profile.name}`, "success");
      }

      notifyStatusUpdate();
    },
  );

  const unsubscribeWorkerStop = workerPool.on(
    "stop",
    (instance: WorkerInstance) => {
      lastWorkerStates.delete(instance.profile.id);

      if (toastFn && verboseToasts) {
        void toastFn(`⏹️ Worker stopped: ${instance.profile.name}`, "info");
      }

      notifyStatusUpdate();
    },
  );

  const unsubscribeEvents = onOrchestratorEvent((event) => {
    if (
      event.type === "orchestra.workflow.started" ||
      event.type === "orchestra.workflow.completed" ||
      event.type === "orchestra.workflow.step"
    ) {
      notifyStatusUpdate();
    }
  });

  // Subscribe to job events for real-time task visibility
  const unsubscribeJobEvents = workerJobs.onJobEvent(
    (job: WorkerJob, event) => {
      if (event === "created") {
        if (toastFn && verboseToasts) {
          void toastFn(`📋 Task started: ${job.workerId}`, "info");
        }
      } else if (event === "completed") {
        if (toastFn && verboseToasts) {
          void toastFn(
            `✅ Task completed: ${job.workerId} (${formatElapsed(job.durationMs ?? 0)})`,
            "success",
          );
        }
      } else if (event === "failed") {
        if (toastFn) {
          void toastFn(
            `❌ Task failed: ${job.workerId} - ${job.error?.slice(0, 50)}`,
            "error",
          );
        }
      } else if (event === "progress") {
        // Progress updates - could show periodically
      }

      notifyStatusUpdate();
    },
  );

  // Periodic long-task alert
  let longTaskInterval: ReturnType<typeof setInterval> | undefined;
  if (toastFn) {
    longTaskInterval = setInterval(() => {
      const summary = workerJobs.getJobSummary();
      if (
        summary.oldestRunningMs &&
        summary.oldestRunningMs > longTaskAlertMs
      ) {
        const runningJobs = workerJobs.getRunningJobs();
        const longJobs = runningJobs.filter(
          (j) => Date.now() - j.startedAt > longTaskAlertMs,
        );
        if (longJobs.length > 0 && toastFn) {
          void toastFn(
            `⏱️ ${longJobs.length} long-running task(s): oldest ${formatElapsed(summary.oldestRunningMs)}`,
            "warning",
          );
        }
      }
    }, 60_000); // Check every minute
  }

  return () => {
    unsubscribeWorkerUpdate();
    unsubscribeWorkerSpawn();
    unsubscribeWorkerStop();
    unsubscribeEvents();
    unsubscribeJobEvents();
    if (longTaskInterval) clearInterval(longTaskInterval);
    statusListeners.clear();
    lastWorkerStates.clear();
  };
}

export function getCompactStatusLine(): string {
  const status = getOrchestratorStatus();
  const { summary } = status;

  const parts: string[] = [];

  if (summary.busyWorkers > 0) {
    parts.push(`🟡 ${summary.busyWorkers} busy`);
  }
  if (summary.readyWorkers > 0) {
    parts.push(`🟢 ${summary.readyWorkers} ready`);
  }
  if (summary.errorWorkers > 0) {
    parts.push(`🔴 ${summary.errorWorkers} error`);
  }
  if (summary.activeTasks > 0) {
    parts.push(`⏳ ${summary.activeTasks} tasks`);
  }
  if (summary.oldestTaskMs && summary.oldestTaskMs > longTaskAlertMs) {
    parts.push(`⚠️ longest: ${formatElapsed(summary.oldestTaskMs)}`);
  }

  return parts.length > 0 ? parts.join(" | ") : "No active workers";
}

export function getLiveStatus(): {
  line: string;
  markdown: string;
  status: OrchestratorStatus;
} {
  const status = getOrchestratorStatus();
  return {
    line: getCompactStatusLine(),
    markdown: getStatusSummaryMarkdown(),
    status,
  };
}
