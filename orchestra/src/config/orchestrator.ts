import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { canAutoSpawn, canSpawnOnDemand, canWarmPool } from "../core/spawn-policy";
import { deepMerge } from "../helpers/format";
import type { OrchestratorConfig, OrchestratorConfigFile } from "../types";
import { extractIntegrationsFromOpenCodeConfig, loadOpenCodeConfig } from "./opencode";
import { buildDefaultOrchestratorConfigFile } from "./orchestrator/defaults";
import { collectProfilesAndSpawn, parseOrchestratorConfigFile } from "./orchestrator/parse";
import {
  getDefaultGlobalOpenCodeConfigPath,
  getDefaultGlobalOrchestratorConfigPath,
  getDefaultProjectOrchestratorConfigPath,
} from "./orchestrator/paths";

const mergeOpenCodeIntegrations = (
  defaults: Record<string, unknown> | undefined,
  openCode: Record<string, unknown> | undefined,
  orchestrator: Record<string, unknown> | undefined,
): Record<string, unknown> => {
  const base = defaults ?? {};
  const mergedOpenCode = openCode ? deepMerge(base, openCode) : base;
  return orchestrator ? deepMerge(mergedOpenCode, orchestrator) : mergedOpenCode;
};

export type LoadedOrchestratorConfig = {
  config: OrchestratorConfig;
  sources: { global?: string; project?: string };
};

export {
  getDefaultGlobalOrchestratorConfigPath,
  getDefaultGlobalOpenCodeConfigPath,
  getDefaultProjectOrchestratorConfigPath,
};

export async function loadOrchestratorConfig(input: {
  directory: string;
  worktree?: string;
}): Promise<LoadedOrchestratorConfig> {
  const defaultsFile = buildDefaultOrchestratorConfigFile();

  const globalPath = getDefaultGlobalOrchestratorConfigPath();
  const projectCandidates = [
    getDefaultProjectOrchestratorConfigPath(input.directory),
    input.worktree ? getDefaultProjectOrchestratorConfigPath(input.worktree) : undefined,
    // Fallback to orchestra/ subdirectory (for monorepo development setups)
    join(input.directory, "orchestra", ".opencode", "orchestrator.json"),
    input.worktree ? join(input.worktree, "orchestra", ".opencode", "orchestrator.json") : undefined,
    join(input.directory, "orchestrator.json"),
    input.worktree ? join(input.worktree, "orchestrator.json") : undefined,
  ].filter(Boolean) as string[];

  const sources: LoadedOrchestratorConfig["sources"] = {};

  const globalPartial = await (async () => {
    if (!existsSync(globalPath)) return {};
    sources.global = globalPath;
    try {
      const raw = JSON.parse(await readFile(globalPath, "utf8")) as unknown;
      return parseOrchestratorConfigFile(raw);
    } catch {
      return {};
    }
  })();

  const projectPath = projectCandidates.find((p) => existsSync(p));
  const projectPartial = await (async () => {
    if (!projectPath) return {};
    sources.project = projectPath;
    try {
      const raw = JSON.parse(await readFile(projectPath, "utf8")) as unknown;
      return parseOrchestratorConfigFile(raw);
    } catch {
      return {};
    }
  })();

  const openCodeConfig = await loadOpenCodeConfig();
  const openCodeIntegrations = extractIntegrationsFromOpenCodeConfig(openCodeConfig);

  const mergedFile = deepMerge(
    deepMerge(defaultsFile as unknown as Record<string, unknown>, globalPartial as unknown as Record<string, unknown>),
    projectPartial as unknown as Record<string, unknown>,
  ) as unknown as OrchestratorConfigFile;
  const orchestratorIntegrations = deepMerge(
    (globalPartial.integrations ?? {}) as Record<string, unknown>,
    (projectPartial.integrations ?? {}) as Record<string, unknown>,
  );
  const mergedIntegrations = mergeOpenCodeIntegrations(
    defaultsFile.integrations as Record<string, unknown> | undefined,
    openCodeIntegrations,
    orchestratorIntegrations,
  );

  const { profiles, spawn } = collectProfilesAndSpawn(mergedFile);
  const spawnPolicy = (mergedFile.spawnPolicy ?? defaultsFile.spawnPolicy) as OrchestratorConfig["spawnPolicy"];
  const spawnList = spawn.filter((id) => canAutoSpawn(spawnPolicy, id));
  const spawnOnDemand = (mergedFile.spawnOnDemand ?? defaultsFile.spawnOnDemand ?? []).filter((id) =>
    canSpawnOnDemand(spawnPolicy, id),
  );

  const warmPool = (() => {
    const base = (mergedFile.warmPool ?? defaultsFile.warmPool) as OrchestratorConfig["warmPool"];
    if (!base?.profiles) return base;
    const nextProfiles: Record<string, { size?: number; idleTimeoutMs?: number }> = {};
    for (const [id, cfg] of Object.entries(base.profiles)) {
      if (!canWarmPool(spawnPolicy, id)) continue;
      nextProfiles[id] = cfg ?? {};
    }
    return { ...base, profiles: nextProfiles };
  })();

  const config: OrchestratorConfig = {
    basePort: mergedFile.basePort ?? defaultsFile.basePort ?? 14096,
    autoSpawn: mergedFile.autoSpawn ?? defaultsFile.autoSpawn ?? false,
    spawnOnDemand,
    spawnPolicy,
    startupTimeout: mergedFile.startupTimeout ?? defaultsFile.startupTimeout ?? 30000,
    healthCheckInterval: mergedFile.healthCheckInterval ?? defaultsFile.healthCheckInterval ?? 30000,
    healthCheck: (mergedFile.healthCheck ?? defaultsFile.healthCheck) as OrchestratorConfig["healthCheck"],
    warmPool,
    modelSelection: (mergedFile.modelSelection ?? defaultsFile.modelSelection) as OrchestratorConfig["modelSelection"],
    modelAliases: (mergedFile.modelAliases ?? defaultsFile.modelAliases) as OrchestratorConfig["modelAliases"],
    ui: (mergedFile.ui ?? defaultsFile.ui) as OrchestratorConfig["ui"],
    notifications: (mergedFile.notifications ?? defaultsFile.notifications) as OrchestratorConfig["notifications"],
    agent: (mergedFile.agent ?? defaultsFile.agent) as OrchestratorConfig["agent"],
    commands: (mergedFile.commands ?? defaultsFile.commands) as OrchestratorConfig["commands"],
    pruning: (mergedFile.pruning ?? defaultsFile.pruning) as OrchestratorConfig["pruning"],
    workflows: (mergedFile.workflows ?? defaultsFile.workflows) as OrchestratorConfig["workflows"],
    security: (mergedFile.security ?? defaultsFile.security) as OrchestratorConfig["security"],
    memory: (mergedFile.memory ?? defaultsFile.memory) as OrchestratorConfig["memory"],
    integrations: mergedIntegrations as OrchestratorConfig["integrations"],
    telemetry: (mergedFile.telemetry ?? defaultsFile.telemetry) as OrchestratorConfig["telemetry"],
    profiles,
    spawn: spawnList,
  };

  return { config: applyEnvOverrides(config), sources };
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return items.length > 0 ? items : [];
}

