import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ApiService } from "../api";
import type { CommunicationService } from "../communication";
import { loadOpenCodeConfig, mergeOpenCodeConfig } from "../config/opencode";
import { hydrateProfileModelsFromOpencode, type ProfileModelHydrationChange } from "../models/hydrate";
import { buildToolConfigFromPermissions, summarizePermissions } from "../permissions/validator";
import type { OrchestratorConfig, WorkerInstance, WorkerProfile, WorkerSessionMode } from "../types";
import { getRepoContextForWorker } from "../ux/repo-context";
import { startEventForwarding, stopEventForwarding } from "./event-forwarding";
import type { WorkerRegistry } from "./registry";
import type { WorkerSessionManager } from "./session-manager";

export type ModelResolutionResult = {
  profile: WorkerProfile;
  changes: ProfileModelHydrationChange[];
  fallbackModel?: string;
};

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, abort?: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      abort?.abort(new Error("worker bootstrap timed out"));
      reject(new Error("worker bootstrap timed out"));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

function isValidPort(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 65535;
}

function resolveWorkerBridgePluginPath(): string | undefined {
  if (process.env.OPENCODE_WORKER_PLUGIN_PATH) return process.env.OPENCODE_WORKER_PLUGIN_PATH;

  try {
    const baseDir = dirname(fileURLToPath(import.meta.url));
    const distCandidate = join(baseDir, "worker-bridge-plugin.mjs");
    if (existsSync(distCandidate)) return distCandidate;
    const parentCandidate = join(baseDir, "..", "worker-bridge-plugin.mjs");
    if (existsSync(parentCandidate)) return parentCandidate;
  } catch {
    // ignore path resolution issues
  }

  const repoCandidate = join(process.cwd(), "scripts", "worker-bridge-plugin.mjs");
  if (existsSync(repoCandidate)) return repoCandidate;

  return undefined;
}

function normalizePluginPath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (!path.startsWith("file://")) return path;
  try {
    return fileURLToPath(path);
  } catch {
    return path;
  }
}

async function resolveProfileModel(input: {
  api: ApiService;
  directory: string;
  profile: WorkerProfile;
  modelSelection?: OrchestratorConfig["modelSelection"];
  modelAliases?: OrchestratorConfig["modelAliases"];
}): Promise<ModelResolutionResult> {
  const modelSpec = input.profile.model.trim();
  const isNodeTag = modelSpec.startsWith("auto") || modelSpec.startsWith("node");
  const isExplicit = modelSpec.includes("/");

  if (!input.api?.client) {
    if (isNodeTag || !isExplicit) {
      throw new Error(
        `Profile "${input.profile.id}" uses "${input.profile.model}", but model resolution is unavailable. ` +
          `Set a concrete provider/model ID for this profile.`,
      );
    }
    return { profile: input.profile, changes: [] };
  }

  if (!isNodeTag && isExplicit) return { profile: input.profile, changes: [] };

  const { profiles, changes, fallbackModel } = await hydrateProfileModelsFromOpencode({
    client: input.api.client,
    directory: input.directory,
    profiles: { [input.profile.id]: input.profile },
    modelAliases: input.modelAliases,
    modelSelection: input.modelSelection,
  });
  return {
    profile: profiles[input.profile.id] ?? input.profile,
    changes,
    fallbackModel,
  };
}

export type SpawnWorkerCallbacks = {
  onModelResolved?: (change: ProfileModelHydrationChange) => void;
  onModelFallback?: (profileId: string, model: string, reason: string) => void;
};

/**
 * Resolve environment variables for a worker based on profile configuration.
 * Includes explicit env vars and any matching envPrefixes from process.env.
 */
function resolveWorkerEnv(profile: WorkerProfile): Record<string, string> {
  const env: Record<string, string> = {};

  // Add explicit env vars from profile
  if (profile.env) {
    Object.assign(env, profile.env);
  }

  // Add env vars matching prefixes
  if (profile.envPrefixes && profile.envPrefixes.length > 0) {
    for (const [key, value] of Object.entries(process.env)) {
      if (!value) continue;
      for (const prefix of profile.envPrefixes) {
        if (key.startsWith(prefix)) {
          env[key] = value;
          break;
        }
      }
    }
  }

  return env;
}

/**
 * Resolve MCP server configuration for a worker.
 * Returns the MCP config to merge into the worker's opencode config.
 */
async function resolveWorkerMcp(
  profile: WorkerProfile,
  parentConfig: Record<string, unknown>,
): Promise<Record<string, unknown> | undefined> {
  const mcpConfig = profile.mcp;
  if (!mcpConfig) return undefined;

  const parentMcp = parentConfig.mcp as Record<string, unknown> | undefined;
  if (!parentMcp) return undefined;

  // If inheritAll, pass through the entire parent MCP config
  if (mcpConfig.inheritAll) {
    return parentMcp;
  }

  // Otherwise, filter to only specified servers
  if (mcpConfig.servers && mcpConfig.servers.length > 0) {
    const filtered: Record<string, unknown> = {};
    for (const serverName of mcpConfig.servers) {
      if (parentMcp[serverName]) {
        filtered[serverName] = parentMcp[serverName];
      }
    }
    return Object.keys(filtered).length > 0 ? filtered : undefined;
  }

  return undefined;
}

/**
 * Default session mode based on worker type.
 */
