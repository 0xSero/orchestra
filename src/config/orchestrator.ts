import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { OrchestratorConfig, OrchestratorConfigFile, SpawnPolicy, ToolPermissions, WorkerProfile } from "../types";
import { builtInProfiles } from "./profiles";
import { resolveProfileInheritance, type WorkerProfileDefinition } from "./profile-inheritance";
import { isPlainObject, asBooleanRecord, asStringArray, getUserConfigDir, deepMerge } from "../helpers/format";
import { canAutoSpawn, canSpawnOnDemand, canWarmPool } from "../core/spawn-policy";


function parsePermissions(value: unknown): ToolPermissions | undefined {
  if (!isPlainObject(value)) return undefined;
  const out: ToolPermissions = {};
  if (isPlainObject(value.categories)) {
    out.categories = {};
    if (value.categories.filesystem === "full" || value.categories.filesystem === "read" || value.categories.filesystem === "none") {
      out.categories.filesystem = value.categories.filesystem;
    }
    if (value.categories.execution === "full" || value.categories.execution === "sandboxed" || value.categories.execution === "none") {
      out.categories.execution = value.categories.execution;
    }
    if (value.categories.network === "full" || value.categories.network === "localhost" || value.categories.network === "none") {
      out.categories.network = value.categories.network;
    }
  }
  if (isPlainObject(value.tools)) {
    out.tools = {};
    for (const [toolName, cfg] of Object.entries(value.tools)) {
      if (!isPlainObject(cfg)) continue;
      if (typeof cfg.enabled !== "boolean") continue;
      out.tools[toolName] = {
        enabled: cfg.enabled,
        constraints: isPlainObject(cfg.constraints) ? cfg.constraints : undefined,
      };
    }
  }
  if (isPlainObject(value.paths)) {
    const allowed = asStringArray(value.paths.allowed);
    const denied = asStringArray(value.paths.denied);
    if (allowed || denied) out.paths = { allowed: allowed ?? undefined, denied: denied ?? undefined };
  }
  return out;
}

function parseSpawnPolicyEntry(value: unknown): SpawnPolicy | undefined {
  if (!isPlainObject(value)) return undefined;
  const out: SpawnPolicy = {};
  if (typeof value.autoSpawn === "boolean") out.autoSpawn = value.autoSpawn;
  if (typeof value.onDemand === "boolean") out.onDemand = value.onDemand;
  if (typeof value.allowManual === "boolean") out.allowManual = value.allowManual;
  if (typeof value.warmPool === "boolean") out.warmPool = value.warmPool;
  if (typeof value.reuseExisting === "boolean") out.reuseExisting = value.reuseExisting;
  return out;
}

function resolveWorkerEntry(entry: unknown): WorkerProfileDefinition | undefined {
  if (typeof entry === "string") return builtInProfiles[entry];
  if (!isPlainObject(entry)) return undefined;

  const id = typeof entry.id === "string" ? entry.id : undefined;
  if (!id) return undefined;

  const base = builtInProfiles[id];
  const merged: Record<string, unknown> = { ...(base ?? {}), ...entry };

  if (typeof merged.id !== "string") return undefined;

  if ("tools" in merged) {
    const tools = asBooleanRecord(merged.tools);
    if (!tools) return undefined;
    merged.tools = tools;
  }

  if ("tags" in merged) {
    const tags = asStringArray(merged.tags);
    if (!tags) return undefined;
    merged.tags = tags;
  }

  if ("permissions" in merged) {
    merged.permissions = parsePermissions(merged.permissions);
  }

  if ("extends" in merged && typeof merged.extends !== "string") delete merged.extends;
  if ("compose" in merged) {
    const compose = asStringArray(merged.compose);
    merged.compose = compose;
  }

  return merged as unknown as WorkerProfileDefinition;
}

export function getDefaultGlobalOrchestratorConfigPath(): string {
  return join(getUserConfigDir(), "opencode", "orchestrator.json");
}

export function getDefaultGlobalOpenCodeConfigPath(): string {
  return join(getUserConfigDir(), "opencode", "opencode.json");
}

export function getDefaultProjectOrchestratorConfigPath(directory: string): string {
  return join(directory, ".opencode", "orchestrator.json");
}

function asConfigArray(value: unknown): Array<string | Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: Array<string | Record<string, unknown>> = [];
  for (const item of value) {
    if (typeof item === "string") out.push(item);
    else if (isPlainObject(item)) out.push(item);
  }
  return out;
}

