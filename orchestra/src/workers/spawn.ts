/* c8 ignore file */
import type { ApiService } from "../api";
import type { CommunicationService } from "../communication";
import { loadOpenCodeConfig, mergeOpenCodeConfig } from "../config/opencode";
import type { ProfileModelHydrationChange } from "../models/hydrate";
import { buildToolConfigFromPermissions, summarizePermissions } from "../permissions/validator";
import type { OrchestratorConfig, WorkerInstance, WorkerProfile } from "../types";
import { getRepoContextForWorker } from "../ux/repo-context";
import { startEventForwarding, stopEventForwarding } from "./event-forwarding";
import type { WorkerRegistry } from "./registry";
import type { WorkerSessionManager } from "./session-manager";
import { buildBootstrapPromptArgs } from "./spawn-bootstrap";
import { getDefaultSessionMode, resolveWorkerEnv, resolveWorkerMcp } from "./spawn-env";
import { extractSdkData, extractSdkErrorMessage, isValidPort, withTimeout } from "./spawn-helpers";
import { resolveProfileModel } from "./spawn-model";
import { normalizePluginPath, resolveWorkerBridgePluginPath } from "./spawn-plugin";
import { applyServerBundleToInstance, createWorkerSession, startWorkerServer } from "./spawn-server";

export type { ModelResolutionResult } from "./spawn-model";

export type SpawnWorkerCallbacks = {
  onModelResolved?: (change: ProfileModelHydrationChange) => void;
  onModelFallback?: (profileId: string, model: string, reason: string) => void;
};

