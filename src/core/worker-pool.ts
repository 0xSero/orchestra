/**
 * Worker Pool - Unified worker lifecycle management
 *
 * Consolidates:
 * - registry.ts (in-memory worker tracking)
 * - device-registry.ts (cross-session persistence)
 * - profile-lock.ts (spawn deduplication)
 *
 * Key improvements:
 * - Single spawn gate (in-memory promise tracking, no filesystem locks)
 * - Warm worker cache with configurable TTL
 * - Automatic cleanup on orchestrator exit
 * - Event-based status updates
 */

import type { WorkerInstance, WorkerProfile, WorkerStatus } from "../types";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeJsonAtomic } from "../helpers/fs";
import { getUserConfigDir } from "../helpers/format";
import { isProcessAlive } from "../helpers/process";

// =============================================================================
// Types
// =============================================================================

export type WorkerPoolEvent = "spawn" | "ready" | "busy" | "error" | "stop" | "update";
export type WorkerPoolCallback = (instance: WorkerInstance) => void;

export interface SpawnOptions {
  basePort: number;
  timeout: number;
  directory: string;
  client?: any;
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

// Device registry types (for cross-session persistence)
export type DeviceRegistryWorkerEntry = {
  kind: "worker";
  orchestratorInstanceId: string;
  hostPid?: number;
  workerId: string;
  pid: number;
  url?: string;
  port?: number;
  sessionId?: string;
  status: "starting" | "ready" | "busy" | "error" | "stopped";
  startedAt: number;
  updatedAt: number;
  lastError?: string;
};

export type DeviceRegistrySessionEntry = {
  kind: "session";
  hostPid: number;
  sessionId: string;
  directory: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export type DeviceRegistryEntry = DeviceRegistryWorkerEntry | DeviceRegistrySessionEntry;

type DeviceRegistryFile = {
  version: 1;
  updatedAt: number;
  entries: DeviceRegistryEntry[];
};

// =============================================================================
// Device Registry (file-based persistence for cross-session reuse)
// =============================================================================

export function getDeviceRegistryPath(): string {
  return join(getUserConfigDir(), "opencode", "orchestrator-device-registry.json");
}

async function readRegistryFile(path: string): Promise<DeviceRegistryFile> {
  if (!existsSync(path)) {
    return { version: 1, updatedAt: Date.now(), entries: [] };
  }
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as Partial<DeviceRegistryFile>;
    const entries = Array.isArray(raw.entries) ? (raw.entries as DeviceRegistryEntry[]) : [];
    return {
      version: 1,
      updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
      entries,
    };
  } catch {
    return { version: 1, updatedAt: Date.now(), entries: [] };
  }
}

async function writeRegistryFile(path: string, file: DeviceRegistryFile): Promise<void> {
  await writeJsonAtomic(path, file, { tmpPrefix: "opencode-orch-registry" });
}

export async function pruneDeadEntries(path = getDeviceRegistryPath()): Promise<void> {
  const file = await readRegistryFile(path);
  const alive = file.entries.filter((e) => {
    if (e.kind === "worker") return isProcessAlive(e.pid);
    if (e.kind === "session") return isProcessAlive(e.hostPid);
    return true;
  });
  if (alive.length === file.entries.length) return;
  await writeRegistryFile(path, { version: 1, updatedAt: Date.now(), entries: alive });
}

export async function upsertWorkerEntry(
  entry: Omit<DeviceRegistryWorkerEntry, "kind" | "updatedAt">,
  path = getDeviceRegistryPath()
): Promise<void> {
  const file = await readRegistryFile(path);
  const now = Date.now();
  const next: DeviceRegistryWorkerEntry = { kind: "worker", updatedAt: now, ...entry };
  const idx = file.entries.findIndex(
    (e) =>
      e.kind === "worker" &&
      e.orchestratorInstanceId === entry.orchestratorInstanceId &&
      e.workerId === entry.workerId &&
      e.pid === entry.pid
  );
  const entries = [...file.entries];
  if (idx >= 0) entries[idx] = next;
  else entries.push(next);
  await writeRegistryFile(path, { version: 1, updatedAt: now, entries });
}

export async function removeWorkerEntriesByPid(pid: number, path = getDeviceRegistryPath()): Promise<void> {
  const file = await readRegistryFile(path);
  const entries = file.entries.filter((e) => !(e.kind === "worker" && e.pid === pid));
  if (entries.length === file.entries.length) return;
  await writeRegistryFile(path, { version: 1, updatedAt: Date.now(), entries });
}

export async function upsertSessionEntry(
  entry: Omit<DeviceRegistrySessionEntry, "kind" | "updatedAt">,
  path = getDeviceRegistryPath()
): Promise<void> {
  const file = await readRegistryFile(path);
  const now = Date.now();
  const next: DeviceRegistrySessionEntry = { kind: "session", updatedAt: now, ...entry };
  const idx = file.entries.findIndex(
    (e) => e.kind === "session" && e.hostPid === entry.hostPid && e.sessionId === entry.sessionId
  );
  const entries = [...file.entries];
  if (idx >= 0) entries[idx] = next;
  else entries.push(next);
  await writeRegistryFile(path, { version: 1, updatedAt: now, entries });
}

export async function removeSessionEntry(sessionId: string, hostPid: number, path = getDeviceRegistryPath()): Promise<void> {
  const file = await readRegistryFile(path);
  const entries = file.entries.filter(
    (e) => !(e.kind === "session" && e.hostPid === hostPid && e.sessionId === sessionId)
  );
  if (entries.length === file.entries.length) return;
  await writeRegistryFile(path, { version: 1, updatedAt: Date.now(), entries });
}

export async function listDeviceRegistry(path = getDeviceRegistryPath()): Promise<DeviceRegistryEntry[]> {
  await pruneDeadEntries(path).catch(() => {});
  const file = await readRegistryFile(path);
  return file.entries;
}

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

