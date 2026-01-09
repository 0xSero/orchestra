/**
 * Server backend - spawned OpenCode worker processes.
 */

import { createOpencodeClient } from "@opencode-ai/sdk";
import { createServer } from "node:net";
import type { WorkerProfile, WorkerInstance } from "../../types";
import {
  workerPool,
  listDeviceRegistry,
  removeWorkerEntriesByPid,
  type DeviceRegistryWorkerEntry,
  type SpawnOptions,
} from "../../core/worker-pool";
import { publishErrorEvent } from "../../core/orchestrator-events";
import { logger } from "../../core/logger";
import { hydrateProfileModelsFromOpencode } from "../../models/hydrate";
import {
  ensureRuntime,
  registerWorkerInDeviceRegistry,
} from "../../core/runtime";
import { sendWorkerPrompt, type SendToWorkerOptions } from "../send";
import { buildWorkerBootstrapPrompt } from "../prompt/worker-prompt";
import {
  spawnOpencodeServe,
  spawnOpencodeServeDocker,
  resolveBundledWorkerBridgePluginSpecifier,
  resolveWorkerBridgePluginSpecifier,
} from "../spawn/spawn-opencode";
import { checkWorkerBridgeTools, isProcessAlive } from "../spawn/readiness";
import { sessionPool, releaseSession } from "../../core/session-pool";

type SpawnOptionsWithForce = SpawnOptions & { forceNew?: boolean };

function isValidPort(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 65535
  );
}

