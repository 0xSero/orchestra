import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  OrchestratorConfig,
  OrchestratorConfigFile,
  WorkerBackend,
  WorkerExecution,
  WorkerKind,
  WorkerProfile,
} from "../types";
import { builtInProfiles } from "./profiles";
import {
  isPlainObject,
  asBooleanRecord,
  asStringArray,
  getUserConfigDir,
  deepMerge,
} from "../helpers/format";

function isWorkerKind(value: unknown): value is WorkerKind {
  return value === "server" || value === "agent" || value === "subagent";
}

function isWorkerExecution(value: unknown): value is WorkerExecution {
  return value === "foreground" || value === "background";
}

function kindFromBackend(backend: WorkerBackend): WorkerKind {
  return backend === "agent" ? "agent" : "server";
}

function backendFromKind(kind: WorkerKind): WorkerBackend {
  return kind === "server" ? "server" : "agent";
}

export function resolveWorkerEntry(entry: unknown): WorkerProfile | undefined {
  if (typeof entry === "string") return builtInProfiles[entry];
  if (!isPlainObject(entry)) return undefined;

  const id = typeof entry.id === "string" ? entry.id : undefined;
  if (!id) return undefined;

  const base = builtInProfiles[id];
  const merged: Record<string, unknown> = { ...(base ?? {}), ...entry };

  if (
    typeof merged.id !== "string" ||
    typeof merged.name !== "string" ||
    typeof merged.model !== "string" ||
    typeof merged.purpose !== "string" ||
    typeof merged.whenToUse !== "string"
  ) {
    return undefined;
  }

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

  if ("requiredSkills" in merged) {
    const requiredSkills = asStringArray(merged.requiredSkills);
    if (!requiredSkills) return undefined;
    merged.requiredSkills = requiredSkills;
  }

  const entryBackend = "backend" in entry ? (entry as any).backend : undefined;
  if (
    entryBackend !== undefined &&
    entryBackend !== "agent" &&
    entryBackend !== "server"
  ) {
    return undefined;
  }

  const entryKind = "kind" in entry ? (entry as any).kind : undefined;
  if (entryKind !== undefined && !isWorkerKind(entryKind)) {
    return undefined;
  }

  const entryExecution =
    "execution" in entry ? (entry as any).execution : undefined;
  if (entryExecution !== undefined && !isWorkerExecution(entryExecution)) {
    return undefined;
  }

  if (entryBackend !== undefined && entryKind !== undefined) {
    const backendKind = kindFromBackend(entryBackend);
    if (entryKind !== backendKind) {
      throw new Error(
        `Worker "${id}" has conflicting backend ("${entryBackend}") and kind ("${entryKind}")`,
      );
    }
  }

  const baseBackend = base?.backend;
  const baseKind = base?.kind;
  const resolvedKind =
    entryKind ??
    (entryBackend
      ? kindFromBackend(entryBackend)
      : (baseKind ?? (baseBackend ? kindFromBackend(baseBackend) : undefined)));
  const resolvedBackend =
    entryBackend ??
    (entryKind
      ? backendFromKind(entryKind)
      : (baseBackend ?? (baseKind ? backendFromKind(baseKind) : undefined)));

  if (resolvedKind) merged.kind = resolvedKind;
  if (resolvedBackend) merged.backend = resolvedBackend;
  if (entryExecution !== undefined) merged.execution = entryExecution;

  return merged as unknown as WorkerProfile;
}

export function getDefaultGlobalOrchestratorConfigPath(): string {
  return join(getUserConfigDir(), "opencode", "orchestrator.json");
}

export function getDefaultGlobalOpenCodeConfigPath(): string {
  return join(getUserConfigDir(), "opencode", "opencode.json");
}

export function getDefaultProjectOrchestratorConfigPath(
  directory: string,
): string {
  return join(directory, ".opencode", "orchestrator.json");
}

function asConfigArray(
  value: unknown,
): Array<string | Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: Array<string | Record<string, unknown>> = [];
  for (const item of value) {
    if (typeof item === "string") out.push(item);
    else if (isPlainObject(item)) out.push(item);
  }
  return out;
}

