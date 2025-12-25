/**
 * Worker Pool - Unified worker lifecycle management
 *
 * Consolidates:
 * - registry.ts (in-memory worker tracking)
 * - profile-lock.ts (spawn deduplication)
 *
 * Key improvements:
 * - Single spawn gate (in-memory promise tracking, no filesystem locks)
 * - Warm worker cache with configurable TTL
 * - Automatic cleanup on orchestrator exit
 * - Event-based status updates
 */

import { createOpencodeClient } from "@opencode-ai/sdk";
import type { WorkerInstance, WorkerProfile, WorkerStatus } from "../types";
import { streamEmitter, type StreamChunk } from "./stream-events";

// =============================================================================
// Types
// =============================================================================

export type WorkerPoolEvent = "spawn" | "ready" | "busy" | "error" | "stop" | "update" | "dead";
export type WorkerPoolCallback = (instance: WorkerInstance) => void;

export interface SpawnOptions {
  basePort: number;
  timeout: number;
  directory: string;
  client?: any;
  /** Deprecated (device registry removed); no effect */
  reuseExisting?: boolean;
}

export interface SendOptions {
  attachments?: Array<{ type: "image"; base64?: string; mimeType?: string }>;
  timeout?: number;
  jobId?: string;
  from?: string;
}

export interface SendResult {
  success: boolean;
  response?: string;
  error?: string;
}

export type WorkerHealth = {
  ok: boolean;
  workerId: string;
  status?: WorkerStatus;
  responseTimeMs?: number;
  lastActivity?: string;
  error?: string;
};

// =============================================================================
// Worker Pool Class
// =============================================================================

export class WorkerPool {
  // In-memory worker state
  readonly workers: Map<string, WorkerInstance> = new Map();

  // Event listeners
  private listeners: Map<WorkerPoolEvent, Set<WorkerPoolCallback>> = new Map();

  // Session ownership tracking
  private sessionWorkers: Map<string, Set<string>> = new Map();

  // In-flight spawn deduplication (replaces profile-lock.ts)
  private inFlightSpawns: Map<string, Promise<WorkerInstance>> = new Map();

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Get or spawn a worker by profile ID.
   * Handles deduplication - concurrent calls return the same promise.
   */
  async getOrSpawn(
    profile: WorkerProfile,
    options: SpawnOptions,
    spawnFn: (profile: WorkerProfile, options: SpawnOptions) => Promise<WorkerInstance>
  ): Promise<WorkerInstance> {
    // Check in-memory registry first
    const existing = this.workers.get(profile.id);
    if (existing && existing.status !== "error" && existing.status !== "stopped") {
      return existing;
    }

    // Check for in-flight spawn
    const inFlight = this.inFlightSpawns.get(profile.id);
    if (inFlight) {
      return inFlight;
    }

    // Create the spawn promise BEFORE any async work to prevent race conditions
    // Wrap the entire flow (reuse check + spawn) in a single promise
    const spawnPromise = (async (): Promise<WorkerInstance> => {
      // Spawn new worker
      return spawnFn(profile, options);
    })();

    this.inFlightSpawns.set(profile.id, spawnPromise);

    try {
      const instance = await spawnPromise;
      return instance;
    } finally {
      if (this.inFlightSpawns.get(profile.id) === spawnPromise) {
        this.inFlightSpawns.delete(profile.id);
      }
    }
  }

  // ==========================================================================
  // Registration
  // ==========================================================================

  register(instance: WorkerInstance): void {
    this.workers.set(instance.profile.id, instance);
    this.emit("spawn", instance);
  }

  unregister(id: string): boolean {
    const instance = this.workers.get(id);
    if (instance) {
      this.workers.delete(id);
      for (const [sessionId, ids] of this.sessionWorkers.entries()) {
        ids.delete(id);
        if (ids.size === 0) this.sessionWorkers.delete(sessionId);
      }
      this.emit("stop", instance);
      return true;
    }
    return false;
  }

  // ==========================================================================
  // Queries
  // ==========================================================================

