export interface CleanupSchedulerConfig {
  intervalMs: number;
}

export class CleanupScheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private readonly cleanupFn: () => Promise<void>;
  private readonly config: CleanupSchedulerConfig;

  constructor(
    cleanupFn: () => Promise<void>,
    config?: Partial<CleanupSchedulerConfig>,
  ) {
    this.cleanupFn = cleanupFn;
    this.config = {
      intervalMs: config?.intervalMs ?? 300000,
    };
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.intervalId = setInterval(() => {
      void this.cleanupFn().catch(() => {});
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

  getConfig(): CleanupSchedulerConfig {
    return { ...this.config };
  }

  async forceCleanup(): Promise<void> {
    await this.cleanupFn();
  }
}

export function getDefaultCleanupConfig(): CleanupSchedulerConfig {
  return {
    intervalMs: 300000,
  };
}
