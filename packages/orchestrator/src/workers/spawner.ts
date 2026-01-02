/**
 * Worker Spawner - dispatches to backend implementations.
 */

import type { WorkerBackend, WorkerInstance, WorkerProfile } from "../types";
import { workerPool, type SpawnOptions } from "../core/worker-pool";
import { publishErrorEvent } from "../core/orchestrator-events";
import {
  spawnAgentWorker,
  sendToAgentWorker,
  stopAgentWorker,
} from "./backends/agent";
import {
  spawnServerWorker,
  connectToServerWorker,
  sendToServerWorker,
  stopServerWorker,
  listReusableServerWorkers,
  cleanupDeadServerWorkers,
} from "./backends/server";
import type { SendToWorkerOptions } from "./send";
import { isFullModelID } from "../models/catalog";

function resolveWorkerBackend(profile: WorkerProfile): WorkerBackend {
  if (profile.kind === "server") return "server";
  if (profile.kind === "agent" || profile.kind === "subagent") return "agent";
  return profile.backend === "agent" ? "agent" : "server";
}

export async function spawnWorker(
  profile: WorkerProfile,
  options: SpawnOptions & { forceNew?: boolean },
): Promise<WorkerInstance> {
  const backend = resolveWorkerBackend(profile);
  if (backend === "agent") {
    return spawnAgentWorker(profile, options);
  }
  return spawnServerWorker(profile, options);
}

export async function connectToWorker(
  profile: WorkerProfile,
  port: number,
): Promise<WorkerInstance> {
  const backend = resolveWorkerBackend(profile);
  if (backend !== "server") {
    throw new Error(
      `Worker "${profile.id}" uses agent backend and cannot connect to a server process.`,
    );
  }
  return connectToServerWorker(profile, port);
}

export async function stopWorker(workerId: string): Promise<boolean> {
  const instance = workerPool.get(workerId);
  if (!instance) return false;
  const backend = resolveWorkerBackend(instance.profile);
  if (backend === "agent") {
    return stopAgentWorker(workerId);
  }
  return stopServerWorker(workerId);
}

export async function sendToWorker(
  workerId: string,
  message: string,
  options?: SendToWorkerOptions & { client?: any; directory?: string },
): Promise<{
  success: boolean;
  response?: string;
  warning?: string;
  error?: string;
}> {
  const instance = workerPool.get(workerId);
  if (!instance) {
    publishErrorEvent({
      message: `Worker "${workerId}" not found`,
      source: "worker",
      workerId,
    });
    return { success: false, error: `Worker "${workerId}" not found` };
  }
  const backend = resolveWorkerBackend(instance.profile);
  const stickyModel =
    instance.modelPolicy === "sticky"
      ? instance.profile.model?.trim()
      : undefined;
  const resolvedModel =
    options?.model ??
    (stickyModel && (backend === "agent" || isFullModelID(stickyModel))
      ? stickyModel
      : undefined);
  const nextOptions = resolvedModel
    ? { ...(options ?? {}), model: resolvedModel }
    : options;
  if (backend === "agent") {
    return sendToAgentWorker(workerId, message, nextOptions);
  }
  return sendToServerWorker(workerId, message, nextOptions);
}

export async function spawnWorkers(
  profiles: WorkerProfile[],
  options: SpawnOptions & { sequential?: boolean },
): Promise<{
  succeeded: WorkerInstance[];
  failed: Array<{ profile: WorkerProfile; error: string }>;
}> {
  const succeeded: WorkerInstance[] = [];
  const failed: Array<{ profile: WorkerProfile; error: string }> = [];

  const sequential = options.sequential !== false;

  if (sequential) {
    for (const profile of profiles) {
      try {
        const instance = await spawnWorker(profile, options);
        succeeded.push(instance);
      } catch (err) {
        failed.push({
          profile,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } else {
    const results = await Promise.allSettled(
      profiles.map((profile) => spawnWorker(profile, options)),
    );

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        succeeded.push(result.value);
      } else {
        failed.push({
          profile: profiles[index],
          error: result.reason?.message || String(result.reason),
        });
      }
    });
  }

  return { succeeded, failed };
}

export async function listReusableWorkers() {
  return listReusableServerWorkers();
}

export async function cleanupDeadWorkers() {
  return cleanupDeadServerWorkers();
}
