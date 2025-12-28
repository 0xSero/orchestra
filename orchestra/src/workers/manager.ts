import type { ApiService } from "../api";
import type { CommunicationService } from "../communication";
import type { DatabaseService } from "../db";
import type { MemoryService } from "../memory";
import type { Factory, OrchestratorConfig, ServiceLifecycle, WorkerInstance, WorkerProfile } from "../types";
import { type WorkerJob, WorkerJobRegistry } from "./jobs";
import { killAllTrackedWorkers, trackWorkerPid, untrackWorkerPid } from "./pid-tracker";
import { WorkerRegistry } from "./registry";
import { sendWorkerMessage, type WorkerSendOptions } from "./send";
import { createSessionManager, type WorkerSessionManager } from "./session-manager";
import { cleanupWorkerInstance, type SpawnWorkerCallbacks, spawnWorker } from "./spawn";

export type WorkerManagerConfig = {
  basePort: number;
  timeout: number;
  directory: string;
  profiles: Record<string, WorkerProfile>;
  modelSelection?: OrchestratorConfig["modelSelection"];
  modelAliases?: OrchestratorConfig["modelAliases"];
  integrations?: OrchestratorConfig["integrations"];
};

export type WorkerManagerDeps = {
  api?: ApiService;
  communication?: CommunicationService;
  memory?: MemoryService;
  db?: DatabaseService;
  spawnWorker?: typeof spawnWorker;
  cleanupWorkerInstance?: typeof cleanupWorkerInstance;
  sendWorkerMessage?: typeof sendWorkerMessage;
};

