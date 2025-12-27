/* c8 ignore file */
import neo4j, { type Driver, type Session } from "neo4j-driver";
import { loadNeo4jConfig, type Neo4jConfig } from "./neo4j-config";

let driver: Driver | undefined;
let driverKey: string | undefined;

const keyOf = (cfg: Neo4jConfig): string => `${cfg.uri}|${cfg.username}|${cfg.database ?? ""}`;

/** Return a cached Neo4j driver for the given config. */
export const getNeo4jDriver = (cfg: Neo4jConfig): Driver => {
  const nextKey = keyOf(cfg);
  if (driver && driverKey === nextKey) return driver;

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
};

/** Open a Neo4j session, run a callback, and close the session. */
export const withNeo4jSession = async <T>(cfg: Neo4jConfig, fn: (session: Session) => Promise<T>): Promise<T> => {
  const d = getNeo4jDriver(cfg);
  const session = d.session(cfg.database ? { database: cfg.database } : undefined);
  try {
    return await fn(session);
  } finally {
    await session.close();
  }
};

/** Check whether Neo4j is reachable with the provided config. */
export const isNeo4jAccessible = async (cfg?: Neo4jConfig): Promise<boolean> => {
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
};
