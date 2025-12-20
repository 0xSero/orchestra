import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OrchestratorConfig, OrchestratorConfigFile, WorkerProfile } from "../types";
import { builtInProfiles } from "./profiles";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asBooleanRecord(value: unknown): Record<string, boolean> | undefined {
  if (!isPlainObject(value)) return undefined;
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v !== "boolean") return undefined;
    out[k] = v;
  }
  return out;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  if (value.every((v) => typeof v === "string")) return value;
  return undefined;
}

function resolveWorkerEntry(entry: unknown): WorkerProfile | undefined {
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

  return merged as unknown as WorkerProfile;
}

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (Array.isArray(v)) {
      out[k] = v;
    } else if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = deepMerge(out[k] as Record<string, unknown>, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function getUserConfigDir(): string {
  // Linux/macOS: respect XDG_CONFIG_HOME; Windows best-effort.
  if (process.platform === "win32") {
    return process.env.APPDATA || join(homedir(), "AppData", "Roaming");
  }
  return process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
}

export function getDefaultGlobalOrchestratorConfigPath(): string {
  return join(getUserConfigDir(), "opencode", "orchestrator.json");
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
  if (typeof raw.startupTimeout === "number") partial.startupTimeout = raw.startupTimeout;
  if (typeof raw.healthCheckInterval === "number") partial.healthCheckInterval = raw.healthCheckInterval;

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

  if (isPlainObject((raw as any).workflows)) {
    const wraw = (raw as any).workflows as Record<string, unknown>;
    const workflows: Record<string, unknown> = {};
    if (typeof (wraw as any).enabled === "boolean") workflows.enabled = (wraw as any).enabled;
    if (Array.isArray((wraw as any).allow) && (wraw as any).allow.every((x: unknown) => typeof x === "string")) {
      workflows.allow = (wraw as any).allow;
    }
    if (isPlainObject((wraw as any).roocodeBoomerang)) {
      const rraw = (wraw as any).roocodeBoomerang as Record<string, unknown>;
      const rb: Record<string, unknown> = {};
      if (typeof (rraw as any).enabled === "boolean") rb.enabled = (rraw as any).enabled;
      if (typeof (rraw as any).maxSteps === "number") rb.maxSteps = (rraw as any).maxSteps;
      if (typeof (rraw as any).perStepTimeoutMs === "number") rb.perStepTimeoutMs = (rraw as any).perStepTimeoutMs;
      if (typeof (rraw as any).maxTaskChars === "number") rb.maxTaskChars = (rraw as any).maxTaskChars;
      if (typeof (rraw as any).maxCarryChars === "number") rb.maxCarryChars = (rraw as any).maxCarryChars;
      if (Array.isArray((rraw as any).steps)) {
        const steps = (rraw as any).steps as unknown[];
        const parsedSteps: any[] = [];
        for (const s of steps) {
          if (!isPlainObject(s)) continue;
          const id = typeof (s as any).id === "string" ? (s as any).id : undefined;
          const profileId = typeof (s as any).profileId === "string" ? (s as any).profileId : undefined;
          const prompt = typeof (s as any).prompt === "string" ? (s as any).prompt : undefined;
          if (!id || !profileId || !prompt) continue;
          const step: any = { id, profileId, prompt };
          if (typeof (s as any).forwardAttachments === "boolean") step.forwardAttachments = (s as any).forwardAttachments;
          parsedSteps.push(step);
        }
        rb.steps = parsedSteps;
      }
      workflows.roocodeBoomerang = rb;
    }
    partial.workflows = workflows as OrchestratorConfig["workflows"];
  }

  if (isPlainObject((raw as any).security)) {
    const sraw = (raw as any).security as Record<string, unknown>;
    const security: Record<string, unknown> = {};
    if (typeof (sraw as any).blockSecretsInMemory === "boolean") security.blockSecretsInMemory = (sraw as any).blockSecretsInMemory;
    if (isPlainObject((sraw as any).attachments)) {
      const araw = (sraw as any).attachments as Record<string, unknown>;
      const attachments: Record<string, unknown> = {};
      if (typeof (araw as any).allowFileAttachments === "boolean") attachments.allowFileAttachments = (araw as any).allowFileAttachments;
      if (typeof (araw as any).maxFileBytes === "number") attachments.maxFileBytes = (araw as any).maxFileBytes;
      if (typeof (araw as any).maxBase64Chars === "number") attachments.maxBase64Chars = (araw as any).maxBase64Chars;
      if (typeof (araw as any).maxAttachments === "number") attachments.maxAttachments = (araw as any).maxAttachments;
      security.attachments = attachments;
    }
    partial.security = security as OrchestratorConfig["security"];
  }

  return partial;
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
    },
    notifications: {
      idle: { enabled: false, title: "OpenCode", message: "Session is idle", delayMs: 1500 },
    },
    agent: {
      enabled: true,
      name: "orchestrator",
      mode: "primary",
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
        perStepTimeoutMs: 120000,
        maxTaskChars: 12000,
        maxCarryChars: 24000,
      },
    },
    security: {
      blockSecretsInMemory: true,
      attachments: {
        allowFileAttachments: false,
        maxFileBytes: 10 * 1024 * 1024,
        maxBase64Chars: 14 * 1024 * 1024,
        maxAttachments: 8,
      },
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

  const profiles: Record<string, WorkerProfile> = { ...builtInProfiles };

  for (const entry of mergedFile.profiles ?? []) {
    const p = resolveWorkerEntry(entry);
    if (p) profiles[p.id] = p;
  }
  // Back-compat: allow inline profile definitions in `workers`
  for (const entry of mergedFile.workers ?? []) {
    if (typeof entry === "string") continue;
    const p = resolveWorkerEntry(entry);
    if (p) profiles[p.id] = p;
  }

  const spawn = (mergedFile.workers ?? [])
    .map((entry) => (typeof entry === "string" ? entry : (resolveWorkerEntry(entry)?.id ?? "")))
    .filter((id) => typeof id === "string" && id.length > 0);
  const spawnUnique = [...new Set(spawn)].filter((id) => id in profiles);

  const config: OrchestratorConfig = {
    basePort: mergedFile.basePort ?? defaultsFile.basePort ?? 14096,
    autoSpawn: mergedFile.autoSpawn ?? defaultsFile.autoSpawn ?? true,
    startupTimeout: mergedFile.startupTimeout ?? defaultsFile.startupTimeout ?? 30000,
    healthCheckInterval: mergedFile.healthCheckInterval ?? defaultsFile.healthCheckInterval ?? 30000,
    ui: (mergedFile.ui ?? defaultsFile.ui) as OrchestratorConfig["ui"],
    notifications: (mergedFile.notifications ?? defaultsFile.notifications) as OrchestratorConfig["notifications"],
    agent: (mergedFile.agent ?? defaultsFile.agent) as OrchestratorConfig["agent"],
    commands: (mergedFile.commands ?? defaultsFile.commands) as OrchestratorConfig["commands"],
    pruning: (mergedFile.pruning ?? defaultsFile.pruning) as OrchestratorConfig["pruning"],
    workflows: (mergedFile.workflows ?? defaultsFile.workflows) as OrchestratorConfig["workflows"],
    security: (mergedFile.security ?? defaultsFile.security) as OrchestratorConfig["security"],
    profiles,
    spawn: spawnUnique,
  };

  return { config, sources };
}