/** Spawn a new worker instance and bootstrap its session. */
export async function spawnWorker(input: {
  api: ApiService;
  registry: WorkerRegistry;
  directory: string;
  profile: WorkerProfile;
  modelSelection?: OrchestratorConfig["modelSelection"];
  modelAliases?: OrchestratorConfig["modelAliases"];
  timeoutMs: number;
  callbacks?: SpawnWorkerCallbacks;
  /** Session manager for tracking and event forwarding */
  sessionManager?: WorkerSessionManager;
  /** Communication service for event forwarding */
  communication?: CommunicationService;
  /** Parent session ID (for child mode) */
  parentSessionId?: string;
}): Promise<WorkerInstance> {
  const {
    profile: resolvedProfile,
    changes,
    fallbackModel,
  } = await resolveProfileModel({
    api: input.api,
    directory: input.directory,
    profile: input.profile,
    modelSelection: input.modelSelection,
    modelAliases: input.modelAliases,
  });

  // Notify about model changes
  for (const change of changes) {
    input.callbacks?.onModelResolved?.(change);
  }
  if (fallbackModel && resolvedProfile.model === fallbackModel) {
    input.callbacks?.onModelFallback?.(resolvedProfile.id, fallbackModel, `fallback from ${input.profile.model}`);
  }

  const hostname = "127.0.0.1";
  const fixedPort = isValidPort(resolvedProfile.port) ? resolvedProfile.port : undefined;
  const requestedPort = fixedPort ?? 0;

  const modelResolution =
    input.profile.model.trim().startsWith("auto") || input.profile.model.trim().startsWith("node")
      ? `resolved from ${input.profile.model.trim()}`
      : resolvedProfile.model === input.profile.model
        ? "configured"
        : `resolved from ${input.profile.model.trim()}`;

  const toolConfig = buildToolConfigFromPermissions({
    permissions: resolvedProfile.permissions,
    baseTools: resolvedProfile.tools,
  });
  const permissionSummary = summarizePermissions(resolvedProfile.permissions);

  // Determine session mode
  const sessionMode = resolvedProfile.sessionMode ?? getDefaultSessionMode(resolvedProfile);

  // Resolve env vars for this worker
  const workerEnv = resolveWorkerEnv(resolvedProfile);

  // Load parent config for MCP resolution
  const parentConfig = await loadOpenCodeConfig();
  const workerMcp = await resolveWorkerMcp(resolvedProfile, parentConfig);

  const instance: WorkerInstance = {
    profile: resolvedProfile,
    status: "starting",
    port: requestedPort,
    directory: input.directory,
    startedAt: new Date(),
    modelResolution,
    sessionMode,
    parentSessionId: input.parentSessionId,
    messageCount: 0,
    toolCount: 0,
  };

  input.registry.register(instance);

  // Set up worker env vars restoration function (defined outside try for catch access)
  const previousEnvValues: Record<string, string | undefined> = {};
  const restoreWorkerEnv = () => {
    for (const [key, previousValue] of Object.entries(previousEnvValues)) {
      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  };

  try {
    const workerBridgePluginPath = normalizePluginPath(resolveWorkerBridgePluginPath());
    const preferWorkerBridge =
      process.env.OPENCODE_WORKER_BRIDGE === "1" || Boolean(process.env.OPENCODE_WORKER_PLUGIN_PATH);
    const useWorkerBridge = Boolean(workerBridgePluginPath) && preferWorkerBridge;

    const agentOverride =
      resolvedProfile.temperature !== undefined
        ? {
            agent: {
              general: {
                model: resolvedProfile.model,
                temperature: resolvedProfile.temperature,
              },
            },
          }
        : undefined;

    const mergedConfig = await mergeOpenCodeConfig(
      {
        model: resolvedProfile.model,
        plugin: [],
        ...(agentOverride ?? {}),
        ...(toolConfig && { tools: toolConfig }),
        ...(resolvedProfile.permissions && { permissions: resolvedProfile.permissions }),
        ...(workerMcp && { mcp: workerMcp }),
      },
      {
        dropOrchestratorPlugin: true,
        appendPlugins: useWorkerBridge ? [workerBridgePluginPath as string] : undefined,
      },
    );

    // Inject worker env vars into process.env before starting server
    for (const [key, value] of Object.entries(workerEnv)) {
      previousEnvValues[key] = process.env[key];
      process.env[key] = value;
    }

    const extractSession = (result: unknown) => extractSdkData(result) as { id?: string } | undefined;

    let serverBundle = await startWorkerServer({
      api: input.api,
      hostname,
      port: requestedPort,
      timeoutMs: input.timeoutMs,
      config: mergedConfig,
      pluginPath: useWorkerBridge ? (workerBridgePluginPath as string) : undefined,
    });
    let { client, server } = applyServerBundleToInstance(instance, serverBundle);

    let sessionResult = await createWorkerSession({
      client,
      directory: input.directory,
      timeoutMs: input.timeoutMs,
      title: `Worker: ${resolvedProfile.name}`,
    });
    let session = extractSession(sessionResult);
    if (!session?.id) {
      const errMsg = extractSdkErrorMessage(sessionResult) ?? "Failed to create session";
      const needsBridge = /stream_chunk|worker bridge|bridge tools/i.test(errMsg);
      if (needsBridge && workerBridgePluginPath && !useWorkerBridge) {
        await Promise.resolve(server.close());
        const mergedWithBridge = await mergeOpenCodeConfig(
          {
            model: resolvedProfile.model,
            plugin: [],
            ...(agentOverride ?? {}),
            ...(toolConfig && { tools: toolConfig }),
            ...(resolvedProfile.permissions && { permissions: resolvedProfile.permissions }),
          },
          {
            dropOrchestratorPlugin: true,
            appendPlugins: [workerBridgePluginPath],
          },
        );
        serverBundle = await startWorkerServer({
          api: input.api,
          hostname,
          port: requestedPort,
          timeoutMs: input.timeoutMs,
          config: mergedWithBridge,
          pluginPath: workerBridgePluginPath,
        });
        ({ client, server } = applyServerBundleToInstance(instance, serverBundle));
        sessionResult = await createWorkerSession({
          client,
          directory: input.directory,
          timeoutMs: input.timeoutMs,
          title: `Worker: ${resolvedProfile.name}`,
        });
        session = extractSession(sessionResult);
      }
    }

    if (!session?.id) {
      const errMsg = extractSdkErrorMessage(sessionResult) ?? "Failed to create session";
      throw new Error(errMsg);
    }

    instance.sessionId = session.id;

    const repoContext = resolvedProfile.injectRepoContext
      ? await getRepoContextForWorker(input.directory).catch(() => undefined)
      : undefined;

    const bootstrapAbort = new AbortController();
    const bootstrapTimeoutMs = Math.min(input.timeoutMs, 15_000);
    const bootstrapArgs = buildBootstrapPromptArgs({
      sessionId: session.id,
      directory: input.directory,
      profile: resolvedProfile,
      permissionSummary,
      repoContext,
    });
    bootstrapArgs.signal = bootstrapAbort.signal;

    void withTimeout(client.session.prompt(bootstrapArgs), bootstrapTimeoutMs, bootstrapAbort).catch(() => {});

    instance.status = "ready";
    instance.lastActivity = new Date();
    input.registry.updateStatus(resolvedProfile.id, "ready");

    // Restore worker env vars
    restoreWorkerEnv();

    // Register session with session manager
    if (input.sessionManager && instance.sessionId) {
      input.sessionManager.registerSession({
        workerId: resolvedProfile.id,
        sessionId: instance.sessionId,
        mode: sessionMode,
        parentSessionId: input.parentSessionId,
        serverUrl: instance.serverUrl,
      });
    }

    // Start event forwarding for linked mode
    if (sessionMode === "linked" && input.sessionManager && input.communication) {
      const forwardEvents = resolvedProfile.forwardEvents ?? ["tool", "message", "error", "complete", "progress"];
      instance.eventForwardingHandle = startEventForwarding(instance, input.sessionManager, input.communication, {
        events: forwardEvents,
      });
    }

    return instance;
  } catch (error) {
    // Restore worker env vars on error
    restoreWorkerEnv();

    const errorMsg = error instanceof Error ? error.message : String(error);
    instance.status = "error";
    instance.error = errorMsg;
    input.registry.updateStatus(resolvedProfile.id, "error", errorMsg);

    // Close session in session manager
    if (input.sessionManager && instance.sessionId) {
      input.sessionManager.closeSession(instance.sessionId);
    }

    // Stop event forwarding if started
    stopEventForwarding(instance);

    try {
      await instance.shutdown?.();
    } catch {
      // ignore
    }

    // Unregister failed instance from registry to prevent zombie entries
    input.registry.unregister(resolvedProfile.id);

    throw error;
  }
}

/**
 * Clean up a worker instance, stopping event forwarding and closing sessions.
 */
/** Tear down a worker instance and related tracking resources. */
export function cleanupWorkerInstance(instance: WorkerInstance, sessionManager?: WorkerSessionManager): void {
  stopEventForwarding(instance);
  if (sessionManager && instance.sessionId) {
    sessionManager.closeSession(instance.sessionId);
  }
}
