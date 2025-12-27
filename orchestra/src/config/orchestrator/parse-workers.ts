import { asBooleanRecord, asStringArray, isPlainObject } from "../../helpers/format";
import type { OrchestratorConfigFile, SpawnPolicy, ToolPermissions, WorkerProfile } from "../../types";
import { resolveProfileInheritance, type WorkerProfileDefinition } from "../profile-inheritance";

const parsePermissions = (value: unknown): ToolPermissions | undefined => {
  if (!isPlainObject(value)) return undefined;
  const out: ToolPermissions = {};
  if (isPlainObject(value.categories)) {
    out.categories = {};
    if (
      value.categories.filesystem === "full" ||
      value.categories.filesystem === "read" ||
      value.categories.filesystem === "none"
    ) {
      out.categories.filesystem = value.categories.filesystem;
    }
    if (
      value.categories.execution === "full" ||
      value.categories.execution === "sandboxed" ||
      value.categories.execution === "none"
    ) {
      out.categories.execution = value.categories.execution;
    }
    if (
      value.categories.network === "full" ||
      value.categories.network === "localhost" ||
      value.categories.network === "none"
    ) {
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
};

/** Parse a spawn policy object from config. */
export const parseSpawnPolicyEntry = (value: unknown): SpawnPolicy | undefined => {
  if (!isPlainObject(value)) return undefined;
  const out: SpawnPolicy = {};
  if (typeof value.autoSpawn === "boolean") out.autoSpawn = value.autoSpawn;
  if (typeof value.onDemand === "boolean") out.onDemand = value.onDemand;
  if (typeof value.allowManual === "boolean") out.allowManual = value.allowManual;
  if (typeof value.warmPool === "boolean") out.warmPool = value.warmPool;
  if (typeof value.reuseExisting === "boolean") out.reuseExisting = value.reuseExisting;
  return out;
};

const resolveWorkerEntry = (
  entry: unknown,
  baseProfiles: Record<string, WorkerProfile> = {},
): WorkerProfileDefinition | undefined => {
  if (typeof entry === "string") {
    return baseProfiles[entry] ?? ({ id: entry } as WorkerProfileDefinition);
  }
  if (!isPlainObject(entry)) return undefined;

  const id = typeof entry.id === "string" ? entry.id : undefined;
  if (!id) return undefined;

  const base = baseProfiles[id];
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
};

/** Normalize config arrays to a string or object list. */
export const asConfigArray = (value: unknown): Array<string | Record<string, unknown>> | undefined => {
  if (!Array.isArray(value)) return undefined;
  const out: Array<string | Record<string, unknown>> = [];
  for (const item of value) {
    if (typeof item === "string") out.push(item);
    else if (isPlainObject(item)) out.push(item);
  }
  return out;
};

/** Resolve profile overrides and spawn targets from orchestrator config. */
export const collectProfilesAndSpawn = (
  input: OrchestratorConfigFile,
  baseProfiles: Record<string, WorkerProfile> = {},
): {
  profiles: Record<string, WorkerProfile>;
  spawn: string[];
} => {
  const definitions: Record<string, WorkerProfileDefinition> = {};
  const spawn: string[] = [];
  const seen = new Set<string>();

  const registerProfile = (entry: unknown): WorkerProfileDefinition | undefined => {
    const resolved = resolveWorkerEntry(entry, baseProfiles);
    if (resolved) definitions[resolved.id] = resolved;
    return resolved;
  };

  const enqueueSpawn = (id: string | undefined) => {
    if (!id) return;
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

  const profiles = resolveProfileInheritance({ builtIns: baseProfiles, definitions });
  return { profiles, spawn };
};
