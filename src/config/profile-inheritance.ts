import type { ToolPermissions, WorkerProfile } from "../types";
import { mergeToolPermissions } from "../permissions/validator";

export type WorkerProfileDefinition = Partial<WorkerProfile> & {
  id: string;
  extends?: string;
  compose?: string[];
};

function mergeTags(base?: string[], override?: string[]): string[] | undefined {
  const merged = [...(base ?? []), ...(override ?? [])].filter((t) => typeof t === "string" && t.length > 0);
  if (merged.length === 0) return undefined;
  return Array.from(new Set(merged));
}

function mergeTools(
  base?: Record<string, boolean>,
  override?: Record<string, boolean>
): Record<string, boolean> | undefined {
  if (!base && !override) return undefined;
  return { ...(base ?? {}), ...(override ?? {}) };
}

function mergeProfiles(base: WorkerProfile, override: WorkerProfileDefinition): WorkerProfile {
  return {
    ...base,
    ...override,
    tools: mergeTools(base.tools, override.tools),
    tags: mergeTags(base.tags, override.tags),
    permissions: mergeToolPermissions(base.permissions, override.permissions as ToolPermissions | undefined),
    id: override.id ?? base.id,
  };
}

export function resolveProfileInheritance(input: {
  builtIns: Record<string, WorkerProfile>;
  definitions: Record<string, WorkerProfileDefinition>;
}): Record<string, WorkerProfile> {
  const resolved = new Map<string, WorkerProfile>();
  const resolving = new Set<string>();

  const resolve = (id: string): WorkerProfile => {
    if (resolved.has(id)) return resolved.get(id)!;
    if (resolving.has(id)) throw new Error(`Profile inheritance cycle detected at "${id}"`);

    const def = input.definitions[id] ?? input.builtIns[id];
    if (!def) throw new Error(`Unknown profile "${id}"`);

    resolving.add(id);

    let merged: WorkerProfile | undefined;

    const composeList = Array.isArray(def.compose) ? def.compose : [];
    if (composeList.length > 0) {
      for (const baseId of composeList) {
        const base = resolve(baseId);
        merged = merged ? mergeProfiles(merged, base) : base;
      }
    }

    if (def.extends) {
      const base = resolve(def.extends);
      merged = merged ? mergeProfiles(merged, base) : base;
    }

    if (!merged) {
      merged = input.builtIns[id] ?? (def as WorkerProfile);
    }

    const finalProfile = mergeProfiles(merged, def);

    if (
      typeof finalProfile.id !== "string" ||
      typeof finalProfile.name !== "string" ||
      typeof finalProfile.model !== "string" ||
      typeof finalProfile.purpose !== "string" ||
      typeof finalProfile.whenToUse !== "string"
    ) {
      throw new Error(`Profile "${id}" is missing required fields (id, name, model, purpose, whenToUse).`);
    }

    resolved.set(id, finalProfile);
    resolving.delete(id);
    return finalProfile;
  };

  const output: Record<string, WorkerProfile> = {};
  const allIds = new Set<string>([...Object.keys(input.builtIns), ...Object.keys(input.definitions)]);
  for (const id of allIds) {
    output[id] = resolve(id);
  }

  return output;
}
