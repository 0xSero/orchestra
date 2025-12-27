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
    return Array.from(this.workers.values()).filter((w) => w.status === status);
  }

  getWorkersByCapability(capability: string): WorkerInstance[] {
    return Array.from(this.workers.values()).filter((w) => {
      if (capability === "vision") return Boolean(w.profile.supportsVision);
      if (capability === "web") return Boolean(w.profile.supportsWeb);
      return false;
    });
  }

  getVisionWorkers(): WorkerInstance[] {
    return this.getWorkersByCapability("vision");
  }

  getActiveWorkers(): WorkerInstance[] {
    return Array.from(this.workers.values()).filter((w) => w.status === "ready" || w.status === "busy");
  }

  updateStatus(id: string, status: WorkerStatus, error?: string): void {
    const instance = this.workers.get(id);
    if (!instance) return;
    instance.status = status;
    if (error) instance.error = error;
    this.emit(status === "error" ? "error" : status, instance);
    this.emit("update", instance);
  }

  async waitForStatus(workerId: string, status: WorkerStatus, timeoutMs: number): Promise<boolean> {
    const existing = this.get(workerId);
    if (existing?.status === status) return true;

    return await new Promise<boolean>((resolve) => {
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
    });
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
    return Array.from(this.workers.values()).map((w) => ({
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
    }));
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