function getDefaultSessionMode(profile: WorkerProfile): WorkerSessionMode {
  // Memory and docs benefit from linked mode for visibility
  if (profile.id === "memory" || profile.id === "docs") {
    return "linked";
  }
  // Default to linked for visibility
  return "linked";
}

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

    const startServer = async (config: Record<string, unknown>, pluginPath?: string) => {
      const previousWorkerPluginPath = process.env.OPENCODE_WORKER_PLUGIN_PATH;
      const previousWorkerFlag = process.env.OPENCODE_ORCHESTRATOR_WORKER;

      // CRITICAL: Mark this process as a worker to prevent infinite plugin recursion
      process.env.OPENCODE_ORCHESTRATOR_WORKER = "1";

      if (pluginPath) {
        process.env.OPENCODE_WORKER_PLUGIN_PATH = pluginPath;
      }

      return await input.api
        .createServer({
          hostname,
          port: requestedPort,
          timeout: input.timeoutMs,
          config: config as any,
        })
        .finally(() => {
          // Restore previous env state
          if (previousWorkerFlag === undefined) {
            delete process.env.OPENCODE_ORCHESTRATOR_WORKER;
          } else {
            process.env.OPENCODE_ORCHESTRATOR_WORKER = previousWorkerFlag;
          }
          if (previousWorkerPluginPath === undefined) {
            delete process.env.OPENCODE_WORKER_PLUGIN_PATH;
          } else {
            process.env.OPENCODE_WORKER_PLUGIN_PATH = previousWorkerPluginPath;
          }
        });
    };

    const createSession = async (client: ApiService["client"]) => {
      const sessionAbort = new AbortController();
      try {
        return await withTimeout(
          client.session.create({
            body: { title: `Worker: ${resolvedProfile.name}` },
            query: { directory: input.directory },
            signal: sessionAbort.signal as any,
          } as any),
          input.timeoutMs,
          sessionAbort,
        );
      } catch (error) {
        return { error };
      }
    };

    const updateInstanceServer = (bundle: {
      client: ApiService["client"];
      server: { url: string; close: () => any };
    }) => {
      const { client, server } = bundle;
      instance.shutdown = async () => server.close();
      instance.serverUrl = server.url;
      try {
        const u = new URL(server.url);
        const actualPort = Number(u.port);
        if (Number.isFinite(actualPort) && actualPort > 0) instance.port = actualPort;
      } catch {
        // ignore
      }
      instance.client = client;
      return { client, server };
    };

    const extractSession = (result: any) => (result as any)?.data ?? result;
    const extractErrorMessage = (result: any) => {
      const sdkError = (result as any)?.error ?? result;
      if (!sdkError) return undefined;
      if (sdkError instanceof Error) return sdkError.message;
      const dataMessage = (sdkError as any)?.data?.message;
      if (typeof dataMessage === "string" && dataMessage.trim()) return dataMessage;
      const message = (sdkError as any)?.message;
      if (typeof message === "string" && message.trim()) return message;
      if (typeof sdkError === "string") return sdkError;
      try {
        return JSON.stringify(sdkError);
      } catch {
        return String(sdkError);
      }
    };

    let serverBundle = await startServer(mergedConfig, useWorkerBridge ? workerBridgePluginPath : undefined);
    let { client, server } = updateInstanceServer(serverBundle);

    let sessionResult = await createSession(client);
    let session = extractSession(sessionResult);
    if (!session?.id) {
      const errMsg = extractErrorMessage(sessionResult) ?? "Failed to create session";
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
        serverBundle = await startServer(mergedWithBridge, workerBridgePluginPath);
        ({ client, server } = updateInstanceServer(serverBundle));
        sessionResult = await createSession(client);
        session = extractSession(sessionResult);
      }
    }

    if (!session?.id) {
      const errMsg = extractErrorMessage(sessionResult) ?? "Failed to create session";
      throw new Error(errMsg);
    }

    instance.sessionId = session.id;

    let repoContextSection = "";
    if (resolvedProfile.injectRepoContext) {
      const repoContext = await getRepoContextForWorker(input.directory).catch(() => undefined);
      if (repoContext) repoContextSection = `\n\n${repoContext}\n`;
    }

    const capabilitiesJson = JSON.stringify({
      vision: Boolean(resolvedProfile.supportsVision),
      web: Boolean(resolvedProfile.supportsWeb),
    });

    const permissionsSection = permissionSummary
      ? `<worker-permissions>\n${permissionSummary}\n</worker-permissions>\n\n`
      : "";

    const bootstrapAbort = new AbortController();
    const bootstrapTimeoutMs = Math.min(input.timeoutMs, 15_000);
    void withTimeout(
      client.session.prompt({
        path: { id: session.id },
        body: {
          noReply: true,
          parts: [
            {
              type: "text",
              text:
                (resolvedProfile.systemPrompt
                  ? `<system-context>\n${resolvedProfile.systemPrompt}\n</system-context>\n\n`
                  : "") +
                repoContextSection +
                `<worker-identity>\n` +
                `You are worker "${resolvedProfile.id}" (${resolvedProfile.name}).\n` +
                `Your capabilities: ${capabilitiesJson}\n` +
                `</worker-identity>\n\n` +
                permissionsSection +
                `<orchestrator-instructions>\n` +
                `- Always reply with a direct plain-text answer.\n` +
                `- If a jobId is provided, include it in your response if relevant.\n` +
                `</orchestrator-instructions>`,
            },
          ],
        },
        query: { directory: input.directory },
        signal: bootstrapAbort.signal as any,
      } as any),
      bootstrapTimeoutMs,
      bootstrapAbort,
    ).catch(() => {});

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
    throw error;
  }
}

/**
 * Clean up a worker instance, stopping event forwarding and closing sessions.
 */
export function cleanupWorkerInstance(instance: WorkerInstance, sessionManager?: WorkerSessionManager): void {
  stopEventForwarding(instance);
  if (sessionManager && instance.sessionId) {
    sessionManager.closeSession(instance.sessionId);
  }
}