function parseOrchestratorConfigFile(raw: unknown): Partial<OrchestratorConfigFile> {
  if (!isPlainObject(raw)) return {};

  const partial: Partial<OrchestratorConfigFile> = {};

  if (typeof raw.basePort === "number") partial.basePort = raw.basePort;
  if (typeof raw.autoSpawn === "boolean") partial.autoSpawn = raw.autoSpawn;
  if (Array.isArray(raw.spawnOnDemand) && raw.spawnOnDemand.every((id: unknown) => typeof id === "string")) {
    partial.spawnOnDemand = raw.spawnOnDemand;
  }
  if (isPlainObject(raw.spawnPolicy)) {
    const spawnPolicy: Record<string, unknown> = {};
    if (isPlainObject(raw.spawnPolicy.default)) {
      const parsed = parseSpawnPolicyEntry(raw.spawnPolicy.default);
      if (parsed) spawnPolicy.default = parsed;
    }
    if (isPlainObject(raw.spawnPolicy.profiles)) {
      const profiles: Record<string, SpawnPolicy> = {};
      for (const [id, cfg] of Object.entries(raw.spawnPolicy.profiles)) {
        const parsed = parseSpawnPolicyEntry(cfg);
        if (parsed) profiles[id] = parsed;
      }
      spawnPolicy.profiles = profiles;
    }
    partial.spawnPolicy = spawnPolicy as OrchestratorConfig["spawnPolicy"];
  }
  if (typeof raw.startupTimeout === "number") partial.startupTimeout = raw.startupTimeout;
  if (typeof raw.healthCheckInterval === "number") partial.healthCheckInterval = raw.healthCheckInterval;
  if (isPlainObject(raw.healthCheck)) {
    const healthCheck: Record<string, unknown> = {};
    if (typeof raw.healthCheck.enabled === "boolean") healthCheck.enabled = raw.healthCheck.enabled;
    if (typeof raw.healthCheck.intervalMs === "number") healthCheck.intervalMs = raw.healthCheck.intervalMs;
    if (typeof raw.healthCheck.timeoutMs === "number") healthCheck.timeoutMs = raw.healthCheck.timeoutMs;
    if (typeof raw.healthCheck.maxRetries === "number") healthCheck.maxRetries = raw.healthCheck.maxRetries;
    partial.healthCheck = healthCheck as OrchestratorConfig["healthCheck"];
  }

  if (isPlainObject(raw.warmPool)) {
    const warmPool: Record<string, unknown> = {};
    if (typeof raw.warmPool.enabled === "boolean") warmPool.enabled = raw.warmPool.enabled;
    if (isPlainObject(raw.warmPool.profiles)) {
      const profiles: Record<string, unknown> = {};
      for (const [id, cfg] of Object.entries(raw.warmPool.profiles)) {
        if (!isPlainObject(cfg)) continue;
        const entry: Record<string, unknown> = {};
        if (typeof cfg.size === "number") entry.size = cfg.size;
        if (typeof cfg.idleTimeoutMs === "number") entry.idleTimeoutMs = cfg.idleTimeoutMs;
        profiles[id] = entry;
      }
      warmPool.profiles = profiles;
    }
    partial.warmPool = warmPool as OrchestratorConfig["warmPool"];
  }

  if (isPlainObject(raw.modelSelection)) {
    const modelSelection: Record<string, unknown> = {};
    if (raw.modelSelection.mode === "performance" || raw.modelSelection.mode === "balanced" || raw.modelSelection.mode === "economical") {
      modelSelection.mode = raw.modelSelection.mode;
    }
    if (typeof raw.modelSelection.maxCostPer1kTokens === "number") modelSelection.maxCostPer1kTokens = raw.modelSelection.maxCostPer1kTokens;
    if (Array.isArray(raw.modelSelection.preferredProviders) && raw.modelSelection.preferredProviders.every((p: unknown) => typeof p === "string")) {
      modelSelection.preferredProviders = raw.modelSelection.preferredProviders;
    }
    partial.modelSelection = modelSelection as OrchestratorConfig["modelSelection"];
  }

  if (isPlainObject(raw.modelAliases)) {
    const modelAliases: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw.modelAliases)) {
      if (typeof value === "string") modelAliases[key] = value;
    }
    partial.modelAliases = modelAliases;
  }

  if ("profiles" in raw) {
    const profiles = asConfigArray(raw.profiles);
    if (profiles) partial.profiles = profiles as any;
  }

  if ("workers" in raw) {
    const workers = asConfigArray(raw.workers);
    if (workers) partial.workers = workers as any;
  }

  if (isPlainObject(raw.ui)) {
    const ui: Record<string, unknown> = {};
    if (typeof raw.ui.toasts === "boolean") ui.toasts = raw.ui.toasts;
    if (typeof raw.ui.injectSystemContext === "boolean") ui.injectSystemContext = raw.ui.injectSystemContext;
    if (typeof raw.ui.systemContextMaxWorkers === "number") ui.systemContextMaxWorkers = raw.ui.systemContextMaxWorkers;
    if (raw.ui.defaultListFormat === "markdown" || raw.ui.defaultListFormat === "json") {
      ui.defaultListFormat = raw.ui.defaultListFormat;
    }
    if (typeof raw.ui.debug === "boolean") ui.debug = raw.ui.debug;
    if (typeof raw.ui.logToConsole === "boolean") ui.logToConsole = raw.ui.logToConsole;
    if (typeof raw.ui.firstRunDemo === "boolean") ui.firstRunDemo = raw.ui.firstRunDemo;
    if (typeof raw.ui.wakeupInjection === "boolean") ui.wakeupInjection = raw.ui.wakeupInjection;
    partial.ui = ui as OrchestratorConfig["ui"];
  }

  if (isPlainObject(raw.notifications) && isPlainObject(raw.notifications.idle)) {
    const idle: Record<string, unknown> = {};
    if (typeof raw.notifications.idle.enabled === "boolean") idle.enabled = raw.notifications.idle.enabled;
    if (typeof raw.notifications.idle.title === "string") idle.title = raw.notifications.idle.title;
    if (typeof raw.notifications.idle.message === "string") idle.message = raw.notifications.idle.message;
    if (typeof raw.notifications.idle.delayMs === "number") idle.delayMs = raw.notifications.idle.delayMs;
    partial.notifications = { idle: idle as OrchestratorConfig["notifications"] extends { idle: infer T } ? T : never };
  }

  if (isPlainObject(raw.agent)) {
    const agent: Record<string, unknown> = {};
    if (typeof raw.agent.enabled === "boolean") agent.enabled = raw.agent.enabled;
    if (typeof raw.agent.name === "string") agent.name = raw.agent.name;
    if (typeof raw.agent.model === "string") agent.model = raw.agent.model;
    if (typeof raw.agent.prompt === "string") agent.prompt = raw.agent.prompt;
    if (raw.agent.mode === "primary" || raw.agent.mode === "subagent") agent.mode = raw.agent.mode;
    if (typeof raw.agent.color === "string") agent.color = raw.agent.color;
    if (typeof raw.agent.applyToBuild === "boolean") agent.applyToBuild = raw.agent.applyToBuild;
    partial.agent = agent as OrchestratorConfig["agent"];
  }

  if (isPlainObject(raw.commands)) {
    const commands: Record<string, unknown> = {};
    if (typeof raw.commands.enabled === "boolean") commands.enabled = raw.commands.enabled;
    if (typeof raw.commands.prefix === "string") commands.prefix = raw.commands.prefix;
    partial.commands = commands as OrchestratorConfig["commands"];
  }

  if (isPlainObject(raw.pruning)) {
    const pruning: Record<string, unknown> = {};
    if (typeof raw.pruning.enabled === "boolean") pruning.enabled = raw.pruning.enabled;
    if (typeof raw.pruning.maxToolOutputChars === "number") pruning.maxToolOutputChars = raw.pruning.maxToolOutputChars;
    if (typeof raw.pruning.maxToolInputChars === "number") pruning.maxToolInputChars = raw.pruning.maxToolInputChars;
    if (Array.isArray(raw.pruning.protectedTools) && raw.pruning.protectedTools.every((t: unknown) => typeof t === "string")) {
      pruning.protectedTools = raw.pruning.protectedTools;
    }
    partial.pruning = pruning as OrchestratorConfig["pruning"];
  }

  if (isPlainObject(raw.workflows)) {
    const workflows: Record<string, unknown> = {};
    if (typeof raw.workflows.enabled === "boolean") workflows.enabled = raw.workflows.enabled;
    if (isPlainObject(raw.workflows.roocodeBoomerang)) {
      const roocode: Record<string, unknown> = {};
      if (typeof raw.workflows.roocodeBoomerang.enabled === "boolean") roocode.enabled = raw.workflows.roocodeBoomerang.enabled;
      if (typeof raw.workflows.roocodeBoomerang.maxSteps === "number") roocode.maxSteps = raw.workflows.roocodeBoomerang.maxSteps;
      if (typeof raw.workflows.roocodeBoomerang.maxTaskChars === "number") roocode.maxTaskChars = raw.workflows.roocodeBoomerang.maxTaskChars;
      if (typeof raw.workflows.roocodeBoomerang.maxCarryChars === "number") roocode.maxCarryChars = raw.workflows.roocodeBoomerang.maxCarryChars;
      if (typeof raw.workflows.roocodeBoomerang.perStepTimeoutMs === "number") {
        roocode.perStepTimeoutMs = raw.workflows.roocodeBoomerang.perStepTimeoutMs;
      }
      if (Array.isArray(raw.workflows.roocodeBoomerang.steps)) {
        const steps = raw.workflows.roocodeBoomerang.steps
          .map((s: unknown) => {
            if (!isPlainObject(s)) return undefined;
            const id = typeof s.id === "string" ? s.id : undefined;
            if (!id) return undefined;
            const step: Record<string, unknown> = { id };
            if (typeof s.title === "string") step.title = s.title;
            if (typeof s.workerId === "string") step.workerId = s.workerId;
            if (typeof s.prompt === "string") step.prompt = s.prompt;
            if (typeof s.carry === "boolean") step.carry = s.carry;
            return step;
          })
          .filter(Boolean);
        if (steps.length > 0) roocode.steps = steps;
      }
      workflows.roocodeBoomerang = roocode;
    }
    partial.workflows = workflows as OrchestratorConfig["workflows"];
  }

  if (isPlainObject(raw.security)) {
    const security: Record<string, unknown> = {};
    if (isPlainObject(raw.security.workflows)) {
      const workflows: Record<string, unknown> = {};
      if (typeof raw.security.workflows.maxSteps === "number") workflows.maxSteps = raw.security.workflows.maxSteps;
      if (typeof raw.security.workflows.maxTaskChars === "number") workflows.maxTaskChars = raw.security.workflows.maxTaskChars;
      if (typeof raw.security.workflows.maxCarryChars === "number") workflows.maxCarryChars = raw.security.workflows.maxCarryChars;
      if (typeof raw.security.workflows.perStepTimeoutMs === "number") {
        workflows.perStepTimeoutMs = raw.security.workflows.perStepTimeoutMs;
      }
      security.workflows = workflows;
    }
    partial.security = security as OrchestratorConfig["security"];
  }

  if (isPlainObject(raw.memory)) {
    const memory: Record<string, unknown> = {};
    if (typeof raw.memory.enabled === "boolean") memory.enabled = raw.memory.enabled;
    if (typeof raw.memory.autoSpawn === "boolean") memory.autoSpawn = raw.memory.autoSpawn;
    if (typeof raw.memory.autoRecord === "boolean") memory.autoRecord = raw.memory.autoRecord;
    if (typeof raw.memory.autoInject === "boolean") memory.autoInject = raw.memory.autoInject;
    if (raw.memory.scope === "project" || raw.memory.scope === "global") memory.scope = raw.memory.scope;
    if (typeof raw.memory.maxChars === "number") memory.maxChars = raw.memory.maxChars;

    if (isPlainObject(raw.memory.summaries)) {
      const summaries: Record<string, unknown> = {};
      if (typeof raw.memory.summaries.enabled === "boolean") summaries.enabled = raw.memory.summaries.enabled;
      if (typeof raw.memory.summaries.sessionMaxChars === "number") summaries.sessionMaxChars = raw.memory.summaries.sessionMaxChars;
      if (typeof raw.memory.summaries.projectMaxChars === "number") summaries.projectMaxChars = raw.memory.summaries.projectMaxChars;
      memory.summaries = summaries;
    }

    if (isPlainObject(raw.memory.trim)) {
      const trim: Record<string, unknown> = {};
      if (typeof raw.memory.trim.maxMessagesPerSession === "number") trim.maxMessagesPerSession = raw.memory.trim.maxMessagesPerSession;
      if (typeof raw.memory.trim.maxMessagesPerProject === "number") trim.maxMessagesPerProject = raw.memory.trim.maxMessagesPerProject;
      if (typeof raw.memory.trim.maxMessagesGlobal === "number") trim.maxMessagesGlobal = raw.memory.trim.maxMessagesGlobal;
      if (typeof raw.memory.trim.maxProjectsGlobal === "number") trim.maxProjectsGlobal = raw.memory.trim.maxProjectsGlobal;
      memory.trim = trim;
    }

    if (isPlainObject(raw.memory.inject)) {
      const inject: Record<string, unknown> = {};
      if (typeof raw.memory.inject.maxChars === "number") inject.maxChars = raw.memory.inject.maxChars;
      if (typeof raw.memory.inject.maxEntries === "number") inject.maxEntries = raw.memory.inject.maxEntries;
      if (typeof raw.memory.inject.includeMessages === "boolean") inject.includeMessages = raw.memory.inject.includeMessages;
      if (typeof raw.memory.inject.includeSessionSummary === "boolean") inject.includeSessionSummary = raw.memory.inject.includeSessionSummary;
      if (typeof raw.memory.inject.includeProjectSummary === "boolean") inject.includeProjectSummary = raw.memory.inject.includeProjectSummary;
      if (typeof raw.memory.inject.includeGlobal === "boolean") inject.includeGlobal = raw.memory.inject.includeGlobal;
      if (typeof raw.memory.inject.maxGlobalEntries === "number") inject.maxGlobalEntries = raw.memory.inject.maxGlobalEntries;
      memory.inject = inject;
    }
    partial.memory = memory as OrchestratorConfig["memory"];
  }

  if (isPlainObject(raw.integrations)) {
    const integrations: Record<string, unknown> = {};
    if (isPlainObject(raw.integrations.linear)) {
      const linear: Record<string, unknown> = {};
      if (typeof raw.integrations.linear.enabled === "boolean") linear.enabled = raw.integrations.linear.enabled;
      if (typeof raw.integrations.linear.apiKey === "string") linear.apiKey = raw.integrations.linear.apiKey;
      if (typeof raw.integrations.linear.teamId === "string") linear.teamId = raw.integrations.linear.teamId;
      if (typeof raw.integrations.linear.apiUrl === "string") linear.apiUrl = raw.integrations.linear.apiUrl;
      if (typeof raw.integrations.linear.projectPrefix === "string") {
        linear.projectPrefix = raw.integrations.linear.projectPrefix;
      }
      integrations.linear = linear;
    }
    if (isPlainObject(raw.integrations.neo4j)) {
      const neo4j: Record<string, unknown> = {};
      if (typeof raw.integrations.neo4j.enabled === "boolean") neo4j.enabled = raw.integrations.neo4j.enabled;
      if (typeof raw.integrations.neo4j.uri === "string") neo4j.uri = raw.integrations.neo4j.uri;
      if (typeof raw.integrations.neo4j.username === "string") neo4j.username = raw.integrations.neo4j.username;
      if (typeof raw.integrations.neo4j.password === "string") neo4j.password = raw.integrations.neo4j.password;
      if (typeof raw.integrations.neo4j.database === "string") neo4j.database = raw.integrations.neo4j.database;
      integrations.neo4j = neo4j;
    }
    if (isPlainObject(raw.integrations.monitoring)) {
      const monitoring: Record<string, unknown> = {};
      if (typeof raw.integrations.monitoring.enabled === "boolean") monitoring.enabled = raw.integrations.monitoring.enabled;
      if (typeof raw.integrations.monitoring.port === "number") monitoring.port = raw.integrations.monitoring.port;
      if (typeof raw.integrations.monitoring.metricsPath === "string") {
        monitoring.metricsPath = raw.integrations.monitoring.metricsPath;
      }
      integrations.monitoring = monitoring;
    }
    partial.integrations = integrations as OrchestratorConfig["integrations"];
  }

  if (isPlainObject(raw.telemetry)) {
    const telemetry: Record<string, unknown> = {};
    if (typeof raw.telemetry.enabled === "boolean") telemetry.enabled = raw.telemetry.enabled;
    if (typeof raw.telemetry.apiKey === "string") telemetry.apiKey = raw.telemetry.apiKey;
    if (typeof raw.telemetry.host === "string") telemetry.host = raw.telemetry.host;
    partial.telemetry = telemetry as OrchestratorConfig["telemetry"];
  }

  return partial;
}

