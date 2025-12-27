/* c8 ignore file */
import type { WorkerProfile, WorkerSessionMode } from "../types";

/** Build environment variables for a worker based on profile settings. */
export const resolveWorkerEnv = (profile: WorkerProfile): Record<string, string> => {
  const env: Record<string, string> = {};

  if (profile.env) {
    Object.assign(env, profile.env);
  }

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
    return Object.keys(filtered).length > 0 ? filtered : undefined;
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
