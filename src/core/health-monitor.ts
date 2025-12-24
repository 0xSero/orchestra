import { createOpencodeClient } from "@opencode-ai/sdk";
import type { WorkerInstance } from "../types";
import type { WorkerPool } from "./worker-pool";
import { logger } from "./logger";

export type HealthCheckConfig = {
  enabled: boolean;
  intervalMs: number;
  timeoutMs: number;
  maxRetries: number;
};

const DEFAULT_CONFIG: HealthCheckConfig = {
  enabled: true,
  intervalMs: 30_000,
  timeoutMs: 3_000,
  maxRetries: 3,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkWorkerSession(
  instance: WorkerInstance,
  timeoutMs: number
): Promise<boolean> {
  if (!instance.serverUrl) return false;

  const client = instance.client ?? createOpencodeClient({ baseUrl: instance.serverUrl });
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(new Error("health check timeout")), timeoutMs);

  try {
    const result = await client.session.list({ query: { directory: instance.directory }, signal: abort.signal } as any);
    const sdkError: any = (result as any)?.error;
    if (sdkError) return false;
    return Boolean((result as any)?.data ?? result);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export class HealthMonitor {
  private timer: NodeJS.Timeout | undefined;
  private inFlight = false;
  private config: HealthCheckConfig;

  constructor(private readonly pool: WorkerPool, config?: Partial<HealthCheckConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...(config ?? {}) };
  }

  update(config?: Partial<HealthCheckConfig>): void {
    if (config) this.config = { ...this.config, ...config };
    if (!this.config.enabled) {
      this.stop();
      return;
    }
    this.start();
  }

  start(): void {
    if (!this.config.enabled) return;
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), Math.max(10_000, this.config.intervalMs));
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.inFlight = false;
  }

  private async tick(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      const workers = this.pool.getActiveWorkers();
      await Promise.allSettled(workers.map((instance) => this.checkInstance(instance)));
    } finally {
      this.inFlight = false;
    }
  }

  private async checkInstance(instance: WorkerInstance): Promise<void> {
    if (instance.status === "starting" || instance.status === "stopped" || instance.status === "error") return;

    const { timeoutMs, maxRetries } = this.config;
    for (let attempt = 0; attempt < Math.max(1, maxRetries); attempt += 1) {
      const ok = await checkWorkerSession(instance, timeoutMs);
      if (ok) return;
      if (attempt < maxRetries - 1) {
        await sleep(250 * Math.pow(2, attempt));
      }
    }

    logger.warn(`Health check failed for worker ${instance.profile.id}; marking dead.`);
    await this.pool.markDead(instance.profile.id, "Health check failed");
  }
}

export const defaultHealthCheckConfig = DEFAULT_CONFIG;