function collectProfilesAndSpawn(input: OrchestratorConfigFile): {
  profiles: Record<string, WorkerProfile>;
  spawn: string[];
} {
  const definitions: Record<string, WorkerProfileDefinition> = {};
  const spawn: string[] = [];
  const seen = new Set<string>();

  const registerProfile = (entry: unknown): WorkerProfileDefinition | undefined => {
    const resolved = resolveWorkerEntry(entry);
    if (resolved) definitions[resolved.id] = resolved;
    return resolved;
  };

  const enqueueSpawn = (id: string | undefined) => {
    if (!id) return;
    if (!(id in builtInProfiles) && !(id in definitions)) return;
    if (seen.has(id)) return;
    seen.add(id);
    spawn.push(id);
  };

  for (const entry of input.profiles ?? []) {
    registerProfile(entry);
  }

  for (const entry of input.workers ?? []) {
    if (typeof entry === "string") {
      enqueueSpawn(entry);
      continue;
    }
    const resolved = registerProfile(entry);
    enqueueSpawn(resolved?.id);
  }

  const profiles = resolveProfileInheritance({ builtIns: builtInProfiles, definitions });
  return { profiles, spawn };
}

export type LoadedOrchestratorConfig = {
  config: OrchestratorConfig;
  sources: { global?: string; project?: string };
};

