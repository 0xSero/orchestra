import { afterAll, beforeAll, describe, expect, test, mock } from "bun:test";

let dockerAvailable = true;
let containerExists = false;
let containerRunning = false;
let runOutcomes: boolean[] = [];
let defaultRunSuccess = true;
let spawnCalls = 0;
let startCalls = 0;
let forceStartError = false;
let commands: string[] = [];
let neo4jConfig: { uri: string; username: string; password: string } | undefined = {
  uri: "bolt://localhost:7687",
  username: "neo4j",
  password: "pw",
};
let integrationsConfig: Record<string, unknown> | undefined = { enabled: true, autoStart: true };

const formatCommand = (command: string, args?: string[]) => [command, ...(args ?? [])].join(" ");

describe("neo4j docker helper", () => {
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
    neo4jConfig = { uri: "bolt://localhost:7687", username: "neo4j", password: "pw" };
    integrationsConfig = { enabled: true, autoStart: true };
  };

  beforeAll(() => {
    mock.module("node:child_process", () => ({
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
    }));

    mock.module("neo4j-driver", () => ({
      default: {
        auth: { basic: () => "auth" },
        driver: () => ({
          session: () => ({
            run: async () => {
              const outcome = runOutcomes.length > 0 ? runOutcomes.shift() : defaultRunSuccess;
              if (!outcome) throw new Error("not ready");
            },
            close: async () => {},
          }),
          close: async () => {},
        }),
      },
      auth: { basic: () => "auth" },
      driver: () => ({
        session: () => ({
          run: async () => {
            const outcome = runOutcomes.length > 0 ? runOutcomes.shift() : defaultRunSuccess;
            if (!outcome) throw new Error("not ready");
          },
          close: async () => {},
        }),
        close: async () => {},
      }),
    }));

    mock.module("../../src/memory/neo4j-config", () => ({
      getNeo4jIntegrationsConfig: () => integrationsConfig,
      loadNeo4jConfig: () => neo4jConfig,
      setNeo4jIntegrationsConfig: () => {},
      NEO4J_CONTAINER_NAME: "opencode-neo4j",
      NEO4J_DEFAULT_IMAGE: "neo4j:latest",
      NEO4J_HEALTH_CHECK_INTERVAL_MS: 0,
      NEO4J_STARTUP_TIMEOUT_MS: 1,
    }));
  });

  test("handles disabled and missing config states", async () => {
    reset();
    const { ensureNeo4jRunning } = await import("../../src/memory/neo4j-docker");

    expect(await ensureNeo4jRunning({ enabled: false })).toEqual({
      status: "disabled",
      message: "Neo4j integration is disabled",
    });

    expect(await ensureNeo4jRunning({ autoStart: false })).toEqual({
      status: "disabled",
      message: "Neo4j autoStart is disabled",
    });

    neo4jConfig = undefined;
    const noConfig = await ensureNeo4jRunning({ enabled: true, autoStart: true });
    expect(noConfig.status).toBe("no_config");
  });

  test("handles availability and docker states", async () => {
    reset();
    const { ensureNeo4jRunning } = await import("../../src/memory/neo4j-docker");

    neo4jConfig = { uri: "bolt://localhost:7687", username: "neo4j", password: "pw" };
    runOutcomes = [true];
    const running = await ensureNeo4jRunning({});
    expect(running.status).toBe("already_running");

    runOutcomes = [false];
    dockerAvailable = false;
    const noDocker = await ensureNeo4jRunning({});
    expect(noDocker.status).toBe("no_docker");

    dockerAvailable = true;
    containerExists = true;
    containerRunning = false;
    runOutcomes = [false, true];
    const started = await ensureNeo4jRunning({});
    expect(commands.some((cmd) => cmd.includes("docker ps -a"))).toBe(true);
    expect(started.status).toBe("started");
    expect(startCalls).toBeGreaterThan(0);

    runOutcomes = [false, false];
    defaultRunSuccess = false;
    const failedStart = await ensureNeo4jRunning({});
    expect(failedStart.status).toBe("failed");

    containerExists = false;
    runOutcomes = [false, true];
    defaultRunSuccess = true;
    const created = await ensureNeo4jRunning({});
    expect(created.status).toBe("created");
    expect(spawnCalls).toBeGreaterThan(0);

    runOutcomes = [false, false];
    defaultRunSuccess = false;
    const failedCreate = await ensureNeo4jRunning({});
    expect(failedCreate.status).toBe("failed");
  });

  test("returns failed status on unexpected errors", async () => {
    reset();
    const { ensureNeo4jRunning } = await import("../../src/memory/neo4j-docker");

    containerExists = true;
    dockerAvailable = true;
    runOutcomes = [false];
    defaultRunSuccess = true;
    containerRunning = false;
    forceStartError = true;

    integrationsConfig = { enabled: true, autoStart: true, image: "neo4j:latest" };
    const result = await ensureNeo4jRunning({ enabled: true, autoStart: true, image: "neo4j:latest", uri: "bolt://localhost:7687" });
    expect(result.status).toBe("failed");
  });
});

afterAll(() => {
  mock.restore();
});
