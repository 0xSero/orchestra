import type { WorkerInstance, WorkerProfile } from "../types";
import type { ApiService } from "../api";
import type { OrchestratorConfig } from "../types";
import { hydrateProfileModelsFromOpencode } from "../models/hydrate";
import { buildToolConfigFromPermissions, summarizePermissions } from "../permissions/validator";
import { mergeOpenCodeConfig } from "../config/opencode";
import { getRepoContextForWorker } from "../ux/repo-context";
import type { WorkerRegistry } from "./registry";

function isValidPort(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 65535;
}

async function resolveProfileModel(input: {
  api: ApiService;
  directory: string;
  profile: WorkerProfile;
  modelSelection?: OrchestratorConfig["modelSelection"];
  modelAliases?: OrchestratorConfig["modelAliases"];
}): Promise<WorkerProfile> {
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
    return input.profile;
  }

  if (!isNodeTag && isExplicit) return input.profile;

  const { profiles } = await hydrateProfileModelsFromOpencode({
    client: input.api.client,
    directory: input.directory,
    profiles: { [input.profile.id]: input.profile },
    modelAliases: input.modelAliases,
    modelSelection: input.modelSelection,
  });
  return profiles[input.profile.id] ?? input.profile;
}

export async function spawnWorker(input: {
  api: ApiService;
  registry: WorkerRegistry;
  directory: string;
  profile: WorkerProfile;
  modelSelection?: OrchestratorConfig["modelSelection"];
  modelAliases?: OrchestratorConfig["modelAliases"];
  timeoutMs: number;
}): Promise<WorkerInstance> {
  const resolvedProfile = await resolveProfileModel({
    api: input.api,
    directory: input.directory,
    profile: input.profile,
    modelSelection: input.modelSelection,
    modelAliases: input.modelAliases,
  });

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
    const mergedConfig = await mergeOpenCodeConfig(
      {
        model: resolvedProfile.model,
        plugin: [],
        ...(toolConfig && { tools: toolConfig }),
        ...(resolvedProfile.permissions && { permissions: resolvedProfile.permissions }),
      },
      { dropOrchestratorPlugin: true }
    );

    const { client, server } = await input.api.createServer({
      hostname,
      port: requestedPort,
      timeout: input.timeoutMs,
      config: mergedConfig as any,
    });

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

    const sessionResult = await client.session.create({
      body: { title: `Worker: ${resolvedProfile.name}` },
      query: { directory: input.directory },
    });

    const session = (sessionResult as any)?.data ?? (sessionResult as any);
    if (!session?.id) {
      const err = (sessionResult as any)?.error;
      throw new Error(err?.message ?? err?.toString?.() ?? "Failed to create session");
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

    await client.session
      .prompt({
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
      } as any)
      .catch(() => {});

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