export function parseOrchestratorConfigFile(
  raw: unknown,
): Partial<OrchestratorConfigFile> {
  if (!isPlainObject(raw)) return {};

  const partial: Partial<OrchestratorConfigFile> = {};

  if (typeof raw.basePort === "number") partial.basePort = raw.basePort;
  if (typeof raw.autoSpawn === "boolean") partial.autoSpawn = raw.autoSpawn;
  if (typeof raw.startupTimeout === "number")
    partial.startupTimeout = raw.startupTimeout;
  if (typeof raw.healthCheckInterval === "number")
    partial.healthCheckInterval = raw.healthCheckInterval;

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
    if (typeof raw.ui.injectSystemContext === "boolean")
      ui.injectSystemContext = raw.ui.injectSystemContext;
    if (typeof raw.ui.systemContextMaxWorkers === "number")
      ui.systemContextMaxWorkers = raw.ui.systemContextMaxWorkers;
    if (
      raw.ui.defaultListFormat === "markdown" ||
      raw.ui.defaultListFormat === "json"
    ) {
      ui.defaultListFormat = raw.ui.defaultListFormat;
    }
    if (typeof raw.ui.debug === "boolean") ui.debug = raw.ui.debug;
    if (typeof raw.ui.logToConsole === "boolean")
      ui.logToConsole = raw.ui.logToConsole;
    if (typeof raw.ui.firstRunDemo === "boolean")
      ui.firstRunDemo = raw.ui.firstRunDemo;
    if (typeof raw.ui.wakeupInjection === "boolean")
      ui.wakeupInjection = raw.ui.wakeupInjection;
    partial.ui = ui as OrchestratorConfig["ui"];
  }

  if (
    isPlainObject(raw.notifications) &&
    isPlainObject(raw.notifications.idle)
  ) {
    const idle: Record<string, unknown> = {};
    if (typeof raw.notifications.idle.enabled === "boolean")
      idle.enabled = raw.notifications.idle.enabled;
    if (typeof raw.notifications.idle.title === "string")
      idle.title = raw.notifications.idle.title;
    if (typeof raw.notifications.idle.message === "string")
      idle.message = raw.notifications.idle.message;
    if (typeof raw.notifications.idle.delayMs === "number")
      idle.delayMs = raw.notifications.idle.delayMs;
    partial.notifications = {
      idle: idle as OrchestratorConfig["notifications"] extends {
        idle: infer T;
      }
        ? T
        : never,
    };
  }

  if (isPlainObject(raw.agent)) {
    const agent: Record<string, unknown> = {};
    if (typeof raw.agent.enabled === "boolean")
      agent.enabled = raw.agent.enabled;
    if (typeof raw.agent.name === "string") agent.name = raw.agent.name;
    if (typeof raw.agent.model === "string") agent.model = raw.agent.model;
    if (typeof raw.agent.prompt === "string") agent.prompt = raw.agent.prompt;
    if (raw.agent.mode === "primary" || raw.agent.mode === "subagent")
      agent.mode = raw.agent.mode;
    if (typeof raw.agent.color === "string") agent.color = raw.agent.color;
    if (typeof raw.agent.applyToBuild === "boolean")
      agent.applyToBuild = raw.agent.applyToBuild;
    if (isPlainObject(raw.agent.tools)) {
      const tools = asBooleanRecord(raw.agent.tools);
      if (tools) agent.tools = tools;
    }
    if (isPlainObject(raw.agent.permission))
      agent.permission = raw.agent.permission as Record<string, unknown>;
    partial.agent = agent as OrchestratorConfig["agent"];
  }

  if (isPlainObject(raw.commands)) {
    const commands: Record<string, unknown> = {};
    if (typeof raw.commands.enabled === "boolean")
      commands.enabled = raw.commands.enabled;
    if (typeof raw.commands.prefix === "string")
      commands.prefix = raw.commands.prefix;
    partial.commands = commands as OrchestratorConfig["commands"];
  }

  if (isPlainObject(raw.pruning)) {
    const pruning: Record<string, unknown> = {};
    if (typeof raw.pruning.enabled === "boolean")
      pruning.enabled = raw.pruning.enabled;
    if (typeof raw.pruning.maxToolOutputChars === "number")
      pruning.maxToolOutputChars = raw.pruning.maxToolOutputChars;
    if (typeof raw.pruning.maxToolInputChars === "number")
      pruning.maxToolInputChars = raw.pruning.maxToolInputChars;
    if (
      Array.isArray(raw.pruning.protectedTools) &&
      raw.pruning.protectedTools.every((t: unknown) => typeof t === "string")
    ) {
      pruning.protectedTools = raw.pruning.protectedTools;
    }
    partial.pruning = pruning as OrchestratorConfig["pruning"];
  }

  if (isPlainObject(raw.workflows)) {
    const workflows: Record<string, unknown> = {};
    if (typeof raw.workflows.enabled === "boolean")
      workflows.enabled = raw.workflows.enabled;
    if (isPlainObject(raw.workflows.ui)) {
      const ui: Record<string, unknown> = {};
      if (
        raw.workflows.ui.execution === "step" ||
        raw.workflows.ui.execution === "auto"
      ) {
        ui.execution = raw.workflows.ui.execution;
      }
      if (
        raw.workflows.ui.intervene === "never" ||
        raw.workflows.ui.intervene === "on-warning" ||
        raw.workflows.ui.intervene === "on-error" ||
        raw.workflows.ui.intervene === "always"
      ) {
        ui.intervene = raw.workflows.ui.intervene;
      }
      if (Object.keys(ui).length > 0) workflows.ui = ui;
    }
    if (Array.isArray(raw.workflows.definitions)) {
      const definitions = raw.workflows.definitions
        .map((def: unknown) => {
          if (!isPlainObject(def)) return undefined;
          const id = typeof def.id === "string" ? def.id : undefined;
          if (!id) return undefined;
          const name = typeof def.name === "string" ? def.name : undefined;
          const description =
            typeof def.description === "string" ? def.description : undefined;
          if (!Array.isArray(def.steps)) return undefined;
          const steps = def.steps
            .map((step: unknown) => {
              if (!isPlainObject(step)) return undefined;
              const stepId = typeof step.id === "string" ? step.id : undefined;
              if (!stepId) return undefined;
              const entry: Record<string, unknown> = { id: stepId };
              if (typeof step.title === "string") entry.title = step.title;
              if (typeof step.workerId === "string")
                entry.workerId = step.workerId;
              if (typeof step.prompt === "string") entry.prompt = step.prompt;
              if (typeof step.carry === "boolean") entry.carry = step.carry;
              if (typeof step.timeoutMs === "number")
                entry.timeoutMs = step.timeoutMs;
              return entry;
            })
            .filter(Boolean);
          if (steps.length === 0) return undefined;
          const definition: Record<string, unknown> = { id, steps };
          if (name) definition.name = name;
          if (description) definition.description = description;
          return definition;
        })
        .filter(Boolean);
      if (definitions.length > 0) workflows.definitions = definitions;
    }
    if (isPlainObject(raw.workflows.triggers)) {
      const triggers: Record<string, unknown> = {};
      if (isPlainObject(raw.workflows.triggers.visionOnImage)) {
        const vision: Record<string, unknown> = {};
        if (typeof raw.workflows.triggers.visionOnImage.enabled === "boolean") {
          vision.enabled = raw.workflows.triggers.visionOnImage.enabled;
        }
        if (
          typeof raw.workflows.triggers.visionOnImage.workflowId === "string"
        ) {
          vision.workflowId = raw.workflows.triggers.visionOnImage.workflowId;
        }
        if (
          typeof raw.workflows.triggers.visionOnImage.autoSpawn === "boolean"
        ) {
          vision.autoSpawn = raw.workflows.triggers.visionOnImage.autoSpawn;
        }
        if (
          typeof raw.workflows.triggers.visionOnImage.blocking === "boolean"
        ) {
          vision.blocking = raw.workflows.triggers.visionOnImage.blocking;
        }
        triggers.visionOnImage = vision;
      }
      if (isPlainObject(raw.workflows.triggers.memoryOnTurnEnd)) {
        const memory: Record<string, unknown> = {};
        if (
          typeof raw.workflows.triggers.memoryOnTurnEnd.enabled === "boolean"
        ) {
          memory.enabled = raw.workflows.triggers.memoryOnTurnEnd.enabled;
        }
        if (
          typeof raw.workflows.triggers.memoryOnTurnEnd.workflowId === "string"
        ) {
          memory.workflowId = raw.workflows.triggers.memoryOnTurnEnd.workflowId;
        }
        if (
          typeof raw.workflows.triggers.memoryOnTurnEnd.autoSpawn === "boolean"
        ) {
          memory.autoSpawn = raw.workflows.triggers.memoryOnTurnEnd.autoSpawn;
        }
        if (
          typeof raw.workflows.triggers.memoryOnTurnEnd.blocking === "boolean"
        ) {
          memory.blocking = raw.workflows.triggers.memoryOnTurnEnd.blocking;
        }
        triggers.memoryOnTurnEnd = memory;
      }
      if (Object.keys(triggers).length > 0) workflows.triggers = triggers;
    }
    if (isPlainObject(raw.workflows.roocodeBoomerang)) {
      const roocode: Record<string, unknown> = {};
      if (typeof raw.workflows.roocodeBoomerang.enabled === "boolean")
        roocode.enabled = raw.workflows.roocodeBoomerang.enabled;
      if (typeof raw.workflows.roocodeBoomerang.maxSteps === "number")
        roocode.maxSteps = raw.workflows.roocodeBoomerang.maxSteps;
      if (typeof raw.workflows.roocodeBoomerang.maxTaskChars === "number")
        roocode.maxTaskChars = raw.workflows.roocodeBoomerang.maxTaskChars;
      if (typeof raw.workflows.roocodeBoomerang.maxCarryChars === "number")
        roocode.maxCarryChars = raw.workflows.roocodeBoomerang.maxCarryChars;
      if (typeof raw.workflows.roocodeBoomerang.perStepTimeoutMs === "number") {
        roocode.perStepTimeoutMs =
          raw.workflows.roocodeBoomerang.perStepTimeoutMs;
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
            if (typeof s.timeoutMs === "number") step.timeoutMs = s.timeoutMs;
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
      if (typeof raw.security.workflows.maxSteps === "number")
        workflows.maxSteps = raw.security.workflows.maxSteps;
      if (typeof raw.security.workflows.maxTaskChars === "number")
        workflows.maxTaskChars = raw.security.workflows.maxTaskChars;
      if (typeof raw.security.workflows.maxCarryChars === "number")
        workflows.maxCarryChars = raw.security.workflows.maxCarryChars;
      if (typeof raw.security.workflows.perStepTimeoutMs === "number") {
        workflows.perStepTimeoutMs = raw.security.workflows.perStepTimeoutMs;
      }
      security.workflows = workflows;
    }
    partial.security = security as OrchestratorConfig["security"];
  }

  if (isPlainObject(raw.memory)) {
    const memory: Record<string, unknown> = {};
    if (typeof raw.memory.enabled === "boolean")
      memory.enabled = raw.memory.enabled;
    if (typeof raw.memory.autoSpawn === "boolean")
      memory.autoSpawn = raw.memory.autoSpawn;
    if (typeof raw.memory.autoRecord === "boolean")
      memory.autoRecord = raw.memory.autoRecord;
    if (typeof raw.memory.autoInject === "boolean")
      memory.autoInject = raw.memory.autoInject;
    if (raw.memory.scope === "project" || raw.memory.scope === "global")
      memory.scope = raw.memory.scope;
    if (typeof raw.memory.maxChars === "number")
      memory.maxChars = raw.memory.maxChars;

    if (isPlainObject(raw.memory.summaries)) {
      const summaries: Record<string, unknown> = {};
      if (typeof raw.memory.summaries.enabled === "boolean")
        summaries.enabled = raw.memory.summaries.enabled;
      if (typeof raw.memory.summaries.sessionMaxChars === "number")
        summaries.sessionMaxChars = raw.memory.summaries.sessionMaxChars;
      if (typeof raw.memory.summaries.projectMaxChars === "number")
        summaries.projectMaxChars = raw.memory.summaries.projectMaxChars;
      memory.summaries = summaries;
    }

    if (isPlainObject(raw.memory.trim)) {
      const trim: Record<string, unknown> = {};
      if (typeof raw.memory.trim.maxMessagesPerSession === "number")
        trim.maxMessagesPerSession = raw.memory.trim.maxMessagesPerSession;
      if (typeof raw.memory.trim.maxMessagesPerProject === "number")
        trim.maxMessagesPerProject = raw.memory.trim.maxMessagesPerProject;
      if (typeof raw.memory.trim.maxMessagesGlobal === "number")
        trim.maxMessagesGlobal = raw.memory.trim.maxMessagesGlobal;
      if (typeof raw.memory.trim.maxProjectsGlobal === "number")
        trim.maxProjectsGlobal = raw.memory.trim.maxProjectsGlobal;
      memory.trim = trim;
    }

    if (isPlainObject(raw.memory.inject)) {
      const inject: Record<string, unknown> = {};
      if (typeof raw.memory.inject.maxChars === "number")
        inject.maxChars = raw.memory.inject.maxChars;
      if (typeof raw.memory.inject.maxEntries === "number")
        inject.maxEntries = raw.memory.inject.maxEntries;
      if (typeof raw.memory.inject.includeMessages === "boolean")
        inject.includeMessages = raw.memory.inject.includeMessages;
      if (typeof raw.memory.inject.includeSessionSummary === "boolean")
        inject.includeSessionSummary = raw.memory.inject.includeSessionSummary;
      if (typeof raw.memory.inject.includeProjectSummary === "boolean")
        inject.includeProjectSummary = raw.memory.inject.includeProjectSummary;
      if (typeof raw.memory.inject.includeGlobal === "boolean")
        inject.includeGlobal = raw.memory.inject.includeGlobal;
      if (typeof raw.memory.inject.maxGlobalEntries === "number")
        inject.maxGlobalEntries = raw.memory.inject.maxGlobalEntries;
      memory.inject = inject;
    }
    partial.memory = memory as OrchestratorConfig["memory"];
  }

  if (isPlainObject(raw.telemetry)) {
    const telemetry: Record<string, unknown> = {};
    if (typeof raw.telemetry.enabled === "boolean")
      telemetry.enabled = raw.telemetry.enabled;
    if (typeof raw.telemetry.apiKey === "string")
      telemetry.apiKey = raw.telemetry.apiKey;
    if (typeof raw.telemetry.host === "string")
      telemetry.host = raw.telemetry.host;
    partial.telemetry = telemetry as OrchestratorConfig["telemetry"];
  }

  return partial;
}

