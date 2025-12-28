/* c8 ignore file */
import { execSync, spawn, spawnSync } from "node:child_process";
import neo4j from "neo4j-driver";
import type { Neo4jIntegrationConfig } from "../types";
import {
  getNeo4jIntegrationsConfig,
  loadNeo4jConfig,
  NEO4J_CONTAINER_NAME,
  NEO4J_DEFAULT_IMAGE,
  NEO4J_HEALTH_CHECK_INTERVAL_MS,
  NEO4J_STARTUP_TIMEOUT_MS,
  type Neo4jConfig,
} from "./neo4j-config";
import { isNeo4jAccessible } from "./neo4j-driver";

export type Neo4jDockerDeps = {
  execSync?: typeof execSync;
  spawn?: typeof spawn;
  spawnSync?: typeof spawnSync;
  neo4j?: typeof neo4j;
  isNeo4jAccessible?: typeof isNeo4jAccessible;
};

/**
 * Validate Docker image name to prevent command injection.
 * Allows: alphanumeric, slashes, colons, hyphens, underscores, periods, @
 * Examples: "neo4j:5.15", "library/neo4j:latest", "ghcr.io/org/neo4j@sha256:abc123"
 */
function isValidDockerImage(image: string): boolean {
  if (!image || typeof image !== "string") return false;
  // Max 256 chars, must match Docker image naming convention
  if (image.length > 256) return false;
  // Allow: alphanumeric, /, :, -, _, ., @
  // Must start with alphanumeric or allowed registry prefix
  const validPattern = /^[a-zA-Z0-9][a-zA-Z0-9._\-/:@]*$/;
  return validPattern.test(image);
}

/**
 * Sanitize container name for shell commands.
 * Only allows alphanumeric, hyphens, and underscores.
 */
function sanitizeContainerName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "");
}

const isDockerAvailable = (deps?: Neo4jDockerDeps): boolean => {
  try {
    const exec = deps?.execSync ?? execSync;
    exec("docker --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const containerExists = (deps?: Neo4jDockerDeps): boolean => {
  try {
    const safeName = sanitizeContainerName(NEO4J_CONTAINER_NAME);
    // Use spawnSync with array args to avoid shell injection
    const spawnSyncFn = deps?.spawnSync ?? spawnSync;
    const result = spawnSyncFn("docker", ["ps", "-a", "--filter", `name=^${safeName}$`, "--format", "{{.Names}}"], {
      encoding: "utf8",
    });
    if (result.error) return false;
    return result.stdout.trim() === safeName;
  } catch {
    return false;
  }
};

const isContainerRunning = (deps?: Neo4jDockerDeps): boolean => {
  try {
    const safeName = sanitizeContainerName(NEO4J_CONTAINER_NAME);
    // Use spawnSync with array args to avoid shell injection
    const spawnSyncFn = deps?.spawnSync ?? spawnSync;
    const result = spawnSyncFn("docker", ["ps", "--filter", `name=^${safeName}$`, "--format", "{{.Names}}"], {
      encoding: "utf8",
    });
    if (result.error) return false;
    return result.stdout.trim() === safeName;
  } catch {
    return false;
  }
};

const startContainer = (deps?: Neo4jDockerDeps): void => {
  const safeName = sanitizeContainerName(NEO4J_CONTAINER_NAME);
  // Use spawnSync with array args to avoid shell injection
  const spawnSyncFn = deps?.spawnSync ?? spawnSync;
  const result = spawnSyncFn("docker", ["start", safeName], { stdio: "ignore" });
  if (result.error) throw result.error;
};

const createContainer = (cfg: Neo4jIntegrationConfig, deps?: Neo4jDockerDeps): void => {
  const username = cfg.username ?? "neo4j";
  const password = cfg.password ?? "opencode123";
  const image = cfg.image ?? NEO4J_DEFAULT_IMAGE;

  // Validate image name to prevent command injection
  if (!isValidDockerImage(image)) {
    throw new Error(`Invalid Docker image name: ${image}. Image must match Docker naming conventions.`);
  }

  const uri = cfg.uri ?? "bolt://localhost:7687";
  const portMatch = uri.match(/:([^/]+)(?:\/|$)/);
  const boltPort = portMatch ? portMatch[1] : "7687";

  // Validate port is numeric
  if (!/^\d+$/.test(boltPort)) {
    throw new Error(`Invalid port in URI: ${uri}`);
  }

  const safeName = sanitizeContainerName(NEO4J_CONTAINER_NAME);

  const args = [
    "run",
    "-d",
    "--name",
    safeName,
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

  // spawn with array args is safe from shell injection
  const spawnFn = deps?.spawn ?? spawn;
  spawnFn("docker", args, { stdio: "ignore", detached: true }).unref();
};

const waitForNeo4j = async (
  cfg: Neo4jConfig,
  timeoutMs: number = NEO4J_STARTUP_TIMEOUT_MS,
  deps?: Neo4jDockerDeps,
): Promise<boolean> => {
  const start = Date.now();
  const neo4jDriver = deps?.neo4j ?? neo4j;

  while (Date.now() - start < timeoutMs) {
    try {
      const testDriver = neo4jDriver.driver(cfg.uri, neo4jDriver.auth.basic(cfg.username, cfg.password));
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
};

export type EnsureNeo4jResult = {
  status: "already_running" | "started" | "created" | "failed" | "disabled" | "no_docker" | "no_config";
  message: string;
};

/** Ensure Neo4j is running, optionally starting a Docker container. */
export const ensureNeo4jRunning = async (
  integrationsCfg?: Neo4jIntegrationConfig,
  deps?: Neo4jDockerDeps,
): Promise<EnsureNeo4jResult> => {
  const accessibleFn = deps?.isNeo4jAccessible ?? isNeo4jAccessible;
  const cfg = integrationsCfg ?? getNeo4jIntegrationsConfig();

  if (cfg?.enabled === false) {
    return { status: "disabled", message: "Neo4j integration is disabled" };
  }

  if (cfg?.autoStart === false) {
    return { status: "disabled", message: "Neo4j autoStart is disabled" };
  }

  const neo4jCfg = loadNeo4jConfig();
  if (!neo4jCfg) {
    return { status: "no_config", message: "No Neo4j configuration found" };
  }

  if (await accessibleFn(neo4jCfg)) {
    return { status: "already_running", message: "Neo4j is already running" };
  }

  if (!isDockerAvailable(deps)) {
    return { status: "no_docker", message: "Docker is not available - cannot auto-start Neo4j" };
  }

  try {
    if (containerExists(deps)) {
      if (!isContainerRunning(deps)) {
        startContainer(deps);
      }
      const ready = await waitForNeo4j(neo4jCfg, NEO4J_STARTUP_TIMEOUT_MS, deps);
      if (ready) {
        return { status: "started", message: `Started existing Neo4j container '${NEO4J_CONTAINER_NAME}'` };
      }
      return { status: "failed", message: "Neo4j container started but failed to become responsive" };
    }

    createContainer(cfg ?? {}, deps);

    const ready = await waitForNeo4j(neo4jCfg, NEO4J_STARTUP_TIMEOUT_MS, deps);
    if (ready) {
      return { status: "created", message: `Created and started Neo4j container '${NEO4J_CONTAINER_NAME}'` };
    }

    return { status: "failed", message: "Neo4j container created but failed to become responsive" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "failed", message: `Failed to start Neo4j: ${msg}` };
  }
};
