import neo4j, { type Driver, type Session } from "neo4j-driver";
import type { Neo4jIntegrationConfig } from "../types";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Neo4jConfig = {
  uri: string;
  username: string;
  password: string;
  database?: string;
};

let driver: Driver | undefined;
let driverKey: string | undefined;

// Cached integrations config (set by orchestrator on startup)
let integrationsNeo4jConfig: Neo4jIntegrationConfig | undefined;

/**
 * Set the Neo4j config from orchestrator integrations.
 * This should be called during plugin initialization.
 */
export function setNeo4jIntegrationsConfig(cfg: Neo4jIntegrationConfig | undefined): void {
  integrationsNeo4jConfig = cfg;
}

/**
 * Get the current Neo4j integrations config.
 */
export function getNeo4jIntegrationsConfig(): Neo4jIntegrationConfig | undefined {
  return integrationsNeo4jConfig;
}

/**
 * Try to load Neo4j config directly from orchestrator.json file.
 * This is used in worker processes where the orchestrator hasn't set config.
 */
function loadNeo4jConfigFromFile(): Neo4jConfig | undefined {
  // Use OPENCODE_ORCH_PROJECT_DIR if set (passed to workers by orchestrator),
  // otherwise fall back to current working directory
  const projectDir = process.env.OPENCODE_ORCH_PROJECT_DIR || process.cwd();

  const pathsToTry: string[] = [];

  // Try global config first
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  if (homeDir) {
    pathsToTry.push(join(homeDir, ".opencode", "orchestrator.json"));
  }

  // Try project config (use env var if set, otherwise cwd)
  pathsToTry.push(join(projectDir, ".opencode", "orchestrator.json"));

  for (const configPath of pathsToTry) {
    try {
      if (!existsSync(configPath)) continue;

      const content = readFileSync(configPath, "utf8");
      const config = JSON.parse(content) as any;
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
}

function keyOf(cfg: Neo4jConfig): string {
  return `${cfg.uri}|${cfg.username}|${cfg.database ?? ""}`;
}

/**
 * Load Neo4j config from environment variables only.
 * Prefer using loadNeo4jConfig() which checks both integrations config and env vars.
 */
export function loadNeo4jConfigFromEnv(): Neo4jConfig | undefined {
  const uri = process.env.OPENCODE_NEO4J_URI;
  const username = process.env.OPENCODE_NEO4J_USERNAME;
  const password = process.env.OPENCODE_NEO4J_PASSWORD;
  const database = process.env.OPENCODE_NEO4J_DATABASE;

  if (!uri || !username || !password) return undefined;
  return { uri, username, password, database };
}

/**
 * Load Neo4j config from integrations config (orchestrator.json).
 * Returns undefined if not configured or disabled.
 *
 * This function first checks the cached config set by the orchestrator.
 * If not set (e.g., in worker processes), it tries to load directly from file.
 */
export function loadNeo4jConfigFromIntegrations(): Neo4jConfig | undefined {
  // First, check cached config set by orchestrator
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

  // If not set (e.g., worker process), try loading from file directly
  return loadNeo4jConfigFromFile();
}

/**
 * Load Neo4j config from all sources with priority:
 * 1. Environment variables (highest priority - allows override)
 * 2. Integrations config from orchestrator.json
 * 
 * This is the recommended function to use for Neo4j config resolution.
 */
export function loadNeo4jConfig(): Neo4jConfig | undefined {
  // Env vars take priority (allows easy override without editing config)
  const fromEnv = loadNeo4jConfigFromEnv();
  if (fromEnv) return fromEnv;
  
  // Fall back to integrations config
  return loadNeo4jConfigFromIntegrations();
}

export function getNeo4jDriver(cfg: Neo4jConfig): Driver {
  const nextKey = keyOf(cfg);
  if (driver && driverKey === nextKey) return driver;

  // If config changed, close old driver.
  if (driver) {
    try {
      void driver.close();
    } catch {
      // ignore
    }
  }

  driver = neo4j.driver(cfg.uri, neo4j.auth.basic(cfg.username, cfg.password), {
    disableLosslessIntegers: true,
  });
  driverKey = nextKey;
  return driver;
}

export async function withNeo4jSession<T>(
  cfg: Neo4jConfig,
  fn: (session: Session) => Promise<T>
): Promise<T> {
  const d = getNeo4jDriver(cfg);
  const session = d.session(cfg.database ? { database: cfg.database } : undefined);
  try {
    return await fn(session);
  } finally {
    await session.close();
  }
}

