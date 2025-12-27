/**
 * Worker Profile Factory
 *
 * Profiles (skills) are loaded from:
 * 1. .opencode/skill/{id}/SKILL.md (primary source)
 * 2. orchestrator.json profiles[] (optional overrides)
 *
 * No hardcoded profiles - everything is defined in SKILL.md files.
 */

import { resolveProfileInheritance, type WorkerProfileDefinition } from "../../config/profile-inheritance";
import { skillToProfile } from "../../skills/convert";
import { loadAllSkills } from "../../skills/loader";
import type { WorkerProfile } from "../../types";

/**
 * Get all profiles from skills directory.
 * This is the primary source of truth for worker profiles.
 */
export async function loadSubagentProfiles(projectDir?: string): Promise<Record<string, WorkerProfile>> {
  const skills = await loadAllSkills(projectDir);
  const profiles: Record<string, WorkerProfile> = {};

  for (const [id, skill] of skills) {
    profiles[id] = skillToProfile(skill);
  }

  return profiles;
}

/**
 * Apply config overrides from orchestrator.json profiles[].
 * This allows runtime customization without editing SKILL.md files.
 */
export function applyProfileOverrides(
  baseProfiles: Record<string, WorkerProfile>,
  overrides?: Array<Partial<WorkerProfile> & { id: string }>,
): Record<string, WorkerProfile> {
  if (!overrides || overrides.length === 0) return baseProfiles;

  const result = { ...baseProfiles };

  for (const override of overrides) {
    if (!override.id) continue;

    const base = result[override.id];
    if (base) {
      // Merge override into existing profile
      result[override.id] = {
        ...base,
        ...override,
        // Preserve nested objects with merge
        tools: { ...base.tools, ...override.tools },
        permissions: override.permissions ?? base.permissions,
        tags: override.tags ?? base.tags,
      };
    } else {
      // Create new profile from override (must have required fields)
      if (override.name && override.model && override.purpose && override.whenToUse) {
        result[override.id] = override as WorkerProfile;
      }
    }
  }

  return result;
}

/**
 * Get a single profile by ID.
 */
export function getProfile(id: string, profiles: Record<string, WorkerProfile>): WorkerProfile | undefined {
  return profiles[id];
}

/**
 * Validate that a profile has all required fields.
 */
export function validateProfile(profile: Partial<WorkerProfile>): string[] {
  const errors: string[] = [];

  if (!profile.id) errors.push("id is required");
  if (!profile.name) errors.push("name is required");
  if (!profile.model) errors.push("model is required");
  if (!profile.purpose) errors.push("purpose is required");
  if (!profile.whenToUse) errors.push("whenToUse is required");

  return errors;
}

/**
 * Main entry point: Load all profiles with inheritance resolution.
 *
 * @param projectDir - Project directory for project-scoped skills
 * @param configOverrides - Optional overrides from orchestrator.json profiles[]
 */
export async function getAllProfiles(
  projectDir?: string,
  configOverrides?: Array<Partial<WorkerProfile> & { id: string }>,
): Promise<Record<string, WorkerProfile>> {
  // 1. Load base profiles from skills
  const baseProfiles = await loadSubagentProfiles(projectDir);

  // 2. Apply config overrides
  const withOverrides = applyProfileOverrides(baseProfiles, configOverrides);

  // 3. Resolve inheritance (extends/compose)
  const definitions: Record<string, WorkerProfileDefinition> = {};
  for (const [id, profile] of Object.entries(withOverrides)) {
    if (profile.extends || profile.compose) {
      definitions[id] = profile;
    }
  }

  if (Object.keys(definitions).length === 0) {
    return withOverrides;
  }

  // Separate base profiles (no inheritance) from those needing resolution
  const builtIns: Record<string, WorkerProfile> = {};
  for (const [id, profile] of Object.entries(withOverrides)) {
    if (!profile.extends && !profile.compose) {
      builtIns[id] = profile;
    }
  }

  return resolveProfileInheritance({ builtIns, definitions });
}

/**
 * List available profile IDs.
 */
export async function listProfileIds(projectDir?: string): Promise<string[]> {
  const profiles = await loadSubagentProfiles(projectDir);
  return Object.keys(profiles).sort();
}

// =============================================================================
// Legacy compatibility exports (deprecated, will be removed)
// =============================================================================

/** @deprecated Use getAllProfiles() instead */
export const builtInProfiles: Record<string, WorkerProfile> = {};

/** @deprecated Use getAllProfiles() instead */
export async function getAllProfilesWithSkills(
  projectDir?: string,
  _baseProfiles?: Record<string, WorkerProfile>,
): Promise<Record<string, WorkerProfile>> {
  return getAllProfiles(projectDir);
}

/** @deprecated Use applyProfileOverrides() instead */
export function mergeProfile(baseId: string, _: Partial<WorkerProfile>): WorkerProfile {
  throw new Error(
    `mergeProfile() is deprecated. Profiles are now loaded from .opencode/skill/. ` +
      `Create a SKILL.md file for "${baseId}" or use orchestrator.json profiles[] for overrides.`,
  );
}
