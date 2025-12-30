import neo4j, { type Driver, type Session } from "neo4j-driver";

export type Neo4jConfig = {
  uri: string;
  username: string;
  password: string;
  database?: string;
};

let driver: Driver | undefined;
let driverKey: string | undefined;

function keyOf(cfg: Neo4jConfig): string {
  return `${cfg.uri}|${cfg.username}|${cfg.database ?? ""}`;
}

export function loadNeo4jConfigFromEnv(): Neo4jConfig | undefined {
  const uri = process.env.OPENCODE_NEO4J_URI;
  const username = process.env.OPENCODE_NEO4J_USERNAME;
  const password = process.env.OPENCODE_NEO4J_PASSWORD;
  const database = process.env.OPENCODE_NEO4J_DATABASE;

  if (!uri || !username || !password) return undefined;
  return { uri, username, password, database };
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

