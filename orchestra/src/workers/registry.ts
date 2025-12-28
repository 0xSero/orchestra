import type { WorkerInstance, WorkerStatus } from "../types";

export type WorkerRegistryEvent =
  | "starting"
  | "spawn"
  | "ready"
  | "busy"
  | "error"
  | "stop"
  | "update"
  | "dead"
  | "stopped";
export type WorkerRegistryCallback = (instance: WorkerInstance) => void;

export class WorkerRegistry {
  private workers = new Map<string, WorkerInstance>();
  private listeners = new Map<WorkerRegistryEvent, Set<WorkerRegistryCallback>>();

  // biome-ignore lint/complexity/noUselessConstructor: coverage needs explicit constructor.
  constructor() {
    // Explicit constructor keeps coverage tooling from missing instantiation.
  }

  register(instance: WorkerInstance): void {
    this.workers.set(instance.profile.id, instance);
    this.emit("spawn", instance);
    this.emit("update", instance);
  }

  unregister(id: string): void {
    const instance = this.workers.get(id);
    if (!instance) return;
    this.workers.delete(id);
    this.emit("stop", instance);
  }

  get(id: string): WorkerInstance | undefined {
    return this.workers.get(id);
  }

  list(): WorkerInstance[] {
    return Array.from(this.workers.values());
  }

  getWorkersByStatus(status: WorkerStatus): WorkerInstance[] {
    const result: WorkerInstance[] = [];
    for (const worker of this.workers.values()) {
      if (worker.status === status) result.push(worker);
    }
    return result;
  }

  getWorkersByCapability(capability: string): WorkerInstance[] {
    const result: WorkerInstance[] = [];
    for (const worker of this.workers.values()) {
      if (capability === "vision" && worker.profile.supportsVision) {
        result.push(worker);
        continue;
      }
      if (capability === "web" && worker.profile.supportsWeb) {
        result.push(worker);
      }
    }
    return result;
  }

  getVisionWorkers(): WorkerInstance[] {
    return this.getWorkersByCapability("vision");
  }

  getActiveWorkers(): WorkerInstance[] {
    const result: WorkerInstance[] = [];
    for (const worker of this.workers.values()) {
      if (worker.status === "ready" || worker.status === "busy") result.push(worker);
    }
    return result;
  }

  updateStatus(id: string, status: WorkerStatus, error?: string): void {
    const instance = this.workers.get(id);
    if (!instance) return;
    instance.status = status;
    if (error) instance.error = error;
    this.emit(status === "error" ? "error" : status, instance);
    this.emit("update", instance);
  }

  waitForStatus(workerId: string, status: WorkerStatus, timeoutMs: number): Promise<boolean> {
    const existing = this.get(workerId);
    if (existing?.status === status) return Promise.resolve(true);

    const { promise, resolve } = Promise.withResolvers<boolean>();
    /* c8 ignore next */
    const timeout = setTimeout(() => {
      this.off("update", onUpdate);
      resolve(false);
    }, timeoutMs);

    const onUpdate = (instance: WorkerInstance) => {
      if (instance.profile.id !== workerId) return;
      if (instance.status !== status) return;
      clearTimeout(timeout);
      this.off("update", onUpdate);
      resolve(true);
    };

    this.on("update", onUpdate);
    return promise;
  }

  on(event: WorkerRegistryEvent, callback: WorkerRegistryCallback): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(callback);
    this.listeners.set(event, set);
    return () => this.off(event, callback);
  }

  off(event: WorkerRegistryEvent, callback: WorkerRegistryCallback): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(callback);
    if (set.size === 0) this.listeners.delete(event);
  }

  toJSON(): Array<Record<string, unknown>> {
    const rows: Array<Record<string, unknown>> = [];
    for (const w of this.workers.values()) {
      rows.push({
        id: w.profile.id,
        name: w.profile.name,
        model: w.profile.model,
        modelResolution: w.modelResolution,
        purpose: w.profile.purpose,
        whenToUse: w.profile.whenToUse,
        profile: w.profile,
        status: w.status,
        port: w.port,
        pid: w.pid,
        serverUrl: w.serverUrl,
        supportsVision: Boolean(w.profile.supportsVision),
        supportsWeb: Boolean(w.profile.supportsWeb),
        lastActivity: w.lastActivity?.toISOString(),
        currentTask: w.currentTask,
        error: w.error,
        warning: w.warning,
        lastResult: w.lastResult
          ? {
              ...w.lastResult,
              at: w.lastResult.at.toISOString(),
            }
          : undefined,
      });
    }
    return rows;
  }

  getSummary(options: { maxWorkers?: number } = {}): string {
    const maxWorkers = options.maxWorkers ?? 12;
    const workers = Array.from(this.workers.values()).slice(0, Math.max(0, maxWorkers));
    if (workers.length === 0) return "No workers currently registered.";

    const total = this.workers.size;
    const lines = ["## Available Workers", ""];
    if (total > workers.length) lines.push(`(showing ${workers.length} of ${total})`, "");
    for (const w of workers) {
      lines.push(`- ${w.profile.id} (${w.profile.name}) — ${w.status}`);
    }
    lines.push("", "Use ask_worker({ workerId: <id>, message: <text> }) to message a worker.");
    return lines.join("\n");
  }

  private emit(event: WorkerRegistryEvent, instance: WorkerInstance): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of set) {
      cb(instance);
    }
  }
}