export async function loadOrchestratorConfig(input: {
  directory: string;
  worktree?: string;
}): Promise<LoadedOrchestratorConfig> {
  const defaultsFile: OrchestratorConfigFile = {
    basePort: 14096,
    autoSpawn: true,
    spawnOnDemand: ["vision"],
    spawnPolicy: {
      default: {
        autoSpawn: true,
        onDemand: true,
        allowManual: true,
        warmPool: true,
        reuseExisting: true,
      },
      profiles: {},
    },
    startupTimeout: 30000,
    healthCheckInterval: 30000,
    healthCheck: {
      enabled: true,
      intervalMs: 30000,
      timeoutMs: 3000,
      maxRetries: 3,
    },
    warmPool: {
      enabled: false,
      profiles: {},
    },
    modelSelection: {
      mode: "performance",
    },
    modelAliases: {},
    ui: {
      toasts: true,
      injectSystemContext: true,
      systemContextMaxWorkers: 12,
      defaultListFormat: "markdown",
      debug: false,
      logToConsole: false,
      firstRunDemo: true,
    },
    notifications: {
      idle: { enabled: false, title: "OpenCode", message: "Session is idle", delayMs: 1500 },
    },
    agent: {
      enabled: true,
      name: "orchestrator",
      mode: "primary",
      applyToBuild: false,
    },
    commands: { enabled: true, prefix: "orchestrator." },
    pruning: {
      enabled: false,
      maxToolOutputChars: 12000,
      maxToolInputChars: 4000,
      protectedTools: ["task", "todowrite", "todoread"],
    },
    workflows: {
      enabled: true,
      roocodeBoomerang: {
        enabled: true,
        maxSteps: 4,
        maxTaskChars: 12000,
        maxCarryChars: 24000,
        perStepTimeoutMs: 120_000,
      },
    },
    security: {
      workflows: {
        maxSteps: 4,
        maxTaskChars: 12000,
        maxCarryChars: 24000,
        perStepTimeoutMs: 120_000,
      },
    },
    memory: {
      enabled: true,
      autoSpawn: true,
      autoRecord: true,
      autoInject: true,
      scope: "project",
      maxChars: 2000,
      summaries: {
        enabled: true,
        sessionMaxChars: 2000,
        projectMaxChars: 2000,
      },
      trim: {
        maxMessagesPerSession: 60,
        maxMessagesPerProject: 400,
        maxMessagesGlobal: 2000,
        maxProjectsGlobal: 25,
      },
      inject: {
        maxChars: 2000,
        maxEntries: 8,
        includeMessages: false,
        includeSessionSummary: true,
        includeProjectSummary: true,
        includeGlobal: true,
        maxGlobalEntries: 3,
      },
    },
    integrations: {
      linear: { enabled: false },
      neo4j: { enabled: false },
      monitoring: { enabled: false },
    },
    telemetry: {
      enabled: false,
    },
    profiles: [],
    workers: [],
  };

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
