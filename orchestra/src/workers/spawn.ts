/* c8 ignore file */
import type { ApiService } from "../api";
import type { CommunicationService } from "../communication";
import { loadOpenCodeConfig, mergeOpenCodeConfig } from "../config/opencode";
import { getIntegrationEnv } from "../integrations/registry";
import { resolveIntegrationsForProfile } from "../integrations/selection";
import type { ProfileModelHydrationChange } from "../models/hydrate";
import { buildToolConfigFromPermissions, summarizePermissions } from "../permissions/validator";
import type { OrchestratorConfig, WorkerInstance, WorkerProfile } from "../types";
import { getRepoContextForWorker } from "../ux/repo-context";
import { startEventForwarding, stopEventForwarding } from "./event-forwarding";
import type { WorkerRegistry } from "./registry";
import type { WorkerSessionManager } from "./session-manager";
import { buildBootstrapPromptArgs } from "./spawn-bootstrap";
import {
  buildPermissionConfig,
  getDefaultSessionMode,
  resolveWorkerEnv,
  resolveWorkerMcp,
  resolveWorkerSkillPermissions,
} from "./spawn-env";
import { extractSdkData, extractSdkErrorMessage, isValidPort, withTimeout } from "./spawn-helpers";
import { resolveProfileModel } from "./spawn-model";
import { normalizePluginPath, resolveWorkerBridgePluginPath } from "./spawn-plugin";
import {
  applyServerBundleToInstance,
  createSubagentSession,
  createWorkerSession,
  startWorkerServer,
} from "./spawn-server";

export type { ModelResolutionResult } from "./spawn-model";

export type SpawnWorkerCallbacks = {
  onModelResolved?: (change: ProfileModelHydrationChange) => void;
  onModelFallback?: (profileId: string, model: string, reason: string) => void;
};

export type SpawnWorkerDeps = {
  resolveProfileModel?: typeof resolveProfileModel;
  loadOpenCodeConfig?: typeof loadOpenCodeConfig;
  mergeOpenCodeConfig?: typeof mergeOpenCodeConfig;
  resolveIntegrationsForProfile?: typeof resolveIntegrationsForProfile;
  getIntegrationEnv?: typeof getIntegrationEnv;
  resolveWorkerEnv?: typeof resolveWorkerEnv;
  resolveWorkerMcp?: typeof resolveWorkerMcp;
  resolveWorkerSkillPermissions?: typeof resolveWorkerSkillPermissions;
  buildPermissionConfig?: typeof buildPermissionConfig;
  getDefaultSessionMode?: typeof getDefaultSessionMode;
  getRepoContextForWorker?: typeof getRepoContextForWorker;
  startEventForwarding?: typeof startEventForwarding;
  stopEventForwarding?: typeof stopEventForwarding;
  buildBootstrapPromptArgs?: typeof buildBootstrapPromptArgs;
  extractSdkData?: typeof extractSdkData;
  extractSdkErrorMessage?: typeof extractSdkErrorMessage;
  withTimeout?: typeof withTimeout;
  resolveWorkerBridgePluginPath?: typeof resolveWorkerBridgePluginPath;
  normalizePluginPath?: typeof normalizePluginPath;
  startWorkerServer?: typeof startWorkerServer;
  createWorkerSession?: typeof createWorkerSession;
  createSubagentSession?: typeof createSubagentSession;
  applyServerBundleToInstance?: typeof applyServerBundleToInstance;
};

