import type { WorkerInstance, WorkerProfile } from "../../types";
import { workerPool, type SpawnOptions } from "../../core/worker-pool";
import { publishErrorEvent } from "../../core/orchestrator-events";
import { sendWorkerPrompt, type SendToWorkerOptions } from "../send";
import { buildWorkerBootstrapPrompt } from "../prompt/worker-prompt";
import { isFullModelID } from "../../models/catalog";
import { hydrateProfileModelsFromOpencode } from "../../models/hydrate";

function getBackendClient(instance: WorkerInstance, fallback?: any) {
  return instance.client ?? fallback;
}

export async function spawnAgentWorker(
  profile: WorkerProfile,
  options: SpawnOptions,
): Promise<WorkerInstance> {
  return workerPool.getOrSpawn(
    profile,
    options,
    async (resolvedProfile, spawnOptions) => {
      const resolvedKind = resolvedProfile.kind ?? "agent";
      const modelRef = resolvedProfile.model.trim();
      const instance: WorkerInstance = {
        profile: resolvedProfile,
        kind: resolvedKind,
        execution: resolvedProfile.execution,
        status: "starting",
        port: 0,
        directory: spawnOptions.directory,
        startedAt: new Date(),
        modelRef,
        modelPolicy: "dynamic",
        modelResolution: isFullModelID(modelRef)
          ? "configured"
          : `resolved from ${modelRef}`,
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

      const isSubagent = resolvedKind === "subagent";
      const parentSessionId = spawnOptions.parentSessionId;
      if (isSubagent && !parentSessionId) {
        const msg = `Subagent worker "${resolvedProfile.id}" requires parentSessionId to fork a child session.`;
        instance.status = "error";
        instance.error = msg;
        workerPool.updateStatus(resolvedProfile.id, "error", msg);
        throw new Error(msg);
      }

      const sessionResult = isSubagent
        ? await spawnOptions.client.session.fork({
            path: { id: parentSessionId as string },
            query: { directory: spawnOptions.directory },
          })
        : await spawnOptions.client.session.create({
            body: { title: `Worker: ${resolvedProfile.name}` },
            query: { directory: spawnOptions.directory },
          });

      const session = sessionResult.data;
      if (!session) {
        const err = sessionResult.error as any;
        const msg =
          err?.message ?? err?.toString?.() ?? "Failed to create session";
        instance.status = "error";
        instance.error = msg;
        workerPool.updateStatus(resolvedProfile.id, "error", msg);
        throw new Error(msg);
      }

      instance.sessionId = session.id;
      if (isSubagent && parentSessionId) {
        instance.parentSessionId = parentSessionId;
      }

      // Inject bootstrap prompt (worker identity & instructions)
      const bootstrapPrompt = await buildWorkerBootstrapPrompt({
        profile: resolvedProfile,
        directory: spawnOptions.directory,
      });

      await spawnOptions.client.session
        .prompt({
          path: { id: session.id },
          body: {
            noReply: true,
            parts: [{ type: "text", text: bootstrapPrompt }],
          },
          query: { directory: spawnOptions.directory },
        } as any)
        .catch(() => {});

      instance.status = "ready";
      instance.lastActivity = new Date();
      workerPool.updateStatus(resolvedProfile.id, "ready");

      return instance;
    },
  );
}

export async function sendToAgentWorker(
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

  if (instance.status !== "ready") {
    publishErrorEvent({
      message: `Worker "${workerId}" is ${instance.status}, not ready`,
      source: "worker",
      workerId,
    });
    return {
      success: false,
      error: `Worker "${workerId}" is ${instance.status}, not ready`,
    };
  }

  const client = getBackendClient(instance, options?.client);
  if (!client) {
    publishErrorEvent({
      message: `Worker "${workerId}" missing OpenCode client`,
      source: "worker",
      workerId,
    });
    return {
      success: false,
      error: `Worker "${workerId}" missing OpenCode client`,
    };
  }

  // Always use the worker's own session, not the caller's session
  // The caller's sessionId (options.sessionId) is for ownership tracking, not routing
  const sessionId = instance.sessionId;
  if (!sessionId) {
    publishErrorEvent({
      message: `Worker "${workerId}" missing sessionId for agent backend`,
      source: "worker",
      workerId,
    });
    return {
      success: false,
      error: `Worker "${workerId}" missing sessionId for agent backend`,
    };
  }

  workerPool.updateStatus(workerId, "busy");
  instance.currentTask = message.slice(0, 140);

  try {
    const startedAt = Date.now();
    const warning = instance.warning;
    const directory = instance.directory ?? options?.directory ?? process.cwd();
    const overrideRequested =
      typeof options?.model === "string" && options.model.trim().length > 0;
    let modelOverride = (options?.model ?? instance.profile.model).trim();
    let resolutionReason = instance.modelResolution;
    if (modelOverride && !isFullModelID(modelOverride)) {
      const profileOverride = { ...instance.profile, model: modelOverride };
      const { profiles, changes } = await hydrateProfileModelsFromOpencode({
        client,
        directory,
        profiles: { [instance.profile.id]: profileOverride },
      });
      modelOverride = profiles[instance.profile.id]?.model ?? modelOverride;
      const change = changes.find((c) => c.profileId === instance.profile.id);
      resolutionReason =
        change?.reason ?? `resolved from ${profileOverride.model}`;
    } else if (modelOverride && !overrideRequested) {
      resolutionReason = "configured";
    }
    if (!overrideRequested && resolutionReason) {
      instance.modelResolution = resolutionReason;
    }
    const responseText = await sendWorkerPrompt({
      client,
      sessionId,
      directory,
      workerId,
      message,
      model: modelOverride,
      attachments: options?.attachments,
      timeoutMs: options?.timeout ?? 600_000,
      jobId: options?.jobId,
      from: options?.from,
      allowStreaming: false,
      debugLabel: "[agent-backend]",
    });

    workerPool.updateStatus(workerId, "ready");
    instance.lastActivity = new Date();
    instance.currentTask = undefined;
    instance.warning = undefined;

    const durationMs = Date.now() - startedAt;
    instance.lastResult = {
      at: new Date(),
      jobId: options?.jobId ?? instance.lastResult?.jobId,
      response: responseText,
      report: instance.lastResult?.report,
      durationMs,
    };

    return {
      success: true,
      response: responseText,
      ...(warning ? { warning } : {}),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isSdkError = Boolean((error as any)?.isSdkError);
    workerPool.updateStatus(workerId, "ready");
    instance.currentTask = undefined;
    instance.warning = isSdkError
      ? `Last request failed: ${errorMsg}`
      : (instance.warning ?? `Last request failed: ${errorMsg}`);
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
