import type { Skill } from "../types";

/**
 * Load builtin skills.
 *
 * With the new skill system, there are no hardcoded builtins.
 * All profiles come from .opencode/skill/ SKILL.md files.
 *
 * This function returns an empty map for backwards compatibility.
 * It will be removed in a future version.
 *
 * @deprecated Profiles are now loaded from .opencode/skill/
 */
export function loadBuiltinSkills(): Map<string, Skill> {
  // No more hardcoded builtins - everything comes from SKILL.md files
  return new Map();
}