/** Spawn a new worker instance and bootstrap its session. */
export async function spawnWorker(input: {
  api: ApiService;
  registry: WorkerRegistry;
  directory: string;
  profile: WorkerProfile;
  integrations?: OrchestratorConfig["integrations"];
  modelSelection?: OrchestratorConfig["modelSelection"];
  modelAliases?: OrchestratorConfig["modelAliases"];
  timeoutMs: number;
  deps?: SpawnWorkerDeps;
  callbacks?: SpawnWorkerCallbacks;
  /** Session manager for tracking and event forwarding */
  sessionManager?: WorkerSessionManager;
  /** Communication service for event forwarding */
  communication?: CommunicationService;
  /** Parent session ID (for child mode) */
  parentSessionId?: string;
}): Promise<WorkerInstance> {
  const deps = input.deps ?? {};
  const resolveProfileModelFn = deps.resolveProfileModel ?? resolveProfileModel;
  const loadOpenCodeConfigFn = deps.loadOpenCodeConfig ?? loadOpenCodeConfig;
  const mergeOpenCodeConfigFn = deps.mergeOpenCodeConfig ?? mergeOpenCodeConfig;
  const resolveIntegrationsForProfileFn = deps.resolveIntegrationsForProfile ?? resolveIntegrationsForProfile;
  const getIntegrationEnvFn = deps.getIntegrationEnv ?? getIntegrationEnv;
  const resolveWorkerEnvFn = deps.resolveWorkerEnv ?? resolveWorkerEnv;
  const resolveWorkerMcpFn = deps.resolveWorkerMcp ?? resolveWorkerMcp;
  const resolveWorkerSkillPermissionsFn = deps.resolveWorkerSkillPermissions ?? resolveWorkerSkillPermissions;
  const buildPermissionConfigFn = deps.buildPermissionConfig ?? buildPermissionConfig;
  const getDefaultSessionModeFn = deps.getDefaultSessionMode ?? getDefaultSessionMode;
  const getRepoContextForWorkerFn = deps.getRepoContextForWorker ?? getRepoContextForWorker;
  const startEventForwardingFn = deps.startEventForwarding ?? startEventForwarding;
  const stopEventForwardingFn = deps.stopEventForwarding ?? stopEventForwarding;
  const buildBootstrapPromptArgsFn = deps.buildBootstrapPromptArgs ?? buildBootstrapPromptArgs;
  const extractSdkDataFn = deps.extractSdkData ?? extractSdkData;
  const extractSdkErrorMessageFn = deps.extractSdkErrorMessage ?? extractSdkErrorMessage;
  const withTimeoutFn = deps.withTimeout ?? withTimeout;
  const resolveWorkerBridgePluginPathFn = deps.resolveWorkerBridgePluginPath ?? resolveWorkerBridgePluginPath;
  const normalizePluginPathFn = deps.normalizePluginPath ?? normalizePluginPath;
  const startWorkerServerFn = deps.startWorkerServer ?? startWorkerServer;
  const createWorkerSessionFn = deps.createWorkerSession ?? createWorkerSession;
  const createSubagentSessionFn = deps.createSubagentSession ?? createSubagentSession;
  const applyServerBundleToInstanceFn = deps.applyServerBundleToInstance ?? applyServerBundleToInstance;

  const {
    profile: resolvedProfile,
    changes,
    fallbackModel,
  } = await resolveProfileModelFn({
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
  const sessionMode = resolvedProfile.sessionMode ?? getDefaultSessionModeFn(resolvedProfile);

  const selectedIntegrations = resolveIntegrationsForProfileFn(resolvedProfile, input.integrations);
  const integrationEnv = getIntegrationEnvFn(selectedIntegrations);

  // Resolve env vars for this worker
  const workerEnv = resolveWorkerEnvFn(resolvedProfile, integrationEnv);

  // Load parent config for MCP resolution
  const parentConfig = await loadOpenCodeConfigFn();
  const workerMcp = await resolveWorkerMcpFn(resolvedProfile, parentConfig);
  const baseConfig = { ...parentConfig };
  delete (baseConfig as Record<string, unknown>).integrations;

  // Resolve skill permissions for worker isolation
  // This prevents workers from accessing each other's skills unless explicitly allowed
  const skillPermissions = resolveWorkerSkillPermissionsFn(resolvedProfile);
  const permissionConfig = buildPermissionConfigFn(
    resolvedProfile.permissions as Record<string, unknown> | undefined,
    skillPermissions,
  );

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
    const workerBridgePluginPath = normalizePluginPathFn(resolveWorkerBridgePluginPathFn());
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

    const mergedConfig = await mergeOpenCodeConfigFn(
      {
        model: resolvedProfile.model,
        plugin: [],
        ...(Object.keys(selectedIntegrations).length > 0 && { integrations: selectedIntegrations }),
        ...(agentOverride ?? {}),
        ...(toolConfig && { tools: toolConfig }),
        ...(permissionConfig && { permission: permissionConfig }),
        ...(workerMcp && { mcp: workerMcp }),
      },
      {
        dropOrchestratorPlugin: true,
        appendPlugins: useWorkerBridge ? [workerBridgePluginPath as string] : undefined,
        baseConfig,
      },
    );

    // Inject worker env vars into process.env before starting server
    for (const [key, value] of Object.entries(workerEnv)) {
      previousEnvValues[key] = process.env[key];
      process.env[key] = value;
    }

    const extractSession = (result: unknown) => extractSdkDataFn(result) as { id?: string } | undefined;

    let serverBundle = await startWorkerServerFn({
      api: input.api,
      hostname,
      port: requestedPort,
      timeoutMs: input.timeoutMs,
      config: mergedConfig,
      pluginPath: useWorkerBridge ? (workerBridgePluginPath as string) : undefined,
    });
    let { client, server } = applyServerBundleToInstanceFn(instance, serverBundle);

    let sessionResult = await createWorkerSessionFn({
      client,
      directory: input.directory,
      timeoutMs: input.timeoutMs,
      title: `Worker: ${resolvedProfile.name}`,
    });
    let session = extractSession(sessionResult);
    if (!session?.id) {
      const errMsg = extractSdkErrorMessageFn(sessionResult) ?? "Failed to create session";
      const needsBridge = /stream_chunk|worker bridge|bridge tools/i.test(errMsg);
      if (needsBridge && workerBridgePluginPath && !useWorkerBridge) {
        await Promise.resolve(server.close());
        const mergedWithBridge = await mergeOpenCodeConfigFn(
          {
            model: resolvedProfile.model,
            plugin: [],
            ...(Object.keys(selectedIntegrations).length > 0 && { integrations: selectedIntegrations }),
            ...(agentOverride ?? {}),
            ...(toolConfig && { tools: toolConfig }),
            ...(permissionConfig && { permission: permissionConfig }),
            ...(workerMcp && { mcp: workerMcp }),
          },
          {
            dropOrchestratorPlugin: true,
            appendPlugins: [workerBridgePluginPath],
            baseConfig,
          },
        );
        serverBundle = await startWorkerServerFn({
          api: input.api,
          hostname,
          port: requestedPort,
          timeoutMs: input.timeoutMs,
          config: mergedWithBridge,
          pluginPath: workerBridgePluginPath,
        });
        ({ client, server } = applyServerBundleToInstanceFn(instance, serverBundle));
        sessionResult = await createWorkerSessionFn({
          client,
          directory: input.directory,
          timeoutMs: input.timeoutMs,
          title: `Worker: ${resolvedProfile.name}`,
        });
        session = extractSession(sessionResult);
      }
    }

    if (!session?.id) {
      const errMsg = extractSdkErrorMessageFn(sessionResult) ?? "Failed to create session";
      throw new Error(errMsg);
    }

    instance.sessionId = session.id;

    const repoContext = resolvedProfile.injectRepoContext
      ? await getRepoContextForWorkerFn(input.directory).catch(() => undefined)
      : undefined;

    if (input.parentSessionId) {
      const subagentResult = await createSubagentSessionFn({
        api: input.api,
        timeoutMs: input.timeoutMs,
        title: `Worker: ${resolvedProfile.name}`,
        parentSessionId: input.parentSessionId,
      });
      const subagent = extractSession(subagentResult);
      if (subagent?.id) {
        instance.uiSessionId = subagent.id;
      }
    }

    const bootstrapAbort = new AbortController();
    const bootstrapTimeoutMs = Math.min(input.timeoutMs, 15_000);
    const bootstrapArgs = buildBootstrapPromptArgsFn({
      sessionId: session.id,
      directory: input.directory,
      profile: resolvedProfile,
      permissionSummary,
      repoContext,
    });
    bootstrapArgs.signal = bootstrapAbort.signal;

    void withTimeoutFn(client.session.prompt(bootstrapArgs), bootstrapTimeoutMs, bootstrapAbort).catch(() => {});

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
      instance.eventForwardingHandle = startEventForwardingFn(instance, input.sessionManager, input.communication, {
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
    stopEventForwardingFn(instance);

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
