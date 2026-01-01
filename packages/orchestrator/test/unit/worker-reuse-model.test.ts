import { afterEach, describe, expect, test } from "bun:test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { upsertWorkerEntry, workerPool, type SpawnOptions } from "../../src/core/worker-pool";
import type { WorkerInstance, WorkerProfile } from "../../src/types";

const createProfile = (id: string, model: string): WorkerProfile => ({
  id,
  name: `Test ${id}`,
  model,
  purpose: "Test worker",
  whenToUse: "Unit tests",
});

const startSessionServer = async (sessionId: string) => {
  let requests = 0;
  const server = createServer((req, res) => {
    requests += 1;
    if (req.method === "GET" && req.url?.startsWith("/session")) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify([{ id: sessionId }]));
      return;
    }
    res.statusCode = 404;
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("server address unavailable");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    port: address.port,
    requests: () => requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
};

const createSpawnFn = () => {
  let spawned = false;
  const spawnFn = async (resolved: WorkerProfile, options: SpawnOptions) => {
    spawned = true;
    const instance: WorkerInstance = {
      profile: resolved,
      status: "ready",
      port: 0,
      directory: options.directory,
      startedAt: new Date(),
    };
    workerPool.register(instance);
    return instance;
  };
  return { spawnFn, wasSpawned: () => spawned };
};

afterEach(async () => {
  await workerPool.stopAll();
});

describe("worker reuse model compatibility", () => {
  test("reuses server worker when model matches", async () => {
    const previousConfigDir = process.env.XDG_CONFIG_HOME;
    const configDir = await mkdtemp(join(tmpdir(), "opencode-orch-"));
    process.env.XDG_CONFIG_HOME = configDir;

    const profile = createProfile("reuse-match", "opencode/gpt-5-nano");
    const server = await startSessionServer("session-1");

    try {
      await upsertWorkerEntry({
        orchestratorInstanceId: "test",
        hostPid: process.pid,
        workerId: profile.id,
        pid: process.pid,
        url: server.url,
        port: server.port,
        sessionId: "session-1",
        status: "ready",
        startedAt: Date.now(),
        model: "opencode/gpt-5-nano",
        modelPolicy: "dynamic",
      });

      const { spawnFn, wasSpawned } = createSpawnFn();
      const instance = await workerPool.getOrSpawn(profile, {
        basePort: 0,
        timeout: 1000,
        directory: process.cwd(),
      }, spawnFn);

      expect(wasSpawned()).toBe(false);
      expect(instance.serverUrl).toBe(server.url);
      expect(instance.profile.model).toBe("opencode/gpt-5-nano");
      expect(server.requests()).toBe(1);
    } finally {
      await server.close();
      process.env.XDG_CONFIG_HOME = previousConfigDir;
      await rm(configDir, { recursive: true, force: true });
    }
  });

  test("skips reuse when model differs", async () => {
    const previousConfigDir = process.env.XDG_CONFIG_HOME;
    const configDir = await mkdtemp(join(tmpdir(), "opencode-orch-"));
    process.env.XDG_CONFIG_HOME = configDir;

    const profile = createProfile("reuse-mismatch", "opencode/gpt-5-mini");
    const server = await startSessionServer("session-1");

    try {
      await upsertWorkerEntry({
        orchestratorInstanceId: "test",
        hostPid: process.pid,
        workerId: profile.id,
        pid: process.pid,
        url: server.url,
        port: server.port,
        sessionId: "session-1",
        status: "ready",
        startedAt: Date.now(),
        model: "opencode/gpt-5-nano",
        modelPolicy: "dynamic",
      });

      const { spawnFn, wasSpawned } = createSpawnFn();
      const instance = await workerPool.getOrSpawn(profile, {
        basePort: 0,
        timeout: 1000,
        directory: process.cwd(),
      }, spawnFn);

      expect(wasSpawned()).toBe(true);
      expect(instance.profile.model).toBe(profile.model);
      expect(server.requests()).toBe(0);
    } finally {
      await server.close();
      process.env.XDG_CONFIG_HOME = previousConfigDir;
      await rm(configDir, { recursive: true, force: true });
    }
  });

  test("forceNew bypasses reuse", async () => {
    const previousConfigDir = process.env.XDG_CONFIG_HOME;
    const configDir = await mkdtemp(join(tmpdir(), "opencode-orch-"));
    process.env.XDG_CONFIG_HOME = configDir;

    const profile = createProfile("reuse-force-new", "opencode/gpt-5-nano");
    const server = await startSessionServer("session-1");

    try {
      await upsertWorkerEntry({
        orchestratorInstanceId: "test",
        hostPid: process.pid,
        workerId: profile.id,
        pid: process.pid,
        url: server.url,
        port: server.port,
        sessionId: "session-1",
        status: "ready",
        startedAt: Date.now(),
        model: "opencode/gpt-5-nano",
        modelPolicy: "dynamic",
      });

      const { spawnFn, wasSpawned } = createSpawnFn();
      const instance = await workerPool.getOrSpawn(profile, {
        basePort: 0,
        timeout: 1000,
        directory: process.cwd(),
        forceNew: true,
      }, spawnFn);

      expect(wasSpawned()).toBe(true);
      expect(instance.profile.model).toBe(profile.model);
      expect(server.requests()).toBe(0);
    } finally {
      await server.close();
      process.env.XDG_CONFIG_HOME = previousConfigDir;
      await rm(configDir, { recursive: true, force: true });
    }
  });
});
