import type { Factory, ServiceLifecycle, WorkerInstance, WorkerProfile } from "../types";
import type { OrchestratorConfig } from "../types";
import type { ApiService } from "../api";
import type { CommunicationService } from "../communication";
import type { MemoryService } from "../memory";
import { WorkerRegistry } from "./registry";
import { WorkerJobRegistry, type WorkerJob } from "./jobs";
import { spawnWorker, type SpawnWorkerCallbacks } from "./spawn";
import { sendWorkerMessage, type WorkerSendOptions } from "./send";

export type WorkerManagerConfig = {
  basePort: number;
  timeout: number;
  directory: string;
  profiles: Record<string, WorkerProfile>;
  modelSelection?: OrchestratorConfig["modelSelection"];
  modelAliases?: OrchestratorConfig["modelAliases"];
};

export type WorkerManagerDeps = {
  api?: ApiService;
  communication?: CommunicationService;
  memory?: MemoryService;
};

export type WorkerManager = ServiceLifecycle & {
  getProfile: (id: string) => WorkerProfile | undefined;
  listProfiles: () => WorkerProfile[];
  spawn: (profile: WorkerProfile) => Promise<WorkerInstance>;
  spawnById: (profileId: string) => Promise<WorkerInstance>;
  stopWorker: (workerId: string) => Promise<boolean>;
  send: (
    workerId: string,
    message: string,
    options?: {
      attachments?: import("./prompt").WorkerAttachment[];
      timeout?: number;
      jobId?: string;
      from?: string;
    }
  ) => Promise<{ success: boolean; response?: string; error?: string }>;
  getWorker: (id: string) => WorkerInstance | undefined;
  listWorkers: () => WorkerInstance[];
  getSummary: (options?: { maxWorkers?: number }) => string;
  jobs: {
    create: (input: { workerId: string; message: string; sessionId?: string; requestedBy?: string }) => WorkerJob;
    get: (id: string) => WorkerJob | undefined;
    list: (options?: { workerId?: string; limit?: number }) => WorkerJob[];
    await: (id: string, options?: { timeoutMs?: number }) => Promise<WorkerJob>;
    attachReport: (id: string, report: WorkerJob["report"]) => void;
    setResult: (id: string, result: { responseText?: string; error?: string; report?: WorkerJob["report"] }) => void;
  };
};

