import { isPlainObject } from "../../helpers/format";
import type { OrchestratorConfig, OrchestratorConfigFile, SpawnPolicy } from "../../types";
import { parseIntegrationsSection, parseMemorySection, parseTelemetrySection } from "./parse-extra";
import { asConfigArray, parseSpawnPolicyEntry } from "./parse-workers";

export { collectProfilesAndSpawn } from "./parse-workers";

/** Parse orchestrator.json into a partial typed config. */
export function parseOrchestratorConfigFile(raw: unknown): Partial<OrchestratorConfigFile> {
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
    if (
      raw.modelSelection.mode === "performance" ||
      raw.modelSelection.mode === "balanced" ||
      raw.modelSelection.mode === "economical"
    ) {
      modelSelection.mode = raw.modelSelection.mode;
    }
    if (typeof raw.modelSelection.maxCostPer1kTokens === "number")
      modelSelection.maxCostPer1kTokens = raw.modelSelection.maxCostPer1kTokens;
    if (
      Array.isArray(raw.modelSelection.preferredProviders) &&
      raw.modelSelection.preferredProviders.every((p: unknown) => typeof p === "string")
    ) {
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
    // profiles is Array<string | Record<string, unknown>> which matches OrchestratorConfigFile["profiles"]
    if (profiles) partial.profiles = profiles as OrchestratorConfigFile["profiles"];
  }

  if ("workers" in raw) {
    const workers = asConfigArray(raw.workers);
    // workers is Array<string | Record<string, unknown>> which matches OrchestratorConfigFile["workers"]
    if (workers) partial.workers = workers as OrchestratorConfigFile["workers"];
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
    if (typeof raw.workflows.enabled === "boolean") workflows.enabled = raw.workflows.enabled;
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

  parseMemorySection(raw, partial);
  parseIntegrationsSection(raw, partial);
  parseTelemetrySection(raw, partial);

  return partial;
}

/**
 * Collect profile overrides and spawn list from orchestrator.json config.
 *
 * Profiles are now primarily loaded from SKILL.md files in .opencode/skill/.
 * This function processes config file overrides and determines which workers to spawn.
 *
 * @param input - Parsed orchestrator.json config
 * @param baseProfiles - Profiles loaded from SKILL.md files (optional, for merging)
 */
