/**
 * Progress Manager - Unified progress/notification API
 *
 * Replaces toast spam with a single updating progress indicator.
 * Provides clean user feedback during long operations.
 *
 * Features:
 * - Single progress indicator per operation (no toast spam)
 * - Percentage and status updates
 * - Automatic completion/failure handling
 * - Debug logging to internal buffer only
 */

import { logger } from "./logger";

// =============================================================================
// Types
// =============================================================================

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
  /** Update the progress status */
  update(status: string, percent?: number): void;
  /** Mark as complete with optional final message */
  complete(message?: string): void;
  /** Mark as failed with error */
  fail(error: string): void;
  /** Get current progress state */
  get(): Progress;
}

export type ToastVariant = "success" | "info" | "warning" | "error";
export type ToastFn = (
  message: string,
  variant: ToastVariant,
) => void | Promise<unknown>;

export interface ProgressManagerOptions {
  /** Toast function for user notifications */
  showToast?: ToastFn;
  /** Whether toasts are enabled */
  toastsEnabled?: boolean;
  /** Minimum duration (ms) before showing progress toast (avoid flash for fast ops) */
  minDurationForToast?: number;
}

// =============================================================================
// Progress Manager
// =============================================================================

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

  /**
   * Configure the toast function (called from plugin init)
   */
  configure(options: ProgressManagerOptions): void {
    if (options.showToast !== undefined) this.showToast = options.showToast;
    if (options.toastsEnabled !== undefined)
      this.toastsEnabled = options.toastsEnabled;
    if (options.minDurationForToast !== undefined)
      this.minDurationForToast = options.minDurationForToast;
  }

  /**
   * Start a new progress indicator
   */
  start(operation: string): ProgressHandle {
    const id = `progress-${++this.idCounter}-${Date.now()}`;
    const progress: Progress = {
      id,
      operation,
      status: "Starting...",
      startedAt: Date.now(),
    };
    this.active.set(id, progress);

    logger.debug(`[PROGRESS] Started: ${operation}`);

    // Initial toast (only if enabled)
    if (this.toastsEnabled) {
      void this.showToast(`${operation}: Starting...`, "info");
    }

    const handle: ProgressHandle = {
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

    return handle;
  }

  /**
   * Get all active progress indicators
   */
  getActive(): Progress[] {
    return Array.from(this.active.values());
  }

  /**
   * Check if any progress is active for an operation prefix
   */
  hasActive(operationPrefix: string): boolean {
    for (const p of this.active.values()) {
      if (p.operation.startsWith(operationPrefix)) return true;
    }
    return false;
  }

  // ===========================================================================
  // Internal
  // ===========================================================================

  private updateProgress(id: string, status: string, percent?: number): void {
    const progress = this.active.get(id);
    if (!progress) return;

    progress.status = status;
    if (percent !== undefined) progress.percent = percent;

    logger.debug(
      `[PROGRESS] ${progress.operation}: ${status}${percent !== undefined ? ` (${percent}%)` : ""}`,
    );

    // Update toast if operation has been running long enough
    const elapsed = Date.now() - progress.startedAt;
    if (this.toastsEnabled && elapsed >= this.minDurationForToast) {
      const percentStr = percent !== undefined ? ` (${percent}%)` : "";
      void this.showToast(
        `${progress.operation}: ${status}${percentStr}`,
        "info",
      );
    }
  }

  private completeProgress(id: string, message?: string): void {
    const progress = this.active.get(id);
    if (!progress) return;

    const elapsed = Date.now() - progress.startedAt;
    progress.completedAt = Date.now();
    progress.status = message ?? "Complete";
    progress.percent = 100;

    logger.info(
      `[PROGRESS] Completed: ${progress.operation} (${formatDuration(elapsed)})`,
    );

    // Show completion toast
    if (this.toastsEnabled) {
      const durationStr = formatDuration(elapsed);
      const finalMessage = message
        ? `${progress.operation}: ${message} (${durationStr})`
        : `${progress.operation}: Complete (${durationStr})`;
      void this.showToast(finalMessage, "success");
    }

    // Remove from active after a short delay (allows UI to show completion)
    setTimeout(() => this.active.delete(id), 100);
  }

  private failProgress(id: string, error: string): void {
    const progress = this.active.get(id);
    if (!progress) return;

    progress.completedAt = Date.now();
    progress.status = "Failed";
    progress.error = error;

    logger.error(`[PROGRESS] Failed: ${progress.operation} - ${error}`);

    // Show failure toast
    if (this.toastsEnabled) {
      void this.showToast(`${progress.operation}: ${error}`, "error");
    }

    // Remove from active
    setTimeout(() => this.active.delete(id), 100);
  }
}

// =============================================================================
// Helpers
// =============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
}

// =============================================================================
// Singleton Export
// =============================================================================

export const progressManager = new ProgressManager();

// =============================================================================
// Vision-specific Progress Helper
// =============================================================================

/**
 * Create a progress handle specifically for vision analysis.
 * Provides semantic update methods.
 */
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

  // Use a dedicated progress manager if custom toast is provided
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
