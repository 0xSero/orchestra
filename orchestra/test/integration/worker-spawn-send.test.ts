import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createApi } from "../../src/api";
import type { WorkerProfile } from "../../src/types";
import { WorkerRegistry } from "../../src/workers/registry";
import { sendWorkerMessage } from "../../src/workers/send";
import { spawnWorker } from "../../src/workers/spawn";
import { setupE2eEnv } from "../helpers/e2e-env";

let restoreEnv: (() => void) | undefined;

describe("worker spawn + send", () => {
  beforeAll(async () => {
    const env = await setupE2eEnv();
    restoreEnv = env.restore;
  });

  afterAll(() => {
    restoreEnv?.();
  });

  test("spawns a worker and sends a message", async () => {
    const api = createApi({ config: { directory: process.cwd() }, deps: {} });
    const registry = new WorkerRegistry();

    const profile: WorkerProfile = {
      id: "test-worker",
      name: "Test Worker",
      model: "opencode/gpt-5-nano",
      purpose: "Test worker",
      whenToUse: "Testing",
    };

    const instance = await spawnWorker({
      api,
      registry,
      directory: process.cwd(),
      profile,
      timeoutMs: 60_000,
    });

    try {
      expect(instance.status).toBe("ready");
      expect(instance.sessionId).toBeTruthy();

      const res = await sendWorkerMessage({
        registry,
        workerId: profile.id,
        message: "Reply with exactly: pong",
      });

      expect(res.success).toBe(true);
      expect(res.response?.toLowerCase()).toContain("pong");
    } finally {
      await instance.shutdown?.();
    }
  }, 180_000);
});
