export interface Progress {
  id: string;
  operation: string;
  status: string;
  percent?: number;
  startedAt: number;
  completedAt?: number;
  error?: string;
}

export interface ProgressHandle {
  update(status: string, percent?: number): void;
  complete(message?: string): void;
  fail(error: string): void;
  get(): Progress;
}

export type ToastVariant = "success" | "info" | "warning" | "error";
export type ToastFn = (message: string, variant: ToastVariant) => void | Promise<unknown>;

export interface ProgressManagerOptions {
  showToast?: ToastFn;
  toastsEnabled?: boolean;
  minDurationForToast?: number;
}

export class ProgressManager {
  private active: Map<string, Progress> = new Map();
  private showToast: ToastFn;
  private toastsEnabled: boolean;
  private minDurationForToast: number;
  private idCounter = 0;

  constructor(options: ProgressManagerOptions = {}) {
    this.showToast = options.showToast ?? (() => {});
    this.toastsEnabled = options.toastsEnabled ?? true;
    this.minDurationForToast = options.minDurationForToast ?? 500;
  }

  configure(options: ProgressManagerOptions): void {
    if (options.showToast !== undefined) this.showToast = options.showToast;
    if (options.toastsEnabled !== undefined) this.toastsEnabled = options.toastsEnabled;
    if (options.minDurationForToast !== undefined) this.minDurationForToast = options.minDurationForToast;
  }

  start(operation: string): ProgressHandle {
    const id = `progress-${++this.idCounter}-${Date.now()}`;
    const progress: Progress = {
      id,
      operation,
      status: "Starting...",
      startedAt: Date.now(),
    };
    this.active.set(id, progress);

    if (this.toastsEnabled) {
      void this.showToast(`${operation}: Starting...`, "info");
    }

    return {
      update: (status: string, percent?: number) => {
        this.updateProgress(id, status, percent);
      },
      complete: (message?: string) => {
        this.completeProgress(id, message);
      },
      fail: (error: string) => {
        this.failProgress(id, error);
      },
      get: () => ({ ...progress }),
    };
  }

  getActive(): Progress[] {
    return Array.from(this.active.values());
  }

  hasActive(operationPrefix: string): boolean {
    for (const p of this.active.values()) {
      if (p.operation.startsWith(operationPrefix)) return true;
    }
    return false;
  }

  private updateProgress(id: string, status: string, percent?: number): void {
    const progress = this.active.get(id);
    if (!progress) return;

    progress.status = status;
    if (percent !== undefined) progress.percent = percent;

    const elapsed = Date.now() - progress.startedAt;
    if (this.toastsEnabled && elapsed >= this.minDurationForToast) {
      const percentStr = percent !== undefined ? ` (${percent}%)` : "";
      void this.showToast(`${progress.operation}: ${status}${percentStr}`, "info");
    }
  }

  private completeProgress(id: string, message?: string): void {
    const progress = this.active.get(id);
    if (!progress) return;

    const elapsed = Date.now() - progress.startedAt;
    progress.completedAt = Date.now();
    progress.status = message ?? "Complete";
    progress.percent = 100;

    if (this.toastsEnabled) {
      const durationStr = formatDuration(elapsed);
      const finalMessage = message
        ? `${progress.operation}: ${message} (${durationStr})`
        : `${progress.operation}: Complete (${durationStr})`;
      void this.showToast(finalMessage, "success");
    }

    setTimeout(() => this.active.delete(id), 100);
  }

  private failProgress(id: string, error: string): void {
    const progress = this.active.get(id);
    if (!progress) return;

    progress.completedAt = Date.now();
    progress.status = "Failed";
    progress.error = error;

    if (this.toastsEnabled) {
      void this.showToast(`${progress.operation}: ${error}`, "error");
    }

    setTimeout(() => this.active.delete(id), 100);
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
}

export const progressManager = new ProgressManager();

export function createVisionProgress(showToast?: ToastFn): {
  start: () => ProgressHandle;
  extracting: (count: number) => void;
  spawning: (model: string) => void;
  waiting: (model: string) => void;
  analyzing: (count: number, model: string) => void;
  complete: (durationMs: number, model: string) => void;
  fail: (error: string) => void;
} {
  let handle: ProgressHandle | null = null;

  const manager = showToast
    ? new ProgressManager({ showToast, toastsEnabled: true })
    : progressManager;

  return {
    start: () => {
      handle = manager.start("Vision");
      return handle;
    },
    extracting: (count: number) => {
      handle?.update(`Extracting ${count} image(s)...`, 10);
    },
    spawning: (model: string) => {
      handle?.update(`Spawning worker (${model})...`, 30);
    },
    waiting: (model: string) => {
      handle?.update(`Waiting for worker (${model})...`, 40);
    },
    analyzing: (count: number, model: string) => {
      handle?.update(`Analyzing ${count} image(s) [${model}]...`, 60);
    },
    complete: (durationMs: number, model: string) => {
      const duration = formatDuration(durationMs);
      handle?.complete(`${duration} [${model}]`);
      handle = null;
    },
    fail: (error: string) => {
      handle?.fail(error);
      handle = null;
    },
  };
}
