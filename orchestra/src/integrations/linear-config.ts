import type { LinearIntegrationConfig } from "../types";
import type { LinearConfig } from "./linear-types";

const DEFAULT_API_URL = "https://api.linear.app/graphql";

/** Load Linear config from environment variables, if available. */
export const loadLinearConfigFromEnv = (): LinearConfig | undefined => {
  const apiKey = process.env.LINEAR_API_KEY;
  const teamId = process.env.LINEAR_TEAM_ID;
  if (!apiKey || !teamId) return undefined;
  return {
    apiKey,
    teamId,
    apiUrl: process.env.LINEAR_API_URL || DEFAULT_API_URL,
    projectPrefix: process.env.LINEAR_PROJECT_PREFIX || undefined,
  };
};

/** Resolve Linear config from integration settings and environment variables. */
export const resolveLinearConfig = (input?: LinearIntegrationConfig): LinearConfig => {
  if (input?.enabled === false) {
    throw new Error("Linear integration is disabled. Enable integrations.linear.enabled to use Linear tools.");
  }

  const apiKey = input?.apiKey || process.env.LINEAR_API_KEY;
  const teamId = input?.teamId || process.env.LINEAR_TEAM_ID;
  if (!apiKey || !teamId) {
    throw new Error(
      "Missing Linear credentials. Set LINEAR_API_KEY and LINEAR_TEAM_ID (or configure integrations.linear).",
    );
  }

  return {
    apiKey,
    teamId,
    apiUrl: input?.apiUrl || process.env.LINEAR_API_URL || DEFAULT_API_URL,
    projectPrefix: input?.projectPrefix || process.env.LINEAR_PROJECT_PREFIX || undefined,
  };
};