async function isPortAvailable(port: number): Promise<boolean> {
  if (!Number.isFinite(port) || port <= 0 || port > 65535) return false;
  return await new Promise<boolean>((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

async function findAvailablePort(basePort: number): Promise<number> {
  const start =
    Number.isFinite(basePort) && basePort > 0 ? Math.floor(basePort) : 14096;
  for (let port = start; port < start + 2000; port += 1) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found starting at ${start}.`);
}

function resolveDockerBridgeUrl(
  url: string,
  options: { bridgeHost?: string; network?: string },
): string {
  try {
    const u = new URL(url);
    if (options.network === "host") return u.toString();
    const host =
      options.bridgeHost ??
      (process.platform === "linux" ? "172.17.0.1" : "host.docker.internal");
    if (!host) return u.toString();
    u.hostname = host;
    return u.toString();
  } catch {
    return url;
  }
}

export async function spawnServerWorker(
  profile: WorkerProfile,
  options: SpawnOptionsWithForce,
): Promise<WorkerInstance> {
  return workerPool.getOrSpawn(profile, options, _spawnWorkerCore);
}

async function _spawnWorkerCore(
  profile: WorkerProfile,
  options: SpawnOptionsWithForce,
): Promise<WorkerInstance> {
  const modelRef = profile.model.trim();
  let modelResolutionReason: string | undefined;
  const resolvedProfile = await (async (): Promise<WorkerProfile> => {
    const modelSpec = modelRef;
    const isNodeTag =
      modelSpec.startsWith("auto") || modelSpec.startsWith("node");

    if (!options.client) {
      if (isNodeTag) {
        throw new Error(
          `Profile "${profile.id}" uses "${profile.model}", but model resolution is unavailable. ` +
            `Set a concrete provider/model ID for this profile.`,
        );
      }
      if (!modelSpec.includes("/")) {
        throw new Error(
          `Invalid model "${profile.model}". OpenCode models must be in "provider/model" format. ` +
            `Run task_list({ view: "models" }) to see configured models and copy the full ID.`,
        );
      }
      return profile;
    }

    const { profiles, changes } = await hydrateProfileModelsFromOpencode({
      client: options.client,
      directory: options.directory,
      profiles: { [profile.id]: profile },
    });
    const change = changes.find((c) => c.profileId === profile.id);
    modelResolutionReason = change?.reason;
    return profiles[profile.id] ?? profile;
  })();

  const hostname = "127.0.0.1";
  const dockerConfig = resolvedProfile.docker;
  const activeDockerConfig =
    dockerConfig && dockerConfig.enabled !== false ? dockerConfig : undefined;
  const dockerEnabled = activeDockerConfig !== undefined;
  const fixedPort = isValidPort(resolvedProfile.port)
    ? resolvedProfile.port
    : undefined;
  const requestedPort = dockerEnabled
    ? fixedPort && fixedPort > 0
      ? fixedPort
      : await findAvailablePort(options.basePort)
    : (fixedPort ?? 0);

  const modelResolution =
    modelResolutionReason ??
    (resolvedProfile.model === modelRef
      ? "configured"
      : `resolved from ${modelRef}`);

  const instance: WorkerInstance = {
    profile: resolvedProfile,
    kind:
      resolvedProfile.kind ??
      (resolvedProfile.backend === "server" ? "server" : "agent"),
    execution: resolvedProfile.execution,
    status: "starting",
    port: requestedPort,
    directory: options.directory,
    spawnDirectory: options.directory,
    startedAt: new Date(),
    modelRef,
    modelPolicy: "dynamic",
    modelResolution,
  };

  workerPool.register(instance);

  try {
    const rt = await ensureRuntime();
    const pluginSpecifier = dockerEnabled
      ? resolveBundledWorkerBridgePluginSpecifier()
      : resolveWorkerBridgePluginSpecifier();
    if (process.env.OPENCODE_ORCH_SPAWNER_DEBUG === "1") {
      logger.debug(
        `[spawner] pluginSpecifier=${pluginSpecifier}, profile=${resolvedProfile.id}, model=${resolvedProfile.model}`,
      );
    }

    const spawnInput = {
      hostname,
      port: requestedPort,
      timeout: options.timeout,
      config: {
        model: resolvedProfile.model,
        plugin: pluginSpecifier ? [pluginSpecifier] : [],
        ...(resolvedProfile.tools && { tools: resolvedProfile.tools }),
      },
      env: {
        OPENCODE_ORCH_BRIDGE_URL: dockerEnabled
          ? resolveDockerBridgeUrl(rt.bridge.url, {
              bridgeHost: activeDockerConfig?.bridgeHost,
              network: activeDockerConfig?.network,
            })
          : rt.bridge.url,
        OPENCODE_ORCH_BRIDGE_TOKEN: rt.bridge.token,
        OPENCODE_ORCH_INSTANCE_ID: rt.instanceId,
        OPENCODE_ORCH_WORKER_ID: resolvedProfile.id,
      },
      directory: options.directory,
    };

    let url: string;
    let close: () => Promise<void>;
    let pid: number | undefined;

    if (activeDockerConfig) {
      const spawned = await spawnOpencodeServeDocker({
        port: requestedPort,
        timeout: options.timeout,
        config: spawnInput.config,
        env: spawnInput.env,
        directory: options.directory,
        docker: activeDockerConfig,
      });
      url = spawned.url;
      close = spawned.close;
      pid = spawned.proc.pid ?? undefined;
      instance.directory = spawned.directory;
    } else {
      const spawned = await spawnOpencodeServe(spawnInput);
      url = spawned.url;
      close = spawned.close;
      pid = spawned.proc.pid ?? undefined;
    }

    instance.shutdown = close;
    instance.pid = pid;
    instance.serverUrl = url;

    const client = createOpencodeClient({ baseUrl: url });
    const toolCheck = await checkWorkerBridgeTools(
      client,
      instance.directory,
    ).catch((error) => {
      instance.warning = `Unable to verify worker bridge tools: ${error instanceof Error ? error.message : String(error)}`;
      return undefined;
    });
    if (toolCheck && !toolCheck.ok) {
      throw new Error(
        `Worker bridge tools missing (${toolCheck.missing.join(", ")}). ` +
          `Loaded tools: ${toolCheck.toolIds.join(", ")}. ` +
          `Check worker plugin path (${pluginSpecifier ?? "none"}) and OpenCode config.`,
      );
    }

    instance.client = client;

    if (typeof instance.pid === "number") {
      await registerWorkerInDeviceRegistry({
        workerId: resolvedProfile.id,
        pid: instance.pid,
        url,
        port: instance.port,
        sessionId: instance.sessionId,
        status: "starting",
        startedAt: instance.startedAt.getTime(),
        model: instance.profile.model,
        modelPolicy: instance.modelPolicy ?? "dynamic",
      });
    }

    if (!fixedPort) {
      try {
        const u = new URL(url);
        const actualPort = Number(u.port);
        if (Number.isFinite(actualPort) && actualPort > 0) {
          instance.port = actualPort;
          workerPool.updateStatus(resolvedProfile.id, "starting");
        }
      } catch {
        // ignore
      }
    }

    const sessionResult = await client.session.create({
      body: {
        title: `Worker: ${resolvedProfile.name}`,
      },
      query: { directory: instance.directory },
    });

    const session = sessionResult.data;
    if (!session) {
      const err = sessionResult.error as any;
      throw new Error(
        err?.message ?? err?.toString?.() ?? "Failed to create session",
      );
    }

    instance.sessionId = session.id;

    if (typeof instance.pid === "number") {
      await registerWorkerInDeviceRegistry({
        workerId: resolvedProfile.id,
        pid: instance.pid,
        url,
        port: instance.port,
        sessionId: instance.sessionId,
        status: "starting",
        startedAt: instance.startedAt.getTime(),
        model: instance.profile.model,
        modelPolicy: instance.modelPolicy ?? "dynamic",
      });
    }

    const bootstrapPrompt = await buildWorkerBootstrapPrompt({
      profile: resolvedProfile,
      directory: options.directory,
    });

    await client.session
      .prompt({
        path: { id: session.id },
        body: {
          noReply: true,
          parts: [{ type: "text", text: bootstrapPrompt }],
        },
        query: { directory: instance.directory },
      } as any)
      .catch(() => {});

    instance.status = "ready";
    instance.lastActivity = new Date();
    workerPool.updateStatus(resolvedProfile.id, "ready");
    if (typeof instance.pid === "number") {
      await registerWorkerInDeviceRegistry({
        workerId: resolvedProfile.id,
        pid: instance.pid,
        url,
        port: instance.port,
        sessionId: instance.sessionId,
        status: "ready",
        startedAt: instance.startedAt.getTime(),
        model: instance.profile.model,
        modelPolicy: instance.modelPolicy ?? "dynamic",
      });
    }

    return instance;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[spawner] ERROR spawning ${resolvedProfile.id}: ${errorMsg}`);
    try {
      await instance.shutdown?.();
    } catch {
      // ignore
    }
    instance.status = "error";
    instance.error = errorMsg;
    workerPool.updateStatus(resolvedProfile.id, "error", errorMsg);
    if (typeof instance.pid === "number") {
      await registerWorkerInDeviceRegistry({
        workerId: resolvedProfile.id,
        pid: instance.pid,
        url: instance.serverUrl,
        port: instance.port,
        sessionId: instance.sessionId,
        status: "error",
        startedAt: instance.startedAt.getTime(),
        lastError: errorMsg,
        model: instance.profile.model,
        modelPolicy: instance.modelPolicy ?? "dynamic",
      });
    }
    throw error;
  }
}

export async function connectToServerWorker(
  profile: WorkerProfile,
  port: number,
): Promise<WorkerInstance> {
  const instance: WorkerInstance = {
    profile,
    kind: profile.kind ?? (profile.backend === "server" ? "server" : "agent"),
    execution: profile.execution,
    status: "starting",
    port,
    serverUrl: `http://127.0.0.1:${port}`,
    directory: process.cwd(),
    startedAt: new Date(),
    modelResolution: "connected to existing worker",
  };

  workerPool.register(instance);

  try {
    const client = createOpencodeClient({
      baseUrl: instance.serverUrl,
    });

    const sessionsResult = await client.session.list({
      query: { directory: instance.directory },
    } as any);
    const sessions = sessionsResult.data;

    instance.client = client;
    instance.status = "ready";
    instance.lastActivity = new Date();

    if (sessions && sessions.length > 0) {
      instance.sessionId = sessions[0].id;
    } else {
      const sessionResult = await client.session.create({
        body: { title: `Worker: ${profile.name}` },
        query: { directory: instance.directory },
      });
      const session = sessionResult.data;
      if (!session) {
        throw new Error("Failed to create session");
      }
      instance.sessionId = session.id;
    }

    workerPool.updateStatus(profile.id, "ready");
    return instance;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    instance.status = "error";
    instance.error = errorMsg;
    workerPool.updateStatus(profile.id, "error", errorMsg);
    throw error;
  }
}

export async function stopServerWorker(workerId: string): Promise<boolean> {
  const instance = workerPool.get(workerId);
  if (!instance) {
    return false;
  }

  try {
    // Clean up session pool entries for this worker
    sessionPool.removeWorkerSessions(workerId);

    await instance.shutdown?.();
    instance.status = "stopped";
    workerPool.updateStatus(workerId, "stopped");
    workerPool.unregister(workerId);
    if (typeof instance.pid === "number") {
      await registerWorkerInDeviceRegistry({
        workerId,
        pid: instance.pid,
        url: instance.serverUrl,
        port: instance.port,
        sessionId: instance.sessionId,
        status: "stopped",
        startedAt: instance.startedAt.getTime(),
        model: instance.profile.model,
        modelPolicy: instance.modelPolicy ?? "dynamic",
      });
      await removeWorkerEntriesByPid(instance.pid).catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}

export async function sendToServerWorker(
  workerId: string,
  message: string,
  options?: SendToWorkerOptions,
): Promise<{
  success: boolean;
  response?: string;
  warning?: string;
  error?: string;
}> {
  // Validate message parameter to prevent undefined.slice() errors
  if (typeof message !== "string") {
    const errorMsg = `Invalid message parameter: expected string, got ${typeof message}`;
    publishErrorEvent({
      message: errorMsg,
      source: "worker",
      workerId,
    });
    return { success: false, error: errorMsg };
  }

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

  if (!instance.client || !instance.sessionId) {
    publishErrorEvent({
      message: `Worker "${workerId}" not properly initialized`,
      source: "worker",
      workerId,
    });
    return {
      success: false,
      error: `Worker "${workerId}" not properly initialized`,
    };
  }

  workerPool.updateStatus(workerId, "busy");
  instance.currentTask = message.slice(0, 140);

  try {
    const startedAt = Date.now();
    const warning = instance.warning;

    const responseText = await sendWorkerPrompt({
      client: instance.client,
      sessionId: instance.sessionId,
      directory: instance.directory ?? process.cwd(),
      workerId,
      message,
      model: options?.model,
      attachments: options?.attachments,
      timeoutMs: options?.timeout ?? 600_000,
      jobId: options?.jobId,
      from: options?.from,
      allowStreaming: true,
      debugLabel: "[spawner]",
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
    if (typeof instance.pid === "number") {
      await registerWorkerInDeviceRegistry({
        workerId,
        pid: instance.pid,
        url: instance.serverUrl,
        port: instance.port,
        sessionId: instance.sessionId,
        status: "ready",
        startedAt: instance.startedAt.getTime(),
        model: instance.profile.model,
        modelPolicy: instance.modelPolicy ?? "dynamic",
      });
    }

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

/**
 * Send to a server worker with session pooling support.
 * Creates a new session if the worker is busy, enabling concurrent execution.
 */
export async function sendToServerWorkerConcurrent(
  workerId: string,
  message: string,
  options?: SendToWorkerOptions & { taskId?: string },
): Promise<{
  success: boolean;
  response?: string;
  warning?: string;
  error?: string;
  sessionId?: string;
}> {
  // Validate message parameter
  if (typeof message !== "string") {
    const errorMsg = `Invalid message parameter: expected string, got ${typeof message}`;
    publishErrorEvent({ message: errorMsg, source: "worker", workerId });
    return { success: false, error: errorMsg };
  }

  const instance = workerPool.get(workerId);

  if (!instance) {
    publishErrorEvent({
      message: `Worker "${workerId}" not found`,
      source: "worker",
      workerId,
    });
    return { success: false, error: `Worker "${workerId}" not found` };
  }

  // Allow sending even if worker is "busy" - we'll create a new session
  if (instance.status === "error" || instance.status === "stopped") {
    publishErrorEvent({
      message: `Worker "${workerId}" is ${instance.status}`,
      source: "worker",
      workerId,
    });
    return {
      success: false,
      error: `Worker "${workerId}" is ${instance.status}`,
    };
  }

  if (!instance.client) {
    publishErrorEvent({
      message: `Worker "${workerId}" not properly initialized`,
      source: "worker",
      workerId,
    });
    return {
      success: false,
      error: `Worker "${workerId}" not properly initialized`,
    };
  }

  // Try to get an available session or create a new one
  let sessionId: string;
  let isNewSession = false;

  const existingSession = sessionPool.getAvailableSession(workerId);
  if (existingSession) {
    sessionId = existingSession.sessionId;
    sessionPool.markBusy(sessionId, options?.taskId, message);
  } else if (sessionPool.canCreateSession(workerId)) {
    // Create new session on the same worker
    try {
      const sessionResult = await instance.client.session.create({
        body: { title: `Task: ${message.slice(0, 50)}` },
        query: { directory: instance.directory },
      });

      const session = sessionResult.data;
      if (!session) {
        const err = sessionResult.error as any;
        return {
          success: false,
          error: err?.message ?? "Failed to create session",
        };
      }

      sessionId = session.id;
      isNewSession = true;
      sessionPool.registerSession({
        sessionId,
        workerId,
        taskId: options?.taskId,
        task: message,
      });

      // Bootstrap new session with worker prompt
      const bootstrapPrompt = await buildWorkerBootstrapPrompt({
        profile: instance.profile,
        directory: instance.directory,
      });

      await instance.client.session
        .prompt({
          path: { id: sessionId },
          body: {
            noReply: true,
            parts: [{ type: "text", text: bootstrapPrompt }],
          },
          query: { directory: instance.directory },
        } as any)
        .catch(() => {});
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Failed to create session: ${errorMsg}` };
    }
  } else {
    // Worker at capacity
    const stats = sessionPool.getStats().sessionsByWorker.get(workerId);
    return {
      success: false,
      error: `Worker "${workerId}" at session capacity (${stats?.busy ?? 0} busy, ${stats?.total ?? 0} total)`,
    };
  }

  // Update instance activity tracking (but don't change status - other sessions may be running)
  instance.lastActivity = new Date();

  try {
    const startedAt = Date.now();

    const responseText = await sendWorkerPrompt({
      client: instance.client,
      sessionId,
      directory: instance.directory ?? process.cwd(),
      workerId,
      message,
      model: options?.model,
      attachments: options?.attachments,
      timeoutMs: options?.timeout ?? 600_000,
      jobId: options?.jobId,
      from: options?.from,
      allowStreaming: true,
      debugLabel: "[concurrent]",
    });

    // Release session back to pool
    releaseSession(sessionId, true);

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
      sessionId,
      ...(isNewSession
        ? { warning: "Created new session for concurrent execution" }
        : {}),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Mark session as error but keep it for potential cleanup
    sessionPool.markError(sessionId, errorMsg);

    publishErrorEvent({ message: errorMsg, source: "worker", workerId });
    return { success: false, error: errorMsg, sessionId };
  }
}

export async function spawnServerWorkers(
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
        const instance = await spawnServerWorker(profile, options);
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
      profiles.map((profile) => spawnServerWorker(profile, options)),
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

export async function listReusableServerWorkers(): Promise<
  DeviceRegistryWorkerEntry[]
> {
  const entries = await listDeviceRegistry();
  const inRegistry = new Set([...workerPool.workers.keys()]);

  return entries.filter(
    (e): e is DeviceRegistryWorkerEntry =>
      e.kind === "worker" &&
      !inRegistry.has(e.workerId) &&
      (e.status === "ready" || e.status === "busy") &&
      isProcessAlive(e.pid),
  );
}

export async function cleanupDeadServerWorkers(): Promise<number> {
  const entries = await listDeviceRegistry();
  let cleaned = 0;

  for (const e of entries) {
    if (e.kind === "worker" && !isProcessAlive(e.pid)) {
      await removeWorkerEntriesByPid(e.pid).catch(() => {});
      cleaned++;
    }
  }

  return cleaned;
}