function applyEnvOverrides(config: OrchestratorConfig): OrchestratorConfig {
  const autoSpawn = parseBoolean(process.env.OPENCODE_ORCH_AUTO_SPAWN);
  const spawnOnDemand = parseList(process.env.OPENCODE_ORCH_SPAWN_ON_DEMAND);
  const basePort = parseNumber(process.env.OPENCODE_ORCH_BASE_PORT);
  const startupTimeout = parseNumber(process.env.OPENCODE_ORCH_STARTUP_TIMEOUT_MS);
  const healthCheckInterval = parseNumber(process.env.OPENCODE_ORCH_HEALTH_INTERVAL_MS);

  const commandsEnabled = parseBoolean(process.env.OPENCODE_ORCH_COMMANDS);
  const commandPrefix = process.env.OPENCODE_ORCH_COMMAND_PREFIX?.trim();

  const uiToasts = parseBoolean(process.env.OPENCODE_ORCH_UI_TOASTS);
  const uiWakeup = parseBoolean(process.env.OPENCODE_ORCH_UI_WAKEUP);
  const uiFirstRunDemo = parseBoolean(process.env.OPENCODE_ORCH_UI_FIRST_RUN_DEMO);

  const memoryEnabled = parseBoolean(process.env.OPENCODE_ORCH_MEMORY);
  const workflowsEnabled = parseBoolean(process.env.OPENCODE_ORCH_WORKFLOWS);
  const pruningEnabled = parseBoolean(process.env.OPENCODE_ORCH_PRUNING);
  const telemetryEnabled = parseBoolean(process.env.OPENCODE_ORCH_TELEMETRY);

  return {
    ...config,
    ...(autoSpawn !== undefined ? { autoSpawn } : {}),
    ...(spawnOnDemand !== undefined ? { spawnOnDemand } : {}),
    ...(basePort !== undefined ? { basePort } : {}),
    ...(startupTimeout !== undefined ? { startupTimeout } : {}),
    ...(healthCheckInterval !== undefined ? { healthCheckInterval } : {}),
    ...(commandsEnabled !== undefined || commandPrefix
      ? {
          commands: {
            ...config.commands,
            ...(commandsEnabled !== undefined ? { enabled: commandsEnabled } : {}),
            ...(commandPrefix ? { prefix: commandPrefix } : {}),
          },
        }
      : {}),
    ...(uiToasts !== undefined || uiWakeup !== undefined || uiFirstRunDemo !== undefined
      ? {
          ui: {
            ...config.ui,
            ...(uiToasts !== undefined ? { toasts: uiToasts } : {}),
            ...(uiWakeup !== undefined ? { wakeupInjection: uiWakeup } : {}),
            ...(uiFirstRunDemo !== undefined ? { firstRunDemo: uiFirstRunDemo } : {}),
          },
        }
      : {}),
    ...(memoryEnabled !== undefined
      ? { memory: { ...config.memory, enabled: memoryEnabled } }
      : {}),
    ...(workflowsEnabled !== undefined
      ? { workflows: { ...config.workflows, enabled: workflowsEnabled } }
      : {}),
    ...(pruningEnabled !== undefined ? { pruning: { ...config.pruning, enabled: pruningEnabled } } : {}),
    ...(telemetryEnabled !== undefined ? { telemetry: { ...config.telemetry, enabled: telemetryEnabled } } : {}),
  };
}
