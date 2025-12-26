import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { OrchestratorConfig, OrchestratorConfigFile } from "../types";
import { deepMerge } from "../helpers/format";
import { canAutoSpawn, canSpawnOnDemand, canWarmPool } from "../core/spawn-policy";
import { buildDefaultOrchestratorConfigFile } from "./orchestrator/defaults";
import { collectProfilesAndSpawn, parseOrchestratorConfigFile } from "./orchestrator/parse";
import {
  getDefaultGlobalOrchestratorConfigPath,
  getDefaultGlobalOpenCodeConfigPath,
  getDefaultProjectOrchestratorConfigPath,
} from "./orchestrator/paths";

export type LoadedOrchestratorConfig = {
  config: OrchestratorConfig;
  sources: { global?: string; project?: string };
};

export { getDefaultGlobalOrchestratorConfigPath, getDefaultGlobalOpenCodeConfigPath, getDefaultProjectOrchestratorConfigPath };

export async function loadOrchestratorConfig(input: {
  directory: string;
  worktree?: string;
}): Promise<LoadedOrchestratorConfig> {
  const defaultsFile = buildDefaultOrchestratorConfigFile();

  const globalPath = getDefaultGlobalOrchestratorConfigPath();
  const projectCandidates = [
    getDefaultProjectOrchestratorConfigPath(input.directory),
    input.worktree ? getDefaultProjectOrchestratorConfigPath(input.worktree) : undefined,
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

  const mergedFile = deepMerge(
    deepMerge(defaultsFile as unknown as Record<string, unknown>, globalPartial as unknown as Record<string, unknown>),
    projectPartial as unknown as Record<string, unknown>
  ) as unknown as OrchestratorConfigFile;

  const { profiles, spawn } = collectProfilesAndSpawn(mergedFile);
  const spawnPolicy = (mergedFile.spawnPolicy ?? defaultsFile.spawnPolicy) as OrchestratorConfig["spawnPolicy"];
  const spawnList = spawn.filter((id) => canAutoSpawn(spawnPolicy, id));
  const spawnOnDemand = (mergedFile.spawnOnDemand ?? defaultsFile.spawnOnDemand ?? []).filter((id) =>
    canSpawnOnDemand(spawnPolicy, id)
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
    autoSpawn: mergedFile.autoSpawn ?? defaultsFile.autoSpawn ?? true,
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
    integrations: (mergedFile.integrations ?? defaultsFile.integrations) as OrchestratorConfig["integrations"],
    telemetry: (mergedFile.telemetry ?? defaultsFile.telemetry) as OrchestratorConfig["telemetry"],
    profiles,
    spawn: spawnList,
  };

  return { config, sources };
}
