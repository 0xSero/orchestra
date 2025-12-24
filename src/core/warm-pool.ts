import type { WorkerInstance, WorkerProfile } from "../types";
import type { SpawnOptions } from "./worker-pool";
import { logger } from "./logger";
import { workerPool } from "./worker-pool";

export type WarmPoolProfileConfig = {
  size?: number;
  idleTimeoutMs?: number;
};

export type WarmPoolConfig = {
  enabled?: boolean;
  profiles?: Record<string, WarmPoolProfileConfig>;
};

export type WarmPoolSpawnOptions = SpawnOptions & {
  client?: any;
  modelSelection?: import("../types").OrchestratorConfig["modelSelection"];
  modelAliases?: import("../types").OrchestratorConfig["modelAliases"];
};

export class WarmPool {
  private config: WarmPoolConfig = { enabled: false, profiles: {} };
  private spawnOptions: WarmPoolSpawnOptions | undefined;
  private spawnFn:
    | ((profile: WorkerProfile, options: WarmPoolSpawnOptions) => Promise<WorkerInstance>)
    | undefined;
  private timer: NodeJS.Timeout | undefined;
  private evictedUntil = new Map<string, number>();
  private profiles: Record<string, WorkerProfile> = {};

  configure(input: {
    config: WarmPoolConfig | undefined;
    profiles: Record<string, WorkerProfile>;
    spawnOptions: WarmPoolSpawnOptions;
    spawnFn: (profile: WorkerProfile, options: WarmPoolSpawnOptions) => Promise<WorkerInstance>;
  }): void {
    this.config = input.config ?? { enabled: false, profiles: {} };
    this.spawnOptions = input.spawnOptions;
    this.spawnFn = input.spawnFn;
    this.profiles = input.profiles;

    if (this.config.enabled) {
      this.start();
    } else {
      this.stop();
    }
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(this.profiles), 30_000);
    void this.prewarm(this.profiles);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.profiles = {};
  }

  async tickOnce(): Promise<void> {
    await this.tick(this.profiles);
  }

  private async prewarm(profiles: Record<string, WorkerProfile>): Promise<void> {
    await this.tick(profiles);
  }

  private async tick(profiles: Record<string, WorkerProfile>): Promise<void> {
    if (!this.config.enabled) return;
    const configProfiles = this.config.profiles ?? {};

    for (const [id, cfg] of Object.entries(configProfiles)) {
      const desired = Math.max(0, Math.floor(cfg.size ?? 0));
      if (desired <= 0) continue;
      if (desired > 1) {
        logger.warn(`Warm pool size > 1 is not yet supported; using 1 for profile ${id}.`);
      }

      const profile = profiles[id];
      if (!profile) continue;

      const instance = workerPool.get(id);
      const idleTimeoutMs = Math.max(0, Math.floor(cfg.idleTimeoutMs ?? 0));

      if (instance) {
        if (
          idleTimeoutMs > 0 &&
          instance.status === "ready" &&
          instance.lastActivity &&
          Date.now() - instance.lastActivity.getTime() > idleTimeoutMs
        ) {
          this.evictedUntil.set(id, Date.now() + idleTimeoutMs);
          await workerPool.stop(id);
        }
        continue;
      }

      const cooldownUntil = this.evictedUntil.get(id);
      if (cooldownUntil && cooldownUntil > Date.now()) continue;

      if (this.spawnFn && this.spawnOptions) {
        try {
          await this.spawnFn(profile, this.spawnOptions);
        } catch (error) {
          logger.warn(`Warm pool failed to spawn ${id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }
}

export const warmPool = new WarmPool();
