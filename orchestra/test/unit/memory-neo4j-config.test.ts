import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Neo4jConfigModule = typeof import("../../src/memory/neo4j-config");

let getNeo4jIntegrationsConfig: Neo4jConfigModule["getNeo4jIntegrationsConfig"];
let loadNeo4jConfig: Neo4jConfigModule["loadNeo4jConfig"];
let loadNeo4jConfigFromEnv: Neo4jConfigModule["loadNeo4jConfigFromEnv"];
let loadNeo4jConfigFromIntegrations: Neo4jConfigModule["loadNeo4jConfigFromIntegrations"];
let setNeo4jIntegrationsConfig: Neo4jConfigModule["setNeo4jIntegrationsConfig"];

describe("neo4j config", () => {
  const envSnapshot = () => ({
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    OPENCODE_ORCH_PROJECT_DIR: process.env.OPENCODE_ORCH_PROJECT_DIR,
    OPENCODE_NEO4J_URI: process.env.OPENCODE_NEO4J_URI,
    OPENCODE_NEO4J_USERNAME: process.env.OPENCODE_NEO4J_USERNAME,
    OPENCODE_NEO4J_PASSWORD: process.env.OPENCODE_NEO4J_PASSWORD,
    OPENCODE_NEO4J_DATABASE: process.env.OPENCODE_NEO4J_DATABASE,
  });

  const restoreEnv = (snapshot: ReturnType<typeof envSnapshot>) => {
    for (const [key, value] of Object.entries(snapshot)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };

  let tempDir = "";
  let envState: ReturnType<typeof envSnapshot>;

  beforeEach(async () => {
    const moduleUrl = new URL("../../src/memory/neo4j-config.ts", import.meta.url);
    const mod = (await import(`${moduleUrl.href}?v=${Date.now()}`)) as Neo4jConfigModule;
    ({ getNeo4jIntegrationsConfig, loadNeo4jConfig, loadNeo4jConfigFromEnv, loadNeo4jConfigFromIntegrations, setNeo4jIntegrationsConfig } = mod);
    envState = envSnapshot();
    tempDir = await mkdtemp(join(tmpdir(), "neo4j-config-"));
    process.env.HOME = tempDir;
    process.env.OPENCODE_ORCH_PROJECT_DIR = tempDir;
  });

  afterEach(async () => {
    setNeo4jIntegrationsConfig(undefined);
    restoreEnv(envState);
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  test("loadNeo4jConfigFromEnv returns undefined when missing", () => {
    delete process.env.OPENCODE_NEO4J_URI;
    delete process.env.OPENCODE_NEO4J_USERNAME;
    delete process.env.OPENCODE_NEO4J_PASSWORD;
    expect(loadNeo4jConfigFromEnv()).toBeUndefined();
  });

  test("loadNeo4jConfigFromEnv returns config when present", () => {
    process.env.OPENCODE_NEO4J_URI = "bolt://localhost";
    process.env.OPENCODE_NEO4J_USERNAME = "neo4j";
    process.env.OPENCODE_NEO4J_PASSWORD = "pw";
    process.env.OPENCODE_NEO4J_DATABASE = "db";
    const cfg = loadNeo4jConfigFromEnv();
    expect(cfg?.database).toBe("db");
  });

  test("loadNeo4jConfigFromIntegrations honors cached config", () => {
    setNeo4jIntegrationsConfig({
      enabled: true,
      uri: "bolt://cached",
      username: "neo4j",
      password: "pw",
      database: "db",
    });
    const cfg = loadNeo4jConfigFromIntegrations();
    expect(cfg?.uri).toBe("bolt://cached");
    expect(getNeo4jIntegrationsConfig()?.uri).toBe("bolt://cached");
  });

  test("loadNeo4jConfigFromIntegrations returns undefined when disabled", () => {
    setNeo4jIntegrationsConfig({ enabled: false, uri: "bolt://x", username: "neo4j", password: "pw" });
    expect(loadNeo4jConfigFromIntegrations()).toBeUndefined();
  });

  test("loads config from orchestrator file when no cached config", async () => {
    const configDir = join(tempDir, ".opencode");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, "orchestrator.json"),
      JSON.stringify({
        integrations: {
          neo4j: {
            enabled: true,
            uri: "bolt://file",
            username: "neo4j",
            password: "pw",
            database: "db",
          },
        },
      }),
      "utf8",
    );

    const cfg = loadNeo4jConfigFromIntegrations();
    expect(cfg?.uri).toBe("bolt://file");
  });

  test("loadNeo4jConfig prefers env over integrations", () => {
    process.env.OPENCODE_NEO4J_URI = "bolt://env";
    process.env.OPENCODE_NEO4J_USERNAME = "env-user";
    process.env.OPENCODE_NEO4J_PASSWORD = "env-pass";
    setNeo4jIntegrationsConfig({
      enabled: true,
      uri: "bolt://cached",
      username: "neo4j",
      password: "pw",
    });
    const cfg = loadNeo4jConfig();
    expect(cfg?.uri).toBe("bolt://env");
  });

  test("ignores invalid orchestrator JSON when loading from file", async () => {
    const configDir = join(tempDir, ".opencode");
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, "orchestrator.json"), "{ invalid", "utf8");

    const cfg = loadNeo4jConfigFromIntegrations();
    expect(cfg).toBeUndefined();
  });
});