  // Orchestrator instance ID (for device registry)
  private instanceId: string = "";

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  setInstanceId(id: string): void {
    this.instanceId = id;
  }

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
      // Try to reuse from device registry
      const reused = await this.tryReuseFromDeviceRegistry(profile, options);
      if (reused) {
        return reused;
      }

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

  /**
   * Try to reuse an existing worker from device registry.
   */
  private async tryReuseFromDeviceRegistry(
    profile: WorkerProfile,
    options: SpawnOptions
  ): Promise<WorkerInstance | undefined> {
    try {
      const path = getDeviceRegistryPath();
      await pruneDeadEntries(path);
      const file = await readRegistryFile(path);

      const candidates = file.entries.filter(
        (e): e is DeviceRegistryWorkerEntry =>
          e.kind === "worker" &&
          e.workerId === profile.id &&
          (e.status === "ready" || e.status === "busy") &&
          isProcessAlive(e.pid)
      );

      if (candidates.length === 0) return undefined;

      // Prefer most recently updated
      candidates.sort((a, b) => b.updatedAt - a.updatedAt);
      const existing = candidates[0];
      if (!existing.url) return undefined;

      // Attempt to connect
      const { createOpencodeClient } = await import("@opencode-ai/sdk");
      const client = createOpencodeClient({ baseUrl: existing.url });

      // Health check
      const sessionsResult = await Promise.race([
        client.session.list({ query: { directory: options.directory } } as any),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Health check timeout")), 3000)
        ),
      ]);

      if (!sessionsResult.data) return undefined;

      // Find or create session
      const sessions = sessionsResult.data as Array<{ id: string }>;
      let sessionId = existing.sessionId;

      if (!sessionId || !sessions.some((s) => s.id === sessionId)) {
        const workerSessionTitle = `Worker: ${profile.name}`;
        const fullSessions = await Promise.all(
          sessions.slice(0, 50).map(async (s) => {
            try {
              const detail = await client.session.get({ path: { id: s.id }, query: { directory: options.directory } });
              return detail.data as { id: string; title?: string } | undefined;
            } catch {
              return undefined;
            }
          })
        ).then((results) => results.filter((s): s is { id: string; title?: string } => !!s));

        const workerSession = fullSessions.find((s) => s.title === workerSessionTitle);
        if (workerSession) {
          sessionId = workerSession.id;
        } else {
          const newSession = await client.session.create({
            body: { title: workerSessionTitle },
            query: { directory: options.directory },
          });
          if (!newSession.data) return undefined;
          sessionId = newSession.data.id;
        }
      }

      const instance: WorkerInstance = {
        profile,
        status: existing.status === "busy" ? "busy" : "ready",
        port: existing.port ?? 0,
        serverUrl: existing.url,
        directory: options.directory,
        startedAt: new Date(existing.startedAt),
        lastActivity: new Date(),
        client,
        pid: existing.pid,
        sessionId,
        modelResolution: "reused existing worker",
      };

      this.register(instance);

      // Update device registry
      await this.updateDeviceRegistry(instance);

      return instance;
    } catch {
      return undefined;
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

      // Update device registry async
      void this.updateDeviceRegistry(instance);
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
  // Device Registry Sync
  // ==========================================================================

  async updateDeviceRegistry(instance: WorkerInstance): Promise<void> {
    if (typeof instance.pid !== "number") return;

    try {
      const path = getDeviceRegistryPath();
      const file = await readRegistryFile(path);
      const now = Date.now();

      const entry: DeviceRegistryWorkerEntry = {
        kind: "worker",
        orchestratorInstanceId: this.instanceId,
        hostPid: process.pid,
        workerId: instance.profile.id,
        pid: instance.pid,
        url: instance.serverUrl,
        port: instance.port,
        sessionId: instance.sessionId,
        status: instance.status,
        startedAt: instance.startedAt.getTime(),
        updatedAt: now,
        lastError: instance.error,
      };

      const idx = file.entries.findIndex(
        (e) =>
          e.kind === "worker" &&
          e.orchestratorInstanceId === this.instanceId &&
          e.workerId === instance.profile.id &&
          e.pid === instance.pid
      );

      const entries = [...file.entries];
      if (idx >= 0) entries[idx] = entry;
      else entries.push(entry);

      await writeRegistryFile(path, { version: 1, updatedAt: now, entries });
    } catch {
      // Silent fail - device registry is best-effort
    }
  }

  async removeFromDeviceRegistry(pid: number): Promise<void> {
    try {
      const path = getDeviceRegistryPath();
      const file = await readRegistryFile(path);
      const entries = file.entries.filter((e) => !(e.kind === "worker" && e.pid === pid));
      if (entries.length === file.entries.length) return;
      await writeRegistryFile(path, { version: 1, updatedAt: Date.now(), entries });
    } catch {
      // Silent fail
    }
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
      status: w.status,
      port: w.port,
      pid: w.pid,
      serverUrl: w.serverUrl,
      supportsVision: w.profile.supportsVision ?? false,
      supportsWeb: w.profile.supportsWeb ?? false,
      lastActivity: w.lastActivity?.toISOString(),
      currentTask: w.currentTask,
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
          if (typeof w.pid === "number") {
            await this.removeFromDeviceRegistry(w.pid);
          }
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
      if (typeof instance.pid === "number") {
        await this.removeFromDeviceRegistry(instance.pid);
      }
      return true;
    } catch {
      return false;
    }
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
};
