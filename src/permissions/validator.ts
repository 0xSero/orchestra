import type { ToolPermissions } from "../types";

const FILESYSTEM_READ_TOOLS = ["read", "ls", "glob", "rg", "search", "stat"];
const FILESYSTEM_WRITE_TOOLS = ["write", "edit", "patch", "delete", "mv", "cp", "mkdir", "rmdir"];
const EXECUTION_TOOLS = ["bash", "exec", "command", "shell", "run", "process"];
const NETWORK_TOOLS = ["fetch", "curl", "wget", "http", "browser", "web_search", "web"];

function mergeArrays(base?: string[], override?: string[]): string[] | undefined {
  const merged = [...(base ?? []), ...(override ?? [])].filter((value) => typeof value === "string" && value.length > 0);
  if (merged.length === 0) return undefined;
  return Array.from(new Set(merged));
}

export function mergeToolPermissions(base?: ToolPermissions, override?: ToolPermissions): ToolPermissions | undefined {
  if (!base && !override) return undefined;
  if (!base) return override;
  if (!override) return base;

  return {
    categories: { ...(base.categories ?? {}), ...(override.categories ?? {}) },
    tools: { ...(base.tools ?? {}), ...(override.tools ?? {}) },
    paths: {
      allowed: mergeArrays(base.paths?.allowed, override.paths?.allowed),
      denied: mergeArrays(base.paths?.denied, override.paths?.denied),
    },
  };
}

export function buildToolConfigFromPermissions(input?: {
  permissions?: ToolPermissions;
  baseTools?: Record<string, boolean>;
}): Record<string, boolean> | undefined {
  const permissions = input?.permissions;
  const baseTools = input?.baseTools;

  if (!permissions && !baseTools) return undefined;

  const resolved: Record<string, boolean> = { ...(baseTools ?? {}) };

  const filesystem = permissions?.categories?.filesystem;
  if (filesystem === "none") {
    for (const id of [...FILESYSTEM_READ_TOOLS, ...FILESYSTEM_WRITE_TOOLS]) {
      resolved[id] = false;
    }
  } else if (filesystem === "read") {
    for (const id of FILESYSTEM_WRITE_TOOLS) {
      resolved[id] = false;
    }
  }

  const execution = permissions?.categories?.execution;
  if (execution === "none") {
    for (const id of EXECUTION_TOOLS) {
      resolved[id] = false;
    }
  }

  const network = permissions?.categories?.network;
  if (network === "none") {
    for (const id of NETWORK_TOOLS) {
      resolved[id] = false;
    }
  }

  if (permissions?.tools) {
    for (const [toolId, rule] of Object.entries(permissions.tools)) {
      if (typeof rule?.enabled === "boolean") {
        resolved[toolId] = rule.enabled;
      }
    }
  }

  return resolved;
}

export function summarizePermissions(permissions?: ToolPermissions): string | undefined {
  if (!permissions) return undefined;

  const parts: string[] = [];
  if (permissions.categories?.filesystem) parts.push(`filesystem: ${permissions.categories.filesystem}`);
  if (permissions.categories?.execution) parts.push(`execution: ${permissions.categories.execution}`);
  if (permissions.categories?.network) parts.push(`network: ${permissions.categories.network}`);

  if (permissions.paths?.allowed?.length) parts.push(`allowed paths: ${permissions.paths.allowed.join(", ")}`);
  if (permissions.paths?.denied?.length) parts.push(`denied paths: ${permissions.paths.denied.join(", ")}`);

  if (permissions.tools) {
    const overrides = Object.entries(permissions.tools)
      .map(([toolId, rule]) => `${toolId}: ${rule.enabled ? "enabled" : "disabled"}`)
      .join(", ");
    if (overrides) parts.push(`tool overrides: ${overrides}`);
  }

  if (parts.length === 0) return undefined;
  return parts.join("; ");
}
