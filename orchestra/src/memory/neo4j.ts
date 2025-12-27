import { spawn, execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import neo4j, { type Driver, type Session } from "neo4j-driver";
import type { OrchestratorConfigFile } from "../types/config";
import type { Neo4jIntegrationConfig } from "../types";

const NEO4J_CONTAINER_NAME = "opencode-neo4j";
const NEO4J_DEFAULT_IMAGE = "neo4j:community";
const NEO4J_STARTUP_TIMEOUT_MS = 30_000;
const NEO4J_HEALTH_CHECK_INTERVAL_MS = 1_000;

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

export async function withNeo4jSession<T>(cfg: Neo4jConfig, fn: (session: Session) => Promise<T>): Promise<T> {
  const d = getNeo4jDriver(cfg);
  const session = d.session(cfg.database ? { database: cfg.database } : undefined);
  try {
    return await fn(session);
  } finally {
    await session.close();
  }
}

/**
 * Check if Docker is available on the system.
 */
function isDockerAvailable(): boolean {
  try {
    execSync("docker --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if the Neo4j container exists (running or stopped).
 */
function containerExists(): boolean {
  try {
    const result = execSync(`docker ps -a --filter "name=^${NEO4J_CONTAINER_NAME}$" --format "{{.Names}}"`, {
      encoding: "utf8",
    });
    return result.trim() === NEO4J_CONTAINER_NAME;
  } catch {
    return false;
  }
}

/**
 * Check if the Neo4j container is currently running.
 */
function isContainerRunning(): boolean {
  try {
    const result = execSync(`docker ps --filter "name=^${NEO4J_CONTAINER_NAME}$" --format "{{.Names}}"`, {
      encoding: "utf8",
    });
    return result.trim() === NEO4J_CONTAINER_NAME;
  } catch {
    return false;
  }
}

/**
 * Start an existing stopped container.
 */
function startContainer(): void {
  execSync(`docker start ${NEO4J_CONTAINER_NAME}`, { stdio: "ignore" });
}

/**
 * Create and start a new Neo4j container.
 */
function createContainer(cfg: Neo4jIntegrationConfig): void {
  const username = cfg.username ?? "neo4j";
  const password = cfg.password ?? "opencode";
  const image = cfg.image ?? NEO4J_DEFAULT_IMAGE;

  // Parse port from URI (default bolt://localhost:7687)
  const uri = cfg.uri ?? "bolt://localhost:7687";
  const portMatch = uri.match(/:(\d+)$/);
  const boltPort = portMatch ? portMatch[1] : "7687";

  // Run container with appropriate settings
  const args = [
    "run",
    "-d",
    "--name",
    NEO4J_CONTAINER_NAME,
    "-p",
    `${boltPort}:7687`,
    "-p",
    "7474:7474",
    "-e",
    `NEO4J_AUTH=${username}/${password}`,
    "-e",
    "NEO4J_PLUGINS=[]",
    "--restart",
    "unless-stopped",
    image,
  ];

  spawn("docker", args, { stdio: "ignore", detached: true }).unref();
}

/**
 * Wait for Neo4j to become responsive.
 */
async function waitForNeo4j(cfg: Neo4jConfig, timeoutMs: number = NEO4J_STARTUP_TIMEOUT_MS): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const testDriver = neo4j.driver(cfg.uri, neo4j.auth.basic(cfg.username, cfg.password));
      const session = testDriver.session();
      try {
        await session.run("RETURN 1");
        await session.close();
        await testDriver.close();
        return true;
      } catch {
        await session.close();
        await testDriver.close();
      }
    } catch {
      // Connection failed, keep waiting
    }

    await new Promise((resolve) => setTimeout(resolve, NEO4J_HEALTH_CHECK_INTERVAL_MS));
  }

  return false;
}

/**
 * Check if Neo4j is currently accessible.
 */
export async function isNeo4jAccessible(cfg?: Neo4jConfig): Promise<boolean> {
  const config = cfg ?? loadNeo4jConfig();
  if (!config) return false;

  try {
    const testDriver = neo4j.driver(config.uri, neo4j.auth.basic(config.username, config.password));
    const session = testDriver.session();
    try {
      await session.run("RETURN 1");
      return true;
    } finally {
      await session.close();
      await testDriver.close();
    }
  } catch {
    return false;
  }
}

export type EnsureNeo4jResult = {
  status: "already_running" | "started" | "created" | "failed" | "disabled" | "no_docker" | "no_config";
  message: string;
};

/**
 * Ensure Neo4j is running. If autoStart is enabled in config and Neo4j is not
 * accessible, this will attempt to start or create a Docker container.
 */
export async function ensureNeo4jRunning(integrationsCfg?: Neo4jIntegrationConfig): Promise<EnsureNeo4jResult> {
  const cfg = integrationsCfg ?? integrationsNeo4jConfig;

  // Check if Neo4j is disabled
  if (cfg?.enabled === false) {
    return { status: "disabled", message: "Neo4j integration is disabled" };
  }

  // Check if autoStart is disabled (default: true when neo4j config exists)
  if (cfg?.autoStart === false) {
    return { status: "disabled", message: "Neo4j autoStart is disabled" };
  }

  // Build config for connection testing
  const neo4jCfg = loadNeo4jConfig();
  if (!neo4jCfg) {
    return { status: "no_config", message: "No Neo4j configuration found" };
  }

  // Check if already accessible
  if (await isNeo4jAccessible(neo4jCfg)) {
    return { status: "already_running", message: "Neo4j is already running" };
  }

  // Check for Docker
  if (!isDockerAvailable()) {
    return { status: "no_docker", message: "Docker is not available - cannot auto-start Neo4j" };
  }

  try {
    if (containerExists()) {
      if (!isContainerRunning()) {
        // Container exists but stopped - start it
        startContainer();
      }
      // Container is running or just started - wait for it
      const ready = await waitForNeo4j(neo4jCfg);
      if (ready) {
        return { status: "started", message: `Started existing Neo4j container '${NEO4J_CONTAINER_NAME}'` };
      }
      return { status: "failed", message: "Neo4j container started but failed to become responsive" };
    }

    // No container exists - create one
    createContainer(cfg ?? {});

    // Wait for Neo4j to become ready
    const ready = await waitForNeo4j(neo4jCfg);
    if (ready) {
      return { status: "created", message: `Created and started Neo4j container '${NEO4J_CONTAINER_NAME}'` };
    }

    return { status: "failed", message: "Neo4j container created but failed to become responsive" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "failed", message: `Failed to start Neo4j: ${msg}` };
  }
}