export type WorkerManager = ServiceLifecycle & {
  getProfile: (id: string) => WorkerProfile | undefined;
  listProfiles: () => WorkerProfile[];
  spawn: (profile: WorkerProfile, options?: { parentSessionId?: string }) => Promise<WorkerInstance>;
  spawnById: (profileId: string, options?: { parentSessionId?: string }) => Promise<WorkerInstance>;
  stopWorker: (workerId: string) => Promise<boolean>;
  send: (
    workerId: string,
    message: string,
    options?: {
      attachments?: import("./prompt").WorkerAttachment[];
      timeout?: number;
      jobId?: string;
      from?: string;
      sessionId?: string;
    },
  ) => Promise<{ success: boolean; response?: string; error?: string }>;
  getWorker: (id: string) => WorkerInstance | undefined;
  listWorkers: () => WorkerInstance[];
  getSummary: (options?: { maxWorkers?: number }) => string;
  /** Session manager for tracking worker sessions and activity */
  sessionManager: WorkerSessionManager;
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
  const api = deps.api;
  const communication = deps.communication;
  const spawnWorkerFn = deps.spawnWorker ?? spawnWorker;
  const cleanupWorkerFn = deps.cleanupWorkerInstance ?? cleanupWorkerInstance;
  const sendWorkerMessageFn = deps.sendWorkerMessage ?? sendWorkerMessage;
  const registry = new WorkerRegistry();
  const jobs = new WorkerJobRegistry();
  const inFlight = new Map<string, Promise<WorkerInstance>>();
  const db = deps.db;

  // Create session manager for centralized session tracking
  const sessionManager = createSessionManager({
    api,
    communication: communication!,
  });

  const emitJobEvent = (job: WorkerJob | undefined, status: "created" | "succeeded" | "failed") => {
    if (!communication || !job) return;
    communication.emit(
      "orchestra.worker.job",
      { job, status },
      { source: "orchestrator", workerId: job.workerId, jobId: job.id },
    );
  };

  const spawn = async (profile: WorkerProfile, options?: { parentSessionId?: string }) => {
    const existing = registry.get(profile.id);
    if (existing) {
      if (communication) {
        communication.emit(
          "orchestra.worker.reused",
          { worker: existing },
          { source: "orchestrator", workerId: existing.profile.id },
        );
      }
      return existing;
    }

    const inFlightSpawn = inFlight.get(profile.id);
    if (inFlightSpawn) return await inFlightSpawn;

    const spawnPromise = spawnWorkerFn({
      api,
      registry,
      directory: config.directory,
      profile,
      integrations: config.integrations,
      modelSelection: config.modelSelection,
      modelAliases: config.modelAliases,
      timeoutMs: config.timeout,
      callbacks: spawnCallbacks,
      sessionManager,
      communication,
      parentSessionId: options?.parentSessionId,
    });
    inFlight.set(profile.id, spawnPromise);
    try {
      const instance = await spawnPromise;
      // Track the worker PID for cleanup on shutdown
      if (instance.port) {
        void trackWorkerPid({
          pid: process.pid, // We track the parent; actual server PID is internal to SDK
          workerId: profile.id,
          port: instance.port,
        });
      }
      return instance;
    } finally {
      inFlight.delete(profile.id);
    }
  };

  const forwardWorkerEvent = (event: string, instance: WorkerInstance) => {
    if (!communication) return;
    const meta = { source: "orchestrator" as const, workerId: instance.profile.id };
    if (event === "spawn") {
      communication.emit("orchestra.worker.spawned", { worker: instance }, meta);
      communication.emit("orchestra.worker.created", { worker: instance }, meta);
    }
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
  const onError = (instance: WorkerInstance) => forwardWorkerEvent("error", instance);
  const onPersist = (instance: WorkerInstance) => persistWorkerState(instance);

  const persistWorkerState = (instance: WorkerInstance) => {
    if (!db) return;
    try {
      const lastResult = instance.lastResult
        ? { ...instance.lastResult, at: instance.lastResult.at.toISOString() }
        : null;
      db.setWorkerState({
        workerId: instance.profile.id,
        profileName: instance.profile.name,
        model: instance.profile.model,
        serverUrl: instance.serverUrl ?? null,
        sessionId: instance.sessionId ?? null,
        uiSessionId: instance.uiSessionId ?? null,
        status: instance.status,
        sessionMode: instance.sessionMode ?? null,
        parentSessionId: instance.parentSessionId ?? null,
        startedAt: instance.startedAt,
        lastActivity: instance.lastActivity ?? instance.startedAt,
        currentTask: instance.currentTask ?? null,
        lastResult,
        lastResultAt: instance.lastResult?.at ?? null,
        lastResultJobId: instance.lastResult?.jobId ?? null,
        lastResultDurationMs: instance.lastResult?.durationMs ?? null,
        error: instance.error ?? null,
        warning: instance.warning ?? null,
      });
    } catch {
      // ignore persistence errors
    }
  };

  // Callbacks for model resolution events
  const spawnCallbacks: SpawnWorkerCallbacks = {
    onModelResolved: (change) => {
      if (!communication) return;
      communication.emit(
        "orchestra.model.resolved",
        { resolution: change },
        { source: "orchestrator", workerId: change.profileId },
      );
    },
    onModelFallback: (profileId, model, reason) => {
      if (!communication) return;
      communication.emit(
        "orchestra.model.fallback",
        { profileId, model, reason },
        { source: "orchestrator", workerId: profileId },
      );
    },
  };

  const asRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

  const extractSessionId = (value: unknown): string | undefined => {
    const data = asRecord(value) && "data" in value ? (value as { data?: unknown }).data : value;
    if (!asRecord(data)) return undefined;
    return typeof data.id === "string" ? data.id : undefined;
  };

  const formatWorkerResponse = (text: string): string => {
    // Format long unbroken lines by adding line breaks for readability
    const lines = text.split("\n");
    const formatted: string[] = [];

    for (const line of lines) {
      if (line.length <= 80) {
        formatted.push(line);
        continue;
      }

      // Break long lines at natural points (periods, colons, semicolons)
      let remaining = line;
      while (remaining.length > 80) {
        let breakAt = -1;
        // Find a good break point within first 80 chars
        for (let i = Math.min(79, remaining.length - 1); i >= 50; i--) {
          const char = remaining[i];
          if (char === "." || char === ":" || char === ";") {
            breakAt = i + 1;
            break;
          }
        }
        // Fallback: break at comma or space
        if (breakAt === -1) {
          for (let i = Math.min(79, remaining.length - 1); i >= 40; i--) {
            if (remaining[i] === "," || remaining[i] === " ") {
              breakAt = i + 1;
              break;
            }
          }
        }
        // Last resort: hard break
        if (breakAt === -1) breakAt = 80;

        formatted.push(remaining.slice(0, breakAt).trimEnd());
        remaining = remaining.slice(breakAt).trimStart();
      }
      if (remaining) formatted.push(remaining);
    }

    return formatted.join("\n");
  };

  const buildWorkerSummary = (instance: WorkerInstance, response?: string) => {
    const profileName = instance.profile.name || instance.profile.id;
    const body = response?.trim() ?? instance.lastResult?.response?.trim() ?? "";
    const truncated = body.length > 1200 ? `${body.slice(0, 1197).trimEnd()}...` : body;
    const formattedBody = formatWorkerResponse(truncated);

    const lines: string[] = [
      `┌─ Worker "${profileName}" ─────────────────────────────`,
      `│`,
    ];

    if (formattedBody) {
      for (const line of formattedBody.split("\n")) {
        lines.push(`│  ${line}`);
      }
    } else {
      lines.push(`│  (no response)`);
    }

    lines.push(`│`);
    lines.push(`└────────────────────────────────────────────────────────`);

    return lines.join("\n");
  };

  return {
    getProfile: (id) => config.profiles[id],
    listProfiles: () => Object.values(config.profiles),
    spawn,
    spawnById: async (profileId, options) => {
      const profile = config.profiles[profileId];
      if (!profile) throw new Error(`Unknown worker profile: ${profileId}`);
      if (profile.enabled === false) {
        throw new Error(`Worker "${profileId}" is disabled by configuration.`);
      }
      return await spawn(profile, options);
    },
    stopWorker: async (workerId) => {
      const instance = registry.get(workerId);
      if (!instance) return false;
      try {
        // Clean up session manager and event forwarding
        cleanupWorkerFn(instance, sessionManager);
        await instance.shutdown?.();
        // Remove from PID tracking
        void untrackWorkerPid(workerId);
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
        parentSessionId: options?.sessionId,
        communication,
      };
      const instance = registry.get(workerId);
      const memory = deps.memory;
      const parentSessionId = options?.sessionId;

      if (instance && parentSessionId) {
        const needsNewUiSession = !instance.uiSessionId || instance.parentSessionId !== parentSessionId;
        if (needsNewUiSession) {
          try {
            const res = await api.session.create({
              body: { title: `Worker: ${instance.profile.name}`, parentID: parentSessionId },
            });
            const uiSessionId = extractSessionId(res);
            if (uiSessionId) {
              instance.uiSessionId = uiSessionId;
              instance.parentSessionId = parentSessionId;
              persistWorkerState(instance);
            }
          } catch {
            // ignore UI session failures
          }
        } else if (!instance.parentSessionId) {
          instance.parentSessionId = parentSessionId;
          persistWorkerState(instance);
        }

        const activeSessionId = instance.uiSessionId ?? instance.sessionId;
        if (communication && activeSessionId) {
          communication.emit(
            "orchestra.subagent.active",
            {
              subagent: {
                workerId: instance.profile.id,
                sessionId: activeSessionId,
                parentSessionId,
                profile: { id: instance.profile.id, name: instance.profile.name, model: instance.profile.model },
                serverUrl: instance.serverUrl,
                status: instance.status,
              },
            },
            { source: "orchestrator", workerId: instance.profile.id, sessionId: activeSessionId },
          );
        }
      }
      const beforePrompt = async () => {
        if (!instance || !memory?.enabled) return;
        if (instance.client && instance.sessionId) {
          await memory.inject({
            client: instance.client,
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

      const result = await sendWorkerMessageFn({
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

      if (communication && instance) {
        if (result.success) {
          communication.emit(
            "orchestra.worker.completed",
            { worker: instance, jobId: options?.jobId, response: result.response ?? "" },
            { source: "orchestrator", workerId: instance.profile.id, jobId: options?.jobId },
          );
        }

        const activeSessionId = instance.uiSessionId ?? instance.sessionId;
        if (activeSessionId) {
          communication.emit(
            "orchestra.subagent.closed",
            {
              subagent: {
                workerId: instance.profile.id,
                sessionId: activeSessionId,
                parentSessionId: instance.parentSessionId,
                profile: { id: instance.profile.id, name: instance.profile.name, model: instance.profile.model },
                serverUrl: instance.serverUrl,
                status: instance.status,
              },
              result: result.success
                ? { summary: buildWorkerSummary(instance, result.response) }
                : { error: result.error ?? "Worker request failed" },
            },
            { source: "orchestrator", workerId: instance.profile.id, sessionId: activeSessionId },
          );
        }
      }

      if (result.success && parentSessionId) {
        const summary = instance ? buildWorkerSummary(instance, result.response) : `Worker ${workerId} completed.`;
        void api.session
          .prompt({
            path: { id: parentSessionId },
            body: {
              noReply: true,
              parts: [{ type: "text", text: summary }],
            },
          })
          .catch(() => {});
      }
      return { success: result.success, response: result.response, error: result.error };
    },
    getWorker: (id) => registry.get(id),
    listWorkers: () => registry.list(),
    getSummary: (options) => registry.getSummary(options),
    sessionManager,
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
      registry.on("error", onError);
      registry.on("update", onPersist);
    },
    stop: async () => {
      registry.off("spawn", onSpawn);
      registry.off("update", onUpdate);
      registry.off("stop", onStop);
      registry.off("error", onError);
      registry.off("update", onPersist);
      // Kill all tracked workers spawned by this process
      await killAllTrackedWorkers();
    },
    health: async () => ({ ok: true }),
  };
};