  get(id: string): WorkerInstance | undefined {
    return this.workers.get(id);
  }

  list(): WorkerInstance[] {
    return Array.from(this.workers.values());
  }

  getVisionWorkers(): WorkerInstance[] {
    return Array.from(this.workers.values()).filter(
      (w) => w.profile.supportsVision && (w.status === "ready" || w.status === "busy")
    );
  }

  getActiveWorkers(): WorkerInstance[] {
    return Array.from(this.workers.values()).filter(
      (w) => w.status === "ready" || w.status === "busy"
    );
  }

  getWorkersByStatus(status: WorkerStatus): WorkerInstance[] {
    return Array.from(this.workers.values()).filter((w) => w.status === status);
  }

  getWorkersByCapability(capability: string): WorkerInstance[] {
    const lowerCap = capability.toLowerCase();
    return Array.from(this.workers.values()).filter(
      (w) =>
        w.profile.purpose.toLowerCase().includes(lowerCap) ||
        w.profile.whenToUse.toLowerCase().includes(lowerCap) ||
        w.profile.id.toLowerCase().includes(lowerCap) ||
        (w.profile.tags?.some((t) => t.toLowerCase().includes(lowerCap)) ?? false)
    );
  }

  // ==========================================================================
  // Status Updates
  // ==========================================================================

  updateStatus(id: string, status: WorkerStatus, error?: string): void {
    const instance = this.workers.get(id);
    if (instance) {
      const prevStatus = instance.status;
      instance.status = status;
      instance.lastActivity = new Date();
      if (error) instance.error = error;

      // Emit appropriate event
      if (status === "ready" && prevStatus !== "ready") {
        this.emit("ready", instance);
      } else if (status === "busy") {
        this.emit("busy", instance);
      } else if (status === "error") {
        this.emit("error", instance);
      }
      this.emit("update", instance);
    }
  }