export const createWorkerManager: Factory<WorkerManagerConfig, WorkerManagerDeps, WorkerManager> = ({
  config,
  deps,
}) => {
  if (!deps.api) {
    throw new Error("WorkerManager requires api dependency");
  }
  const communication = deps.communication;
  const registry = new WorkerRegistry();
  const jobs = new WorkerJobRegistry();
  const inFlight = new Map<string, Promise<WorkerInstance>>();

  const emitJobEvent = (job: WorkerJob | undefined, status: "created" | "succeeded" | "failed") => {
    if (!communication || !job) return;
    communication.emit("orchestra.worker.job", { job, status }, { source: "orchestrator", workerId: job.workerId, jobId: job.id });
  };

  const spawn = async (profile: WorkerProfile) => {
    const existing = registry.get(profile.id);
    if (existing) {
      if (communication) {
        communication.emit("orchestra.worker.reused", { worker: existing }, { source: "orchestrator", workerId: existing.profile.id });
      }
      return existing;
    }

    const inFlightSpawn = inFlight.get(profile.id);
    if (inFlightSpawn) return await inFlightSpawn;

    const spawnPromise = spawnWorker({
      api: deps.api as ApiService,
      registry,
      directory: config.directory,
      profile,
      modelSelection: config.modelSelection,
      modelAliases: config.modelAliases,
      timeoutMs: config.timeout,
      callbacks: spawnCallbacks,
    });
    inFlight.set(profile.id, spawnPromise);
    try {
      return await spawnPromise;
    } finally {
      inFlight.delete(profile.id);
    }
  };

  const forwardWorkerEvent = (event: string, instance: WorkerInstance) => {
    if (!communication) return;
    const meta = { source: "orchestrator" as const, workerId: instance.profile.id };
    if (event === "spawn") communication.emit("orchestra.worker.spawned", { worker: instance }, meta);
    if (event === "ready") communication.emit("orchestra.worker.ready", { worker: instance }, meta);
    if (event === "busy") communication.emit("orchestra.worker.busy", { worker: instance }, meta);
    if (event === "error") {
      communication.emit("orchestra.worker.error", { worker: instance, error: instance.error ?? "unknown" }, meta);
    }
    if (event === "stop") communication.emit("orchestra.worker.stopped", { worker: instance }, meta);
    if (event === "update") communication.emit("orchestra.worker.ready", { worker: instance }, meta);
  };

  const onSpawn = (instance: WorkerInstance) => forwardWorkerEvent("spawn", instance);
  const onUpdate = (instance: WorkerInstance) => forwardWorkerEvent("update", instance);
  const onStop = (instance: WorkerInstance) => forwardWorkerEvent("stop", instance);

  // Callbacks for model resolution events
  const spawnCallbacks: SpawnWorkerCallbacks = {
    onModelResolved: (change) => {
      if (!communication) return;
      communication.emit(
        "orchestra.model.resolved",
        { resolution: change },
        { source: "orchestrator", workerId: change.profileId }
      );
    },
    onModelFallback: (profileId, model, reason) => {
      if (!communication) return;
      communication.emit(
        "orchestra.model.fallback",
        { profileId, model, reason },
        { source: "orchestrator", workerId: profileId }
      );
    },
  };

  return {
    getProfile: (id) => config.profiles[id],
    listProfiles: () => Object.values(config.profiles),
    spawn,
    spawnById: async (profileId) => {
      const profile = config.profiles[profileId];
      if (!profile) throw new Error(`Unknown worker profile: ${profileId}`);
      return await spawn(profile);
    },
    stopWorker: async (workerId) => {
      const instance = registry.get(workerId);
      if (!instance) return false;
      try {
        await instance.shutdown?.();
      } finally {
        instance.status = "stopped";
        registry.updateStatus(workerId, "stopped");
        registry.unregister(workerId);
      }
      return true;
    },
    send: async (workerId, message, options) => {
      const sendOptions: WorkerSendOptions = {
        attachments: options?.attachments,
        timeoutMs: options?.timeout,
        jobId: options?.jobId,
        from: options?.from,
      };
      const instance = registry.get(workerId);
      const memory = deps.memory;
      const beforePrompt = async () => {
        if (!instance || !memory?.enabled) return;
        if (instance.client && instance.sessionId) {
          await memory.inject({
            client: instance.client as any,
            sessionId: instance.sessionId,
            directory: instance.directory,
          });
        }
        if (instance.sessionId) {
          void memory.record({
            text: message,
            sessionId: instance.sessionId,
            role: "user",
            userId: sendOptions.from ?? "orchestrator",
          });
        }
      };

      const result = await sendWorkerMessage({
        registry,
        workerId,
        message,
        options: sendOptions,
        beforePrompt,
      });

      if (memory?.enabled && result.success && result.response && instance?.sessionId) {
        void memory.record({
          text: result.response,
          sessionId: instance.sessionId,
          role: "assistant",
          userId: workerId,
        });
      }
      return { success: result.success, response: result.response, error: result.error };
    },
    getWorker: (id) => registry.get(id),
    listWorkers: () => registry.list(),
    getSummary: (options) => registry.getSummary(options),
    jobs: {
      create: (input) => {
        const job = jobs.create(input);
        emitJobEvent(job, "created");
        return job;
      },
      get: (id) => jobs.get(id),
      list: (options) => jobs.list(options),
      await: (id, options) => jobs.await(id, options),
      attachReport: (id, report) => jobs.attachReport(id, report!),
      setResult: (id, result) => {
        if (result.error) {
          jobs.setError(id, { error: result.error, report: result.report });
          emitJobEvent(jobs.get(id), "failed");
          return;
        }
        jobs.setResult(id, { responseText: result.responseText ?? "", report: result.report });
        emitJobEvent(jobs.get(id), "succeeded");
      },
    },
    start: async () => {
      registry.on("spawn", onSpawn);
      registry.on("update", onUpdate);
      registry.on("stop", onStop);
    },
    stop: async () => {
      registry.off("spawn", onSpawn);
      registry.off("update", onUpdate);
      registry.off("stop", onStop);
    },
    health: async () => ({ ok: true }),
  };
};