function collectProfilesAndSpawn(input: OrchestratorConfigFile): {
  profiles: Record<string, WorkerProfile>;
  spawn: string[];
} {
  const profiles: Record<string, WorkerProfile> = { ...builtInProfiles };
  const spawn: string[] = [];
  const seen = new Set<string>();

  const registerProfile = (entry: unknown): WorkerProfile | undefined => {
    const resolved = resolveWorkerEntry(entry);
    if (resolved) profiles[resolved.id] = resolved;
    return resolved;
  };

  const enqueueSpawn = (id: string | undefined) => {
    if (!id) return;
    if (!(id in profiles)) return;
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
    startupTimeout: 30000,
    healthCheckInterval: 30000,
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
      idle: {
        enabled: false,
        title: "OpenCode",
        message: "Session is idle",
        delayMs: 1500,
      },
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
      definitions: [],
      triggers: {
        visionOnImage: {
          enabled: true,
          workflowId: "vision",
          autoSpawn: true,
          blocking: false,
        },
        memoryOnTurnEnd: {
          enabled: true,
          workflowId: "memory",
          autoSpawn: true,
          blocking: false,
        },
      },
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
    telemetry: {
      enabled: false,
    },
    profiles: [],
    workers: [],
  };

  const globalPath = getDefaultGlobalOrchestratorConfigPath();
  const projectCandidates = [
    getDefaultProjectOrchestratorConfigPath(input.directory),
    input.worktree
      ? getDefaultProjectOrchestratorConfigPath(input.worktree)
      : undefined,
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
    deepMerge(
      defaultsFile as unknown as Record<string, unknown>,
      globalPartial as unknown as Record<string, unknown>,
    ),
    projectPartial as unknown as Record<string, unknown>,
  ) as unknown as OrchestratorConfigFile;

  const { profiles, spawn } = collectProfilesAndSpawn(mergedFile);
  const spawnList = [...spawn];
  if (
    mergedFile.memory?.enabled !== false &&
    mergedFile.memory?.autoSpawn !== false
  ) {
    if (profiles.memory && !spawnList.includes("memory")) {
      spawnList.push("memory");
    }
  }

  const config: OrchestratorConfig = {
    basePort: mergedFile.basePort ?? defaultsFile.basePort ?? 14096,
    autoSpawn: mergedFile.autoSpawn ?? defaultsFile.autoSpawn ?? true,
    startupTimeout:
      mergedFile.startupTimeout ?? defaultsFile.startupTimeout ?? 30000,
    healthCheckInterval:
      mergedFile.healthCheckInterval ??
      defaultsFile.healthCheckInterval ??
      30000,
    ui: (mergedFile.ui ?? defaultsFile.ui) as OrchestratorConfig["ui"],
    notifications: (mergedFile.notifications ??
      defaultsFile.notifications) as OrchestratorConfig["notifications"],
    agent: (mergedFile.agent ??
      defaultsFile.agent) as OrchestratorConfig["agent"],
    commands: (mergedFile.commands ??
      defaultsFile.commands) as OrchestratorConfig["commands"],
    pruning: (mergedFile.pruning ??
      defaultsFile.pruning) as OrchestratorConfig["pruning"],
    workflows: (mergedFile.workflows ??
      defaultsFile.workflows) as OrchestratorConfig["workflows"],
    security: (mergedFile.security ??
      defaultsFile.security) as OrchestratorConfig["security"],
    memory: (mergedFile.memory ??
      defaultsFile.memory) as OrchestratorConfig["memory"],
    telemetry: (mergedFile.telemetry ??
      defaultsFile.telemetry) as OrchestratorConfig["telemetry"],
    profiles,
    spawn: spawnList,
  };

  return { config, sources };
}
