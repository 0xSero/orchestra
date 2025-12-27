import { afterAll, beforeAll, describe, expect, test, mock } from "bun:test";
import { setNeo4jIntegrationsConfig } from "../../src/memory/neo4j-config";

let closeCalls = 0;
let sessionCloseCalls = 0;
let closeShouldThrow = false;
let runShouldThrow = false;

const makeSession = () => ({
  run: async () => {
    if (runShouldThrow) throw new Error("run failed");
    return { records: [] };
  },
  close: async () => {
    sessionCloseCalls += 1;
  },
});

const makeDriver = () => ({
  session: () => makeSession(),
  close: () => {
    closeCalls += 1;
    if (closeShouldThrow) throw new Error("close failed");
  },
});

describe("neo4j driver helpers", () => {
  beforeAll(() => {
    mock.module("neo4j-driver", () => ({
      default: {
        auth: { basic: () => "auth" },
        driver: () => makeDriver(),
      },
      auth: { basic: () => "auth" },
      driver: () => makeDriver(),
    }));

  });

  test("caches drivers, closes sessions, and checks accessibility", async () => {
    const { getNeo4jDriver, withNeo4jSession, isNeo4jAccessible } = await import("../../src/memory/neo4j-driver");
    const envSnapshot = {
      OPENCODE_NEO4J_URI: process.env.OPENCODE_NEO4J_URI,
      OPENCODE_NEO4J_USERNAME: process.env.OPENCODE_NEO4J_USERNAME,
      OPENCODE_NEO4J_PASSWORD: process.env.OPENCODE_NEO4J_PASSWORD,
      OPENCODE_NEO4J_DATABASE: process.env.OPENCODE_NEO4J_DATABASE,
    };

    const cfg1 = { uri: "bolt://one", username: "neo4j", password: "pw" };
    const cfg2 = { uri: "bolt://two", username: "neo4j", password: "pw" };

    closeShouldThrow = false;
    const driver1 = getNeo4jDriver(cfg1);
    closeShouldThrow = true;
    const driver2 = getNeo4jDriver(cfg2);
    expect(driver1).not.toBe(driver2);
    expect(closeCalls).toBeGreaterThan(0);

    const result = await withNeo4jSession(cfg2, async (session) => {
      await session.run("RETURN 1");
      return "ok";
    });
    expect(result).toBe("ok");
    expect(sessionCloseCalls).toBeGreaterThan(0);

    try {
      delete process.env.OPENCODE_NEO4J_URI;
      delete process.env.OPENCODE_NEO4J_USERNAME;
      delete process.env.OPENCODE_NEO4J_PASSWORD;
      delete process.env.OPENCODE_NEO4J_DATABASE;
      setNeo4jIntegrationsConfig(undefined);
      expect(await isNeo4jAccessible()).toBe(false);

      process.env.OPENCODE_NEO4J_URI = "bolt://three";
      process.env.OPENCODE_NEO4J_USERNAME = "neo4j";
      process.env.OPENCODE_NEO4J_PASSWORD = "pw";
      closeShouldThrow = false;
      runShouldThrow = false;
      expect(await isNeo4jAccessible()).toBe(true);

      runShouldThrow = true;
      expect(await isNeo4jAccessible(cfg2)).toBe(false);
    } finally {
      if (envSnapshot.OPENCODE_NEO4J_URI) process.env.OPENCODE_NEO4J_URI = envSnapshot.OPENCODE_NEO4J_URI;
      else delete process.env.OPENCODE_NEO4J_URI;
      if (envSnapshot.OPENCODE_NEO4J_USERNAME) process.env.OPENCODE_NEO4J_USERNAME = envSnapshot.OPENCODE_NEO4J_USERNAME;
      else delete process.env.OPENCODE_NEO4J_USERNAME;
      if (envSnapshot.OPENCODE_NEO4J_PASSWORD) process.env.OPENCODE_NEO4J_PASSWORD = envSnapshot.OPENCODE_NEO4J_PASSWORD;
      else delete process.env.OPENCODE_NEO4J_PASSWORD;
      if (envSnapshot.OPENCODE_NEO4J_DATABASE) process.env.OPENCODE_NEO4J_DATABASE = envSnapshot.OPENCODE_NEO4J_DATABASE;
      else delete process.env.OPENCODE_NEO4J_DATABASE;
      setNeo4jIntegrationsConfig(undefined);
    }
  });
});

afterAll(() => {
  mock.restore();
});
