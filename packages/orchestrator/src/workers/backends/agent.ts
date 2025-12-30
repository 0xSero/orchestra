import type { WorkerInstance, WorkerProfile } from "../../types";
import { workerPool } from "../../core/worker-pool";
import { publishErrorEvent } from "../../core/orchestrator-events";
import { sendWorkerPrompt, type SendToWorkerOptions } from "../send";

function getBackendClient(instance: WorkerInstance, fallback?: any) {
  return instance.client ?? fallback;
}

export async function spawnAgentWorker(
  profile: WorkerProfile,
  options: { basePort: number; timeout: number; directory: string; client?: any }
): Promise<WorkerInstance> {
  return workerPool.getOrSpawn(profile, options, async (resolvedProfile, spawnOptions) => {
    const instance: WorkerInstance = {
      profile: resolvedProfile,
      status: "starting",
      port: 0,
      directory: spawnOptions.directory,
      startedAt: new Date(),
      modelResolution: "agent backend",
    };

    workerPool.register(instance);

    if (!spawnOptions.client) {
      const msg = `OpenCode client required to spawn agent worker "${resolvedProfile.id}".`;
      instance.status = "error";
      instance.error = msg;
      workerPool.updateStatus(resolvedProfile.id, "error", msg);
      throw new Error(msg);
    }

    instance.client = spawnOptions.client;
    instance.status = "ready";
    instance.lastActivity = new Date();
    workerPool.updateStatus(resolvedProfile.id, "ready");

    return instance;
  });
}

export async function sendToAgentWorker(
  workerId: string,
  message: string,
  options?: SendToWorkerOptions & { client?: any; directory?: string }
): Promise<{ success: boolean; response?: string; error?: string }> {
  const instance = workerPool.get(workerId);

  if (!instance) {
    publishErrorEvent({ message: `Worker "${workerId}" not found`, source: "worker", workerId });
    return { success: false, error: `Worker "${workerId}" not found` };
  }

  if (instance.status !== "ready") {
    publishErrorEvent({
      message: `Worker "${workerId}" is ${instance.status}, not ready`,
      source: "worker",
      workerId,
    });
    return { success: false, error: `Worker "${workerId}" is ${instance.status}, not ready` };
  }

  const client = getBackendClient(instance, options?.client);
  if (!client) {
    publishErrorEvent({
      message: `Worker "${workerId}" missing OpenCode client`,
      source: "worker",
      workerId,
    });
    return { success: false, error: `Worker "${workerId}" missing OpenCode client` };
  }

  const sessionId = options?.sessionId ?? instance.sessionId;
  if (!sessionId) {
    publishErrorEvent({
      message: `Worker "${workerId}" missing sessionId for agent backend`,
      source: "worker",
      workerId,
    });
    return { success: false, error: `Worker "${workerId}" missing sessionId for agent backend` };
  }

  workerPool.updateStatus(workerId, "busy");
  instance.currentTask = message.slice(0, 140);

  try {
    const startedAt = Date.now();
    const responseText = await sendWorkerPrompt({
      client,
      sessionId,
      directory: instance.directory ?? options?.directory ?? process.cwd(),
      workerId,
      message,
      attachments: options?.attachments,
      timeoutMs: options?.timeout ?? 600_000,
      jobId: options?.jobId,
      from: options?.from,
      allowStreaming: false,
      agent: workerId,
      debugLabel: "[agent-backend]",
    });

    workerPool.updateStatus(workerId, "ready");
    instance.lastActivity = new Date();
    instance.currentTask = undefined;
    instance.warning = undefined;
    instance.sessionId = sessionId;

    const durationMs = Date.now() - startedAt;
    instance.lastResult = {
      at: new Date(),
      jobId: options?.jobId ?? instance.lastResult?.jobId,
      response: responseText,
      report: instance.lastResult?.report,
      durationMs,
    };

    return { success: true, response: responseText };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isSdkError = Boolean((error as any)?.isSdkError);
    workerPool.updateStatus(workerId, "ready");
    instance.currentTask = undefined;
    instance.warning = isSdkError
      ? `Last request failed: ${errorMsg}`
      : instance.warning ?? `Last request failed: ${errorMsg}`;
    publishErrorEvent({ message: errorMsg, source: "worker", workerId });
    return { success: false, error: errorMsg };
  }
}

export async function stopAgentWorker(workerId: string): Promise<boolean> {
  const instance = workerPool.get(workerId);
  if (!instance) return false;
  try {
    instance.status = "stopped";
    workerPool.updateStatus(workerId, "stopped");
    workerPool.unregister(workerId);
    return true;
  } catch {
    return false;
  }
}
