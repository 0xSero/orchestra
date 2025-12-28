export type ToolPermissions = {
  categories?: {
    filesystem?: "full" | "read" | "none";
    execution?: "full" | "sandboxed" | "none";
    network?: "full" | "localhost" | "none";
  };
  tools?: {
    [toolName: string]: {
      enabled: boolean;
      constraints?: Record<string, unknown>;
    };
  };
  paths?: {
    allowed?: string[];
    denied?: string[];
  };
};

/**
 * Skill permission value for OpenCode's permission.skill config.
 * - "allow": Skill loads immediately
 * - "deny": Skill hidden from agent, access rejected
 * - "ask": User prompted for approval before loading
 */
export type SkillPermissionValue = "allow" | "deny" | "ask";

/**
 * Skill permissions map using glob patterns.
 * Supports wildcards like "internal-*" to match multiple skills.
 *
 * @example
 * {
 *   "memory": "allow",      // Allow memory skill
 *   "coder": "deny",        // Deny coder skill
 *   "*": "deny"             // Deny all others by default
 * }
 */
export type SkillPermissions = Record<string, SkillPermissionValue>;
