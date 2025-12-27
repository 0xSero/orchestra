import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Neo4jIntegrationConfig } from "../types";
import type { OrchestratorConfigFile } from "../types/config";

export const NEO4J_CONTAINER_NAME = "opencode-neo4j";
export const NEO4J_DEFAULT_IMAGE = "neo4j:community";
export const NEO4J_STARTUP_TIMEOUT_MS = 30_000;
export const NEO4J_HEALTH_CHECK_INTERVAL_MS = 1_000;

export type Neo4jConfig = {
  uri: string;
  username: string;
  password: string;
  database?: string;
};

let integrationsNeo4jConfig: Neo4jIntegrationConfig | undefined;

/** Cache the orchestrator-provided Neo4j integration config. */
export function setNeo4jIntegrationsConfig(cfg: Neo4jIntegrationConfig | undefined): void {
  integrationsNeo4jConfig = cfg;
}

/** Return the cached Neo4j integration config, if any. */
export function getNeo4jIntegrationsConfig(): Neo4jIntegrationConfig | undefined {
  return integrationsNeo4jConfig;
}

const loadNeo4jConfigFromFile = (): Neo4jConfig | undefined => {
  const projectDir = process.env.OPENCODE_ORCH_PROJECT_DIR || process.cwd();

  const pathsToTry: string[] = [];

  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  if (homeDir) {
    pathsToTry.push(join(homeDir, ".opencode", "orchestrator.json"));
  }

  pathsToTry.push(join(projectDir, ".opencode", "orchestrator.json"));

  for (const configPath of pathsToTry) {
    try {
      if (!existsSync(configPath)) continue;

      const content = readFileSync(configPath, "utf8");
      const config = JSON.parse(content) as OrchestratorConfigFile;
      const neo4j = config?.integrations?.neo4j;

      if (neo4j?.enabled !== false && neo4j?.uri && neo4j?.username && neo4j?.password) {
        return {
          uri: neo4j.uri,
          username: neo4j.username,
          password: neo4j.password,
          database: neo4j.database,
        };
      }
    } catch {
      // Ignore errors, try next path
    }
  }

  return undefined;
};

/** Load Neo4j config from environment variables. */
export const loadNeo4jConfigFromEnv = (): Neo4jConfig | undefined => {
  const uri = process.env.OPENCODE_NEO4J_URI;
  const username = process.env.OPENCODE_NEO4J_USERNAME;
  const password = process.env.OPENCODE_NEO4J_PASSWORD;
  const database = process.env.OPENCODE_NEO4J_DATABASE;

  if (!uri || !username || !password) return undefined;
  return { uri, username, password, database };
};

/** Load Neo4j config from orchestrator integration settings. */
export const loadNeo4jConfigFromIntegrations = (): Neo4jConfig | undefined => {
  const cfg = integrationsNeo4jConfig;
  if (cfg) {
    if (cfg.enabled === false) return undefined;
    const uri = cfg.uri;
    const username = cfg.username;
    const password = cfg.password;
    const database = cfg.database;
    if (!uri || !username || !password) return undefined;
    return { uri, username, password, database };
  }

  return loadNeo4jConfigFromFile();
};

/** Load Neo4j config using env-first precedence. */
export const loadNeo4jConfig = (): Neo4jConfig | undefined => {
  const fromEnv = loadNeo4jConfigFromEnv();
  if (fromEnv) return fromEnv;

  return loadNeo4jConfigFromIntegrations();
};
