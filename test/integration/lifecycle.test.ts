import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ensureRuntime, shutdownAllWorkers } from "../../src/core/runtime";
import { HealthMonitor } from "../../src/core/health-monitor";
import { warmPool } from "../../src/core/warm-pool";
import { workerPool } from "../../src/core/worker-pool";
import { spawnWorker } from "../../src/workers/spawner";
import type { WorkerProfile } from "../../src/types";

const directory = process.cwd();
const MODEL = "opencode/gpt-5-nano";

const healthProfile: WorkerProfile = {
  id: "health-check",
  name: "Health Check",
  model: MODEL,
  purpose: "Health monitor test",
  whenToUse: "tests",
};

const warmProfile: WorkerProfile = {
  id: "warm-check",
  name: "Warm Check",
  model: MODEL,
  purpose: "Warm pool test",
  whenToUse: "tests",
};

describe("lifecycle integration", () => {
  beforeAll(async () => {
    await ensureRuntime();
  });

  afterAll(async () => {
    warmPool.stop();
    await shutdownAllWorkers().catch(() => {});
  });

  test(
    "health monitor marks dead workers",
    async () => {
      const instance = await spawnWorker(healthProfile, { basePort: 0, timeout: 60_000, directory });
      const monitor = new HealthMonitor(workerPool, { intervalMs: 200, timeoutMs: 1000, maxRetries: 1, enabled: true });
      monitor.start();

      if (instance.pid) {
        try {
          process.kill(instance.pid, "SIGTERM");
        } catch {
          // ignore
        }
      }

      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        if (!workerPool.get(healthProfile.id)) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      monitor.stop();

      expect(workerPool.get(healthProfile.id)).toBeUndefined();
    },
    120_000
  );

  test(
    "warm pool prewarms and evicts idle workers",
    async () => {
      warmPool.configure({
        config: { enabled: true, profiles: { [warmProfile.id]: { size: 1, idleTimeoutMs: 100 } } },
        profiles: { [warmProfile.id]: warmProfile },
        spawnOptions: { basePort: 0, timeout: 60_000, directory },
        spawnFn: spawnWorker,
      });

      await warmPool.tickOnce();
      const instance = workerPool.get(warmProfile.id);
      expect(instance).toBeTruthy();

      if (instance) {
        instance.lastActivity = new Date(Date.now() - 1000);
      }

      await warmPool.tickOnce();

      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        if (!workerPool.get(warmProfile.id)) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      expect(workerPool.get(warmProfile.id)).toBeUndefined();
      warmPool.stop();
    },
    180_000
  );
});
