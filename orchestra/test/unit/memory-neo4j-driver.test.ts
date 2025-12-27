import { afterAll, beforeAll, describe, expect, test, mock } from "bun:test";

let closeCalls = 0;
let sessionCloseCalls = 0;
let closeShouldThrow = false;
let runShouldThrow = false;
let loadedConfig: { uri: string; username: string; password: string; database?: string } | undefined;

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

    mock.module("../../src/memory/neo4j-config", () => ({
      loadNeo4jConfig: () => loadedConfig,
      setNeo4jIntegrationsConfig: () => {},
    }));
  });

  test("caches drivers, closes sessions, and checks accessibility", async () => {
    const { getNeo4jDriver, withNeo4jSession, isNeo4jAccessible } = await import("../../src/memory/neo4j-driver");

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

    loadedConfig = undefined;
    expect(await isNeo4jAccessible()).toBe(false);

    loadedConfig = { uri: "bolt://three", username: "neo4j", password: "pw" };
    closeShouldThrow = false;
    runShouldThrow = false;
    expect(await isNeo4jAccessible()).toBe(true);

    runShouldThrow = true;
    expect(await isNeo4jAccessible(cfg2)).toBe(false);
  });
});

afterAll(() => {
  mock.restore();
});
