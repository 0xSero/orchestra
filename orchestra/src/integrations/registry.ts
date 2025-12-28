import type { ToolDefinition } from "@opencode-ai/plugin";
import { isPlainObject } from "../helpers/format";
import { createLinearTools } from "../tools/linear-tools";
import type { IntegrationsConfig, LinearIntegrationConfig } from "../types";
import { resolveLinearConfig } from "./linear-config";
import type { LinearConfig } from "./linear-types";

export type IntegrationToolGroup = {
  orchestrator?: Record<string, ToolDefinition>;
  workers?: Record<string, ToolDefinition>;
};

export type IntegrationDefinition = {
  key: string;
  resolveConfig?: (config: unknown) => unknown | undefined;
  toEnv?: (config: unknown) => Record<string, string>;
  tools?: (input: { config: unknown }) => IntegrationToolGroup;
};

const registry = new Map<string, IntegrationDefinition>();

export const registerIntegration = (definition: IntegrationDefinition): void => {
  registry.set(definition.key, definition);
};

const resolveConfigSafe = (definition: IntegrationDefinition, config: unknown): unknown | undefined => {
  if (!definition.resolveConfig) return config;
  try {
    return definition.resolveConfig(config);
  } catch {
    return undefined;
  }
};

export const getIntegrationTools = (
  integrations?: IntegrationsConfig,
): { orchestrator: Record<string, ToolDefinition>; workers: Record<string, ToolDefinition> } => {
  const raw = (integrations ?? {}) as Record<string, unknown>;
  const orchestrator: Record<string, ToolDefinition> = {};
  const workers: Record<string, ToolDefinition> = {};

  for (const definition of registry.values()) {
    if (!definition.tools) continue;
    const resolved = resolveConfigSafe(definition, raw[definition.key]);
    if (resolved === undefined) continue;

    const tools = definition.tools({ config: raw[definition.key] });
    if (tools.orchestrator) Object.assign(orchestrator, tools.orchestrator);
    if (tools.workers) Object.assign(workers, tools.workers);
  }

  return { orchestrator, workers };
};

export const getIntegrationEnv = (integrations: Record<string, unknown>): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const definition of registry.values()) {
    if (!definition.toEnv) continue;
    const resolved = resolveConfigSafe(definition, integrations[definition.key]);
    if (resolved === undefined) continue;
    Object.assign(env, definition.toEnv(resolved));
  }
  return env;
};

const toLinearEnv = (cfg: LinearConfig): Record<string, string> => {
  const env: Record<string, string> = {};
  if (cfg.apiKey) env.LINEAR_API_KEY = cfg.apiKey;
  if (cfg.teamId) env.LINEAR_TEAM_ID = cfg.teamId;
  if (cfg.apiUrl) env.LINEAR_API_URL = cfg.apiUrl;
  if (cfg.projectPrefix) env.LINEAR_PROJECT_PREFIX = cfg.projectPrefix;
  return env;
};

registerIntegration({
  key: "linear",
  resolveConfig: (config) => resolveLinearConfig(config as LinearIntegrationConfig | undefined),
  toEnv: (config) => toLinearEnv(config as LinearConfig),
  tools: (input) => createLinearTools({ config: input.config as LinearIntegrationConfig }),
});

registerIntegration({
  key: "neo4j",
  resolveConfig: (config) => {
    if (!isPlainObject(config)) return undefined;
    if (config.enabled === false) return undefined;
    return config;
  },
  toEnv: (config) => {
    if (!isPlainObject(config)) return {};
    const env: Record<string, string> = {};
    if (typeof config.uri === "string") env.OPENCODE_NEO4J_URI = config.uri;
    if (typeof config.username === "string") env.OPENCODE_NEO4J_USERNAME = config.username;
    if (typeof config.password === "string") env.OPENCODE_NEO4J_PASSWORD = config.password;
    if (typeof config.database === "string") env.OPENCODE_NEO4J_DATABASE = config.database;
    return env;
  },
});
