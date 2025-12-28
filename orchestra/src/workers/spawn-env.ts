/* c8 ignore file */
import type { SkillPermissions } from "../types/permissions";
import type { WorkerProfile, WorkerSessionMode } from "../types";

/** Build environment variables for a worker based on profile settings. */
export const resolveWorkerEnv = (
  profile: WorkerProfile,
  integrationEnv?: Record<string, string>,
): Record<string, string> => {
  const env: Record<string, string> = {};

  if (profile.envPrefixes && profile.envPrefixes.length > 0) {
    for (const [key, value] of Object.entries(process.env)) {
      if (!value) continue;
      for (const prefix of profile.envPrefixes) {
        if (key.startsWith(prefix)) {
          env[key] = value;
          break;
        }
      }
    }
  }

  if (integrationEnv) {
    Object.assign(env, integrationEnv);
  }

  if (profile.env) {
    Object.assign(env, profile.env);
  }

  return env;
};

/** Resolve MCP configuration to pass down to a worker instance. */
export const resolveWorkerMcp = async (
  profile: WorkerProfile,
  parentConfig: Record<string, unknown>,
): Promise<Record<string, unknown> | undefined> => {
  const mcpConfig = profile.mcp;
  if (!mcpConfig) return undefined;

  const parentMcp = parentConfig.mcp as Record<string, unknown> | undefined;
  if (!parentMcp) return undefined;

  if (mcpConfig.inheritAll) {
    return parentMcp;
  }

  if (mcpConfig.servers && mcpConfig.servers.length > 0) {
    const filtered: Record<string, unknown> = {};
    for (const serverName of mcpConfig.servers) {
      if (parentMcp[serverName]) {
        filtered[serverName] = parentMcp[serverName];
      }
    }
    const resolved = Object.keys(filtered).length > 0 ? filtered : undefined;
    if (resolved) return resolved;
  }

  return undefined;
};

/** Determine the default session mode for a profile. */
export const getDefaultSessionMode = (profile: WorkerProfile): WorkerSessionMode => {
  if (profile.id === "memory" || profile.id === "docs") {
    return "linked";
  }
  return "linked";
};

/**
 * Resolve skill permissions for a worker.
 *
 * This determines which skills a worker can access based on its profile config.
 * The result is used to configure OpenCode's permission.skill setting.
 *
 * Behavior:
 * - "inherit": Worker inherits all skills (for agents like orchestrator, memory)
 * - explicit object: Use the provided skill permission map
 * - undefined: Default isolation - only allow the worker's own skill, deny others
 *
 * @param profile - The worker profile
 * @param allSkillIds - List of all available skill IDs in the project
 * @returns Skill permissions object for OpenCode config, or undefined for inherit
 */
export const resolveWorkerSkillPermissions = (
  profile: WorkerProfile,
  _allSkillIds: string[] = [],
): SkillPermissions | undefined => {
  const skillPerms = profile.skillPermissions;

  // "inherit" means no restrictions - worker gets all parent skills
  if (skillPerms === "inherit") {
    return undefined;
  }

  // Explicit skill permissions - use as-is
  if (skillPerms && typeof skillPerms === "object") {
    // Ensure deny-all fallback if not specified
    if (!("*" in skillPerms)) {
      return { ...skillPerms, "*": "deny" };
    }
    return skillPerms;
  }

  // Default: isolate worker to only its own skill
  // This prevents workers from accessing each other's skills
  const permissions: SkillPermissions = {
    [profile.id]: "allow", // Allow own skill
    "*": "deny", // Deny all others
  };

  return permissions;
};

/**
 * Build the permission config object for OpenCode.
 * This combines skill permissions with any existing permission config.
 *
 * @param existingPermissions - Existing permission config from profile
 * @param skillPermissions - Resolved skill permissions
 * @returns Combined permission config for OpenCode
 */
export const buildPermissionConfig = (
  existingPermissions?: Record<string, unknown>,
  skillPermissions?: SkillPermissions,
): Record<string, unknown> | undefined => {
  if (!skillPermissions && !existingPermissions) {
    return undefined;
  }

  const result: Record<string, unknown> = {};

  // Copy existing permissions
  if (existingPermissions) {
    Object.assign(result, existingPermissions);
  }

  // Add skill permissions
  if (skillPermissions) {
    result.skill = skillPermissions;
  }

  return Object.keys(result).length > 0 ? result : undefined;
};