  /**
   * Wait for a worker to reach a specific status.
   */
  async waitForStatus(workerId: string, status: WorkerStatus, timeoutMs: number): Promise<boolean> {
    const existing = this.get(workerId);
    if (existing?.status === status) return true;

    return new Promise<boolean>((resolve) => {
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.off("update", onUpdate);
        resolve(ok);
      };

      const onUpdate = (instance: WorkerInstance) => {
        if (instance.profile.id !== workerId) return;
        if (instance.status === status) finish(true);
      };

      const timer = setTimeout(() => finish(false), timeoutMs);
      this.on("update", onUpdate);
    });
  }

  /**
   * Subscribe to stream chunks for a worker.
   */
  subscribeToStream(
    workerId: string,
    onChunk: (chunk: StreamChunk) => void,
    options?: { jobId?: string }
  ): () => void {
    const listener = (chunk: StreamChunk) => {
      if (chunk.workerId !== workerId) return;
      if (options?.jobId && chunk.jobId && chunk.jobId !== options.jobId) return;
      onChunk(chunk);
    };

    streamEmitter.on("chunk", listener);
    return () => streamEmitter.off("chunk", listener);
  }

  /**
   * Get recent worker session messages (raw trace data).
   */
  async getWorkerTrace(workerId: string, limit: number = 50): Promise<any[]> {
    const instance = this.get(workerId);
    if (!instance?.client || !instance.sessionId) {
      throw new Error(`Worker "${workerId}" not initialized`);
    }

    const res = await instance.client.session.messages({
      path: { id: instance.sessionId },
      query: { directory: instance.directory ?? process.cwd(), limit },
    });

    const data = (res as any)?.data;
    if (Array.isArray(data)) return data;
    if (Array.isArray(res)) return res as any[];
    return [];
  }

  /**
   * Basic health check (session list ping).
   */
  async healthCheck(workerId: string, options?: { timeoutMs?: number }): Promise<WorkerHealth> {
    const instance = this.get(workerId);
    if (!instance) {
      return { ok: false, workerId, error: `Worker "${workerId}" not found` };
    }

    const client = instance.client ?? (instance.serverUrl ? createOpencodeClient({ baseUrl: instance.serverUrl }) : undefined);
    if (!client) {
      return { ok: false, workerId, status: instance.status, error: "Worker not initialized" };
    }

    const timeoutMs = options?.timeoutMs ?? 3_000;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(new Error("health check timeout")), timeoutMs);
    const start = Date.now();

    try {
      const res = await client.session.list({
        query: { directory: instance.directory ?? process.cwd() },
        signal: abort.signal as any,
      } as any);
      const sdkError: any = (res as any)?.error;
      if (sdkError) {
        const msg =
          sdkError?.data?.message ??
          sdkError?.message ??
          (typeof sdkError === "string" ? sdkError : JSON.stringify(sdkError));
        return { ok: false, workerId, status: instance.status, error: msg };
      }
      return {
        ok: true,
        workerId,
        status: instance.status,
        responseTimeMs: Date.now() - start,
        lastActivity: instance.lastActivity?.toISOString(),
      };
    } catch (err) {
      return {
        ok: false,
        workerId,
        status: instance.status,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // ==========================================================================
  // Session Ownership
  // ==========================================================================

  trackOwnership(sessionId: string | undefined, workerId: string): void {
    if (!sessionId) return;
    const next = this.sessionWorkers.get(sessionId) ?? new Set<string>();
    next.add(workerId);
    this.sessionWorkers.set(sessionId, next);
  }

  getWorkersForSession(sessionId: string): string[] {
    return [...(this.sessionWorkers.get(sessionId) ?? new Set<string>())];
  }

  clearSessionOwnership(sessionId: string): void {
    this.sessionWorkers.delete(sessionId);
  }

  // ==========================================================================
  // Events
  // ==========================================================================

  on(event: WorkerPoolEvent, callback: WorkerPoolCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.off(event, callback);
  }

  off(event: WorkerPoolEvent, callback: WorkerPoolCallback): void {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: WorkerPoolEvent, instance: WorkerInstance): void {
    this.listeners.get(event)?.forEach((cb) => {
      try {
        cb(instance);
      } catch {
        // Ignore listener errors
      }
    });
  }

  // ==========================================================================
  // Summary / Serialization
  // ==========================================================================

  getSummary(options: { maxWorkers?: number } = {}): string {
    const maxWorkers = options.maxWorkers ?? 12;
    const workers = Array.from(this.workers.values())
      .sort((a, b) => a.profile.id.localeCompare(b.profile.id))
      .slice(0, Math.max(0, maxWorkers));

    if (workers.length === 0) {
      return "No workers currently registered.";
    }

    const total = this.workers.size;
    const lines = ["## Available Workers", ""];
    if (total > workers.length) {
      lines.push(`(showing ${workers.length} of ${total})`, "");
    }
    for (const w of workers) {
      const status = w.status === "ready" ? "available" : w.status;
      lines.push(`### ${w.profile.name} (${w.profile.id})`);
      lines.push(`- **Status**: ${status}`);
      lines.push(`- **Model**: ${w.profile.model}`);
      lines.push(`- **Purpose**: ${w.profile.purpose}`);
      lines.push(`- **When to use**: ${w.profile.whenToUse}`);
      if (w.profile.supportsVision) lines.push(`- **Supports Vision**: Yes`);
      if (w.profile.supportsWeb) lines.push(`- **Supports Web**: Yes`);
      lines.push(`- **Port**: ${w.port}`);
      lines.push("");
    }

    lines.push("## How to Use Workers");
    lines.push("Use the `ask_worker` tool to send messages to any worker by their ID.");
    lines.push("Example: ask_worker({ workerId: 'vision', message: 'Describe this image', attachments: [...] })");
    lines.push("");

    return lines.join("\n");
  }

  toJSON(): Record<string, unknown>[] {
    return Array.from(this.workers.values()).map((w) => ({
      id: w.profile.id,
      name: w.profile.name,
      model: w.profile.model,
      modelResolution: w.modelResolution,
      purpose: w.profile.purpose,
      whenToUse: w.profile.whenToUse,
      profile: {
        id: w.profile.id,
        name: w.profile.name,
        model: w.profile.model,
        purpose: w.profile.purpose,
        whenToUse: w.profile.whenToUse,
        supportsVision: w.profile.supportsVision ?? false,
        supportsWeb: w.profile.supportsWeb ?? false,
      },
      status: w.status,
      port: w.port,
      pid: w.pid,
      serverUrl: w.serverUrl,
      supportsVision: w.profile.supportsVision ?? false,
      supportsWeb: w.profile.supportsWeb ?? false,
      lastActivity: w.lastActivity?.toISOString(),
      currentTask: w.currentTask,
      error: w.error,
      warning: w.warning,
      lastResult: w.lastResult
        ? {
            at: w.lastResult.at.toISOString(),
            jobId: w.lastResult.jobId,
            durationMs: w.lastResult.durationMs,
            response: w.lastResult.response,
            report: w.lastResult.report,
          }
        : undefined,
    }));
  }

  // ==========================================================================
  // Cleanup
  // ==========================================================================

  async stopAll(): Promise<void> {
    const workers = Array.from(this.workers.values());
    await Promise.allSettled(
      workers.map(async (w) => {
        try {
          await w.shutdown?.();
        } catch {
          // Ignore shutdown errors
        }
      })
    );
    this.workers.clear();
    this.sessionWorkers.clear();
    this.inFlightSpawns.clear();
  }

  async stop(workerId: string): Promise<boolean> {
    const instance = this.workers.get(workerId);
    if (!instance) return false;

    try {
      await instance.shutdown?.();
      instance.status = "stopped";
      this.unregister(workerId);
      return true;
    } catch {
      return false;
    }
  }

  async markDead(workerId: string, reason?: string): Promise<void> {
    const instance = this.workers.get(workerId);
    if (!instance) return;
    if (reason) instance.error = reason;
    this.updateStatus(workerId, "error", reason);
    this.emit("dead", instance);
    this.unregister(workerId);
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const workerPool = new WorkerPool();

// Backwards compatibility exports (for gradual migration)
export const registry = {
  workers: workerPool.workers,
  register: (instance: WorkerInstance) => workerPool.register(instance),
  unregister: (id: string) => workerPool.unregister(id),
  getWorker: (id: string) => workerPool.get(id),
  getWorkersByCapability: (cap: string) => workerPool.getWorkersByCapability(cap),
  getWorkersByStatus: (status: WorkerStatus) => workerPool.getWorkersByStatus(status),
  getActiveWorkers: () => workerPool.getActiveWorkers(),
  getVisionWorkers: () => workerPool.getVisionWorkers(),
  updateStatus: (id: string, status: WorkerStatus, error?: string) =>
    workerPool.updateStatus(id, status, error),
  getSummary: (opts?: { maxWorkers?: number }) => workerPool.getSummary(opts),
  toJSON: () => workerPool.toJSON(),
  on: (event: string, cb: (instance: WorkerInstance) => void) =>
    workerPool.on(event as WorkerPoolEvent, cb),
  off: (event: string, cb: (instance: WorkerInstance) => void) =>
    workerPool.off(event as WorkerPoolEvent, cb),
  trackOwnership: (sessionId: string | undefined, workerId: string) =>
    workerPool.trackOwnership(sessionId, workerId),
  getWorkersForSession: (sessionId: string) => workerPool.getWorkersForSession(sessionId),
  clearSessionOwnership: (sessionId: string) => workerPool.clearSessionOwnership(sessionId),
  waitForStatus: (workerId: string, status: WorkerStatus, timeoutMs: number) =>
    workerPool.waitForStatus(workerId, status, timeoutMs),
  subscribeToStream: (
    workerId: string,
    onChunk: (chunk: StreamChunk) => void,
    options?: { jobId?: string }
  ) => workerPool.subscribeToStream(workerId, onChunk, options),
  getWorkerTrace: (workerId: string, limit?: number) => workerPool.getWorkerTrace(workerId, limit),
  healthCheck: (workerId: string, options?: { timeoutMs?: number }) => workerPool.healthCheck(workerId, options),
};
