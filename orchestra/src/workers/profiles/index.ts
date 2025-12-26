import type { WorkerProfile } from "../../types";

import { profile as vision } from "./vision/profile";
import { profile as docs } from "./docs/profile";
import { profile as coder } from "./coder/profile";
import { profile as architect } from "./architect/profile";
import { profile as explorer } from "./explorer/profile";
import { profile as memory } from "./memory/profile";
import { profile as reviewer } from "./reviewer/profile";
import { profile as qa } from "./qa/profile";
import { profile as security } from "./security/profile";
import { profile as product } from "./product/profile";
import { profile as analyst } from "./analyst/profile";
import { loadSkillOverrides } from "../../skills/loader";
import { skillToProfile } from "../../skills/convert";
import { resolveProfileInheritance, type WorkerProfileDefinition } from "../../config/profile-inheritance";

export const builtInProfiles: Record<string, WorkerProfile> = {
  vision,
  docs,
  coder,
  architect,
  explorer,
  memory,
  reviewer,
  qa,
  security,
  product,
  analyst,
};

export function getAllProfiles(): Record<string, WorkerProfile> {
  return { ...builtInProfiles };
}

export function getProfile(id: string, customProfiles?: Record<string, WorkerProfile>): WorkerProfile | undefined {
  return customProfiles?.[id] ?? builtInProfiles[id];
}

export function mergeProfile(baseId: string, overrides: Partial<WorkerProfile>): WorkerProfile {
  const base = builtInProfiles[baseId];
  if (!base) throw new Error(`Unknown base profile: ${baseId}`);
  return {
    ...base,
    ...overrides,
    id: overrides.id ?? base.id,
  };
}

export async function getAllProfilesWithSkills(
  projectDir?: string,
  baseProfiles: Record<string, WorkerProfile> = getAllProfiles()
): Promise<Record<string, WorkerProfile>> {
  const overrides = await loadSkillOverrides(projectDir);
  if (overrides.size === 0) return { ...baseProfiles };

  const definitions: Record<string, WorkerProfileDefinition> = {};
  for (const skill of overrides.values()) {
    definitions[skill.id] = skillToProfile(skill);
  }

  const resolved = resolveProfileInheritance({ builtIns: baseProfiles, definitions });
  const resolvedOverrides: Record<string, WorkerProfile> = {};
  for (const id of Object.keys(definitions)) {
    resolvedOverrides[id] = resolved[id];
  }

  return { ...baseProfiles, ...resolvedOverrides };
}
