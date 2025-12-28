import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Neo4jDockerDeps } from "../../src/memory/neo4j-docker";
import { setNeo4jIntegrationsConfig } from "../../src/memory/neo4j-config";

let dockerAvailable = true;
let containerExists = false;
let containerRunning = false;
let runOutcomes: boolean[] = [];
let defaultRunSuccess = true;
let spawnCalls = 0;
let startCalls = 0;
let forceStartError = false;
let commands: string[] = [];
let spawnSyncThrowsFor: "ps-a" | "ps" | undefined;
let driverThrows = false;
const snapshotEnv = () => ({
  HOME: process.env.HOME,
  USERPROFILE: process.env.USERPROFILE,
  OPENCODE_ORCH_PROJECT_DIR: process.env.OPENCODE_ORCH_PROJECT_DIR,
  OPENCODE_NEO4J_URI: process.env.OPENCODE_NEO4J_URI,
  OPENCODE_NEO4J_USERNAME: process.env.OPENCODE_NEO4J_USERNAME,
  OPENCODE_NEO4J_PASSWORD: process.env.OPENCODE_NEO4J_PASSWORD,
  OPENCODE_NEO4J_DATABASE: process.env.OPENCODE_NEO4J_DATABASE,
});

const restoreEnv = (snapshot: ReturnType<typeof snapshotEnv>) => {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

const setEnvConfig = () => {
  process.env.OPENCODE_NEO4J_URI = "bolt://localhost:7687";
  process.env.OPENCODE_NEO4J_USERNAME = "neo4j";
  process.env.OPENCODE_NEO4J_PASSWORD = "pw";
  delete process.env.OPENCODE_NEO4J_DATABASE;
};

const clearEnvConfig = () => {
  delete process.env.OPENCODE_NEO4J_URI;
  delete process.env.OPENCODE_NEO4J_USERNAME;
  delete process.env.OPENCODE_NEO4J_PASSWORD;
  delete process.env.OPENCODE_NEO4J_DATABASE;
};

const formatCommand = (command: string, args?: string[]) => [command, ...(args ?? [])].join(" ");

const neo4jStub = {
  auth: { basic: () => "auth" },
  driver: () => {
    if (driverThrows) throw new Error("driver failed");
    return {
      session: () => ({
        run: async () => {
          const outcome = runOutcomes.length > 0 ? runOutcomes.shift() : defaultRunSuccess;
          if (!outcome) throw new Error("not ready");
        },
        close: async () => {},
      }),
      close: async () => {},
    };
  },
};

const buildDeps = (): Neo4jDockerDeps => ({
  execSync: (command: string) => {
    commands.push(command);
    if (command.startsWith("docker --version")) {
      if (!dockerAvailable) throw new Error("docker missing");
      return "Docker";
    }
    return "";
  },
  spawn: () => ({
    unref: () => {
      spawnCalls += 1;
    },
  }),
  spawnSync: (command: string, args?: string[]) => {
    const argList = Array.isArray(args) ? args : [];
    if (spawnSyncThrowsFor === "ps-a" && command === "docker" && argList[0] === "ps" && argList[1] === "-a") {
      throw new Error("spawnSync failed");
    }
    if (spawnSyncThrowsFor === "ps" && command === "docker" && argList[0] === "ps" && argList[1] !== "-a") {
      throw new Error("spawnSync failed");
    }
    commands.push(formatCommand(command, argList));
    if (command === "docker" && argList[0] === "ps" && argList[1] === "-a") {
      return { pid: 0, status: 0, stdout: containerExists ? "opencode-neo4j" : "", stderr: "" };
    }
    if (command === "docker" && argList[0] === "ps") {
      return { pid: 0, status: 0, stdout: containerRunning ? "opencode-neo4j" : "", stderr: "" };
    }
    if (command === "docker" && argList[0] === "start") {
      startCalls += 1;
      if (forceStartError) {
        return { pid: 1, status: 1, stdout: "", stderr: "start failed", error: new Error("start failed") };
      }
      return { pid: 0, status: 0, stdout: "started", stderr: "" };
    }
    return { pid: 0, status: 0, stdout: "", stderr: "" };
  },
  neo4j: neo4jStub,
  isNeo4jAccessible: async () => {
    try {
      const testDriver = neo4jStub.driver();
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
  },
});

describe("neo4j docker helper", () => {
  let envState: ReturnType<typeof snapshotEnv>;
  let deps: Neo4jDockerDeps;

  const reset = () => {
    dockerAvailable = true;
    containerExists = false;
    containerRunning = false;
    runOutcomes = [];
    defaultRunSuccess = true;
    spawnCalls = 0;
    startCalls = 0;
    forceStartError = false;
    commands = [];
    spawnSyncThrowsFor = undefined;
    driverThrows = false;
    setNeo4jIntegrationsConfig(undefined);
  };

  const withFastTimeout = async <T>(fn: () => Promise<T>): Promise<T> => {
    const originalNow = Date.now;
    const originalSetTimeout = globalThis.setTimeout;
    let now = originalNow();
    Date.now = () => {
      now += 60_000;
      return now;
    };
    globalThis.setTimeout = ((handler: (...args: unknown[]) => void) => {
      handler();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;
    try {
      return await fn();
    } finally {
      Date.now = originalNow;
      globalThis.setTimeout = originalSetTimeout;
    }
  };

  beforeEach(() => {
    envState = snapshotEnv();
    reset();
    process.env.HOME = process.cwd();
    process.env.USERPROFILE = process.cwd();
    process.env.OPENCODE_ORCH_PROJECT_DIR = process.cwd();
    deps = buildDeps();
  });

  afterEach(() => {
    setNeo4jIntegrationsConfig(undefined);
    restoreEnv(envState);
  });

  test("handles disabled and missing config states", async () => {
    const { ensureNeo4jRunning } = await import("../../src/memory/neo4j-docker");

    expect(await ensureNeo4jRunning({ enabled: false }, deps)).toEqual({
      status: "disabled",
      message: "Neo4j integration is disabled",
    });

    expect(await ensureNeo4jRunning({ autoStart: false }, deps)).toEqual({
      status: "disabled",
      message: "Neo4j autoStart is disabled",
    });

    clearEnvConfig();
    setNeo4jIntegrationsConfig({ enabled: false, uri: "bolt://disabled", username: "neo4j", password: "pw" });
    const noConfig = await ensureNeo4jRunning({ enabled: true, autoStart: true }, deps);
    expect(noConfig.status).toBe("no_config");
    setNeo4jIntegrationsConfig(undefined);
  });

  test("handles availability and docker states", async () => {
    const { ensureNeo4jRunning } = await import("../../src/memory/neo4j-docker");

    setEnvConfig();
    runOutcomes = [true];
    const running = await ensureNeo4jRunning({}, deps);
    expect(running.status).toBe("already_running");

    runOutcomes = [false];
    dockerAvailable = false;
    const noDocker = await ensureNeo4jRunning({}, deps);
    expect(noDocker.status).toBe("no_docker");

    dockerAvailable = true;
    containerExists = true;
    containerRunning = false;
    runOutcomes = [false, true];
    const started = await ensureNeo4jRunning({}, deps);
    expect(commands.some((cmd) => cmd.includes("docker ps -a"))).toBe(true);
    expect(started.status).toBe("started");
    expect(startCalls).toBeGreaterThan(0);

    runOutcomes = [false, false];
    defaultRunSuccess = false;
    const failedStart = await withFastTimeout(() => ensureNeo4jRunning({}, deps));
    expect(failedStart.status).toBe("failed");

    containerExists = false;
    runOutcomes = [false, true];
    defaultRunSuccess = true;
    const created = await ensureNeo4jRunning({}, deps);
    expect(created.status).toBe("created");
    expect(spawnCalls).toBeGreaterThan(0);

    runOutcomes = [false, false];
    defaultRunSuccess = false;
    const failedCreate = await withFastTimeout(() => ensureNeo4jRunning({}, deps));
    expect(failedCreate.status).toBe("failed");
  });

  test("returns failed status on unexpected errors", async () => {
    const { ensureNeo4jRunning } = await import("../../src/memory/neo4j-docker");

    setEnvConfig();
    containerExists = true;
    dockerAvailable = true;
    runOutcomes = [false];
    defaultRunSuccess = true;
    containerRunning = false;
    forceStartError = true;

    const result = await ensureNeo4jRunning(
      {
      enabled: true,
      autoStart: true,
      image: "neo4j:latest",
      uri: "bolt://localhost:7687",
      },
      deps,
    );
    expect(result.status).toBe("failed");
  });

  test("handles spawnSync failures and invalid configs", async () => {
    const { ensureNeo4jRunning } = await import("../../src/memory/neo4j-docker");

    setEnvConfig();
    runOutcomes = [false, true];
    spawnSyncThrowsFor = "ps-a";
    const psAResult = await ensureNeo4jRunning({ image: "neo4j:latest" }, deps);
    expect(psAResult.status).toBe("created");

    spawnSyncThrowsFor = "ps";
    containerExists = true;
    runOutcomes = [false, true];
    const psResult = await ensureNeo4jRunning({ image: "neo4j:latest" }, deps);
    expect(psResult.status).toBe("started");

    spawnSyncThrowsFor = undefined;
    containerExists = false;
    containerRunning = false;
    runOutcomes = [false];
    const badImage = await ensureNeo4jRunning({ image: "bad;image", uri: "bolt://localhost:7687" }, deps);
    expect(badImage.status).toBe("failed");

    runOutcomes = [false];
    const badPort = await ensureNeo4jRunning({ image: "neo4j:latest", uri: "bolt://localhost:bad" }, deps);
    expect(badPort.status).toBe("failed");
  });

  test("waits through driver and session failures", async () => {
    const { ensureNeo4jRunning } = await import("../../src/memory/neo4j-docker");

    setEnvConfig();
    containerExists = true;
    containerRunning = false;
    runOutcomes = [false, false, true];
    const recovered = await ensureNeo4jRunning({ image: "neo4j:latest" }, deps);
    expect(recovered.status).toBe("started");

    driverThrows = true;
    runOutcomes = [false];
    const driverFail = await withFastTimeout(() => ensureNeo4jRunning({ image: "neo4j:latest" }, deps));
    expect(driverFail.status).toBe("failed");
    driverThrows = false;
  });
});
