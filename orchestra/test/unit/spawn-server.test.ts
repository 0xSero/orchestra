import { describe, expect, test } from "bun:test";
import { applyServerBundleToInstance, createWorkerSession, startWorkerServer } from "../../src/workers/spawn-server";
import type { WorkerInstance } from "../../src/types";

describe("spawn server helpers", () => {
  test("startWorkerServer toggles env vars and restores them", async () => {
    const originalWorker = process.env.OPENCODE_ORCHESTRATOR_WORKER;
    const originalPlugin = process.env.OPENCODE_WORKER_PLUGIN_PATH;
    process.env.OPENCODE_ORCHESTRATOR_WORKER = "keep";
    process.env.OPENCODE_WORKER_PLUGIN_PATH = "/tmp/original";

    const api = {
      createServer: async () => ({ client: {}, server: { url: "http://127.0.0.1:9999", close: () => {} } }),
    };

    await startWorkerServer({
      api: api as never,
      hostname: "127.0.0.1",
      port: 0,
      timeoutMs: 10,
      config: {},
      pluginPath: "/tmp/plugin.mjs",
    });

    expect(process.env.OPENCODE_ORCHESTRATOR_WORKER).toBe("keep");
    expect(process.env.OPENCODE_WORKER_PLUGIN_PATH).toBe("/tmp/original");

    if (originalWorker === undefined) delete process.env.OPENCODE_ORCHESTRATOR_WORKER;
    else process.env.OPENCODE_ORCHESTRATOR_WORKER = originalWorker;

    if (originalPlugin === undefined) delete process.env.OPENCODE_WORKER_PLUGIN_PATH;
    else process.env.OPENCODE_WORKER_PLUGIN_PATH = originalPlugin;
  });

  test("createWorkerSession returns error payload on failures", async () => {
    const client = {
      session: {
        create: async () => {
          throw new Error("create failed");
        },
      },
    };

    const result = await createWorkerSession({
      client: client as never,
      directory: process.cwd(),
      timeoutMs: 1,
      title: "Worker",
    });

    expect(result).toHaveProperty("error");
  });

  test("applyServerBundleToInstance updates instance metadata", () => {
    const instance: WorkerInstance = {
      profile: { id: "alpha", name: "Alpha", model: "model-a", purpose: "", whenToUse: "" },
      status: "ready",
      port: 0,
    };

    applyServerBundleToInstance(instance, {
      client: {},
      server: { url: "http://127.0.0.1:1234", close: () => {} },
    } as never);
    expect(instance.port).toBe(1234);

    applyServerBundleToInstance(instance, {
      client: {},
      server: { url: "not-a-url", close: () => {} },
    } as never);
    expect(instance.serverUrl).toBe("not-a-url");
  });
});
