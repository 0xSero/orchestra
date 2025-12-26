import type { WorkerInstance, WorkerProfile } from "../types";
import type { ApiService } from "../api";
import type { OrchestratorConfig } from "../types";
import { hydrateProfileModelsFromOpencode, type ProfileModelHydrationChange } from "../models/hydrate";
import { buildToolConfigFromPermissions, summarizePermissions } from "../permissions/validator";
import { mergeOpenCodeConfig } from "../config/opencode";
import { getRepoContextForWorker } from "../ux/repo-context";
import type { WorkerRegistry } from "./registry";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
          `Set a concrete provider/model ID for this profile.`
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

export async function spawnWorker(input: {
  api: ApiService;
  registry: WorkerRegistry;
  directory: string;
  profile: WorkerProfile;
  modelSelection?: OrchestratorConfig["modelSelection"];
  modelAliases?: OrchestratorConfig["modelAliases"];
  timeoutMs: number;
  callbacks?: SpawnWorkerCallbacks;
}): Promise<WorkerInstance> {
  const { profile: resolvedProfile, changes, fallbackModel } = await resolveProfileModel({
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
    input.callbacks?.onModelFallback?.(
      resolvedProfile.id,
      fallbackModel,
      `fallback from ${input.profile.model}`
    );
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

  const instance: WorkerInstance = {
    profile: resolvedProfile,
    status: "starting",
    port: requestedPort,
    directory: input.directory,
    startedAt: new Date(),
    modelResolution,
  };

  input.registry.register(instance);

  try {
    const workerBridgePluginPath = resolveWorkerBridgePluginPath();
    const useWorkerBridge = Boolean(workerBridgePluginPath);

    const mergedConfig = await mergeOpenCodeConfig(
      {
        model: resolvedProfile.model,
        plugin: [],
        ...(toolConfig && { tools: toolConfig }),
        ...(resolvedProfile.permissions && { permissions: resolvedProfile.permissions }),
      },
      {
        dropOrchestratorPlugin: true,
        appendPlugins: useWorkerBridge ? [workerBridgePluginPath as string] : undefined,
      }
    );
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
          sessionAbort
        );
      } catch (error) {
        return { error };
      }
    };

    const updateInstanceServer = (bundle: { client: ApiService["client"]; server: { url: string; close: () => any } }) => {
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
            ...(toolConfig && { tools: toolConfig }),
            ...(resolvedProfile.permissions && { permissions: resolvedProfile.permissions }),
          },
          {
            dropOrchestratorPlugin: true,
            appendPlugins: [workerBridgePluginPath],
          }
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
      bootstrapAbort
    ).catch(() => {});

    instance.status = "ready";
    instance.lastActivity = new Date();
    input.registry.updateStatus(resolvedProfile.id, "ready");

    return instance;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    instance.status = "error";
    instance.error = errorMsg;
    input.registry.updateStatus(resolvedProfile.id, "error", errorMsg);
    try {
      await instance.shutdown?.();
    } catch {
      // ignore
    }
    throw error;
  }
}
