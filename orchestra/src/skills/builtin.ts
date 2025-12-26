import type { Skill } from "../types";

/**
 * Load builtin skills.
 *
 * With the new subagent system, there are no hardcoded builtins.
 * All profiles come from .opencode/agent/subagents/ SKILL.md files.
 *
 * This function returns an empty map for backwards compatibility.
 * It will be removed in a future version.
 *
 * @deprecated Profiles are now loaded from .opencode/agent/subagents/
 */
export function loadBuiltinSkills(): Map<string, Skill> {
  // No more hardcoded builtins - everything comes from SKILL.md files
  return new Map();
}
