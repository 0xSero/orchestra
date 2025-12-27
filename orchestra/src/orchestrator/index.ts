import type { ApiService } from "../api";
import type { CommunicationService } from "../communication";
import { canAutoSpawn, canSpawnManually, canSpawnOnDemand } from "../core/spawn-policy";
import type { Factory, OrchestratorConfig, ServiceLifecycle, WorkerInstance } from "../types";
import type { WorkerManager } from "../workers";
import type { WorkerAttachment } from "../workers/prompt";
import type { WorkflowEngine } from "../workflows/factory";
import { selectWorkerId } from "./router";

export type OrchestratorDeps = {
  api: ApiService;
  workers: WorkerManager;
  workflows?: WorkflowEngine;
  communication?: CommunicationService;
};

export type OrchestratorService = ServiceLifecycle & {
  ensureWorker: (input: { workerId: string; reason: "manual" | "on-demand" }) => Promise<WorkerInstance>;
  delegateTask: (input: {
    task: string;
    attachments?: WorkerAttachment[];
    autoSpawn?: boolean;
  }) => Promise<{ workerId: string; response: string }>;
  runWorkflow: (input: {
    workflowId: string;
    task: string;
    attachments?: WorkerAttachment[];
    autoSpawn?: boolean;
  }) => Promise<any>;
};

export const createOrchestrator: Factory<OrchestratorConfig, OrchestratorDeps, OrchestratorService> = ({
  config,
  deps,
}) => {
  const ensureWorker = async (input: { workerId: string; reason: "manual" | "on-demand" }) => {
    const existing = deps.workers.getWorker(input.workerId);
    if (existing) return existing;

    const allowedByPolicy =
      input.reason === "manual"
        ? canSpawnManually(config.spawnPolicy, input.workerId)
        : canSpawnOnDemand(config.spawnPolicy, input.workerId);
    if (!allowedByPolicy) {
      throw new Error(`Spawning worker "${input.workerId}" is disabled by spawnPolicy.`);
    }

    // Note: Removed redundant spawnOnDemand whitelist check.
    // The spawnPolicy check above already controls on-demand spawning.
    // Vision and other workers should be spawnable on-demand by default.

    return await deps.workers.spawnById(input.workerId);
  };

  const delegateTask = async (input: { task: string; attachments?: WorkerAttachment[]; autoSpawn?: boolean }) => {
    const workerId = selectWorkerId({
      task: input.task,
      profiles: config.profiles,
      attachments: input.attachments,
    });
    if (!workerId) throw new Error("No worker available for this task.");

    const instance =
      input.autoSpawn === false
        ? deps.workers.getWorker(workerId)
        : await ensureWorker({ workerId, reason: "on-demand" });

    if (!instance) {
      throw new Error(`Worker "${workerId}" is not running.`);
    }

    const res = await deps.workers.send(workerId, input.task, {
      attachments: input.attachments,
    });
    if (!res.success || !res.response) {
      throw new Error(res.error ?? "Worker request failed");
    }

    return { workerId, response: res.response };
  };

  const runWorkflow = async (input: {
    workflowId: string;
    task: string;
    attachments?: WorkerAttachment[];
    autoSpawn?: boolean;
  }) => {
    if (!deps.workflows) throw new Error("Workflows are not enabled.");
    return await deps.workflows.run(
      {
        workflowId: input.workflowId,
        task: input.task,
        attachments: input.attachments,
        autoSpawn: input.autoSpawn,
        limits: {
          maxSteps: config.workflows?.roocodeBoomerang?.maxSteps ?? 6,
          maxTaskChars: config.workflows?.roocodeBoomerang?.maxTaskChars ?? 4000,
          maxCarryChars: config.workflows?.roocodeBoomerang?.maxCarryChars ?? 8000,
          perStepTimeoutMs: config.workflows?.roocodeBoomerang?.perStepTimeoutMs ?? 300_000,
        },
      },
      {
        resolveWorker: async (workerId, autoSpawn) => {
          if (autoSpawn === false) return workerId;
          await ensureWorker({ workerId, reason: "on-demand" });
          return workerId;
        },
        sendToWorker: async (workerId, message, options) =>
          deps.workers.send(workerId, message, {
            attachments: options.attachments,
            timeout: options.timeoutMs,
          }),
      },
    );
  };

  const start = async () => {
    if (!config.autoSpawn) return;
    const spawnIds = config.spawn ?? [];
    // Don't block startup - spawn workers in background
    if (spawnIds.length > 0) {
      setTimeout(() => {
        for (const id of spawnIds) {
          if (!canAutoSpawn(config.spawnPolicy, id)) continue;
          deps.workers.spawnById(id).catch(() => {});
        }
      }, 100);
    }
  };

  const stop = async () => {
    const workers = deps.workers.listWorkers();
    await Promise.allSettled(workers.map((w) => deps.workers.stopWorker(w.profile.id)));
  };

  return {
    ensureWorker,
    delegateTask,
    runWorkflow,
    start,
    stop,
    health: async () => ({ ok: true }),
  };
};
