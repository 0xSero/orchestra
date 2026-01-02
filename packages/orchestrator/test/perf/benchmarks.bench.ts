/**
 * Comprehensive performance benchmark suite
 *
 * Benchmarks key operations to establish performance baselines and detect regressions:
 * - Worker spawn time
 * - Config loading
 * - Registry operations
 * - Lock acquisition
 * - Message passing
 *
 * @module test/perf/benchmarks.bench
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "bun:test";
import { rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { benchmark, type BenchmarkResult } from "../helpers/benchmark";
import { createCleanupManager } from "../helpers/cleanup";
import { createTestProfile, createTestConfig } from "../helpers/fixtures";
import type { CleanupManager } from "../helpers/cleanup";
import type {
  WorkerInstance,
  WorkerProfile,
  OrchestratorConfig,
} from "../../src/types";

/**
 * Performance thresholds for key operations
 * These can be adjusted based on acceptable performance levels
 */
const PERFORMANCE_THRESHOLDS = {
  /** Worker spawn time P95 threshold in ms */
  spawnP95Ms: 5000,
  /** Config loading P95 threshold in ms */
  configLoadP95Ms: 100,
  /** Registry read P95 threshold in ms */
  registryReadP95Ms: 50,
  /** Lock acquisition P95 threshold in ms */
  lockAcquireP95Ms: 100,
  /** Message send P95 threshold in ms */
  messageSendP95Ms: 10,
  /** Memory growth threshold in MB for 1000 ops */
  memoryGrowthMb: 50,
};

/**
 * Mock worker spawner for benchmarking spawn-related operations
 * without actually spawning real processes
 */
class MockSpawner {
  private spawnDelayMs: number;
  private successRate: number;
  private spawnCount = 0;

  constructor(options: { spawnDelayMs?: number; successRate?: number } = {}) {
    this.spawnDelayMs = options.spawnDelayMs ?? 50;
    this.successRate = options.successRate ?? 1.0;
  }

  async spawnWorker(profile: WorkerProfile): Promise<WorkerInstance> {
    // Simulate spawn time
    await new Promise((resolve) => setTimeout(resolve, this.spawnDelayMs));

    // Simulate occasional failures
    if (Math.random() > this.successRate) {
      throw new Error("Simulated spawn failure");
    }

    this.spawnCount++;

    return {
      profile,
      status: "ready",
      port: 14000 + this.spawnCount,
      pid: 10000 + this.spawnCount,
      serverUrl: `http://localhost:${14000 + this.spawnCount}`,
      startedAt: new Date(),
      lastActivity: new Date(),
    };
  }

  get totalSpawns(): number {
    return this.spawnCount;
  }

  reset(): void {
    this.spawnCount = 0;
  }
}

/**
 * Mock config loader for benchmarking
 */
class MockConfigLoader {
  private configs: Map<string, OrchestratorConfig> = new Map();
  private loadDelayMs: number;
  private loadCount = 0;

  constructor(options: { loadDelayMs?: number } = {}) {
    this.loadDelayMs = options.loadDelayMs ?? 5;
  }

  async loadConfig(path: string): Promise<OrchestratorConfig> {
    await new Promise((resolve) => setTimeout(resolve, this.loadDelayMs));
    this.loadCount++;

    if (this.configs.has(path)) {
      return this.configs.get(path)!;
    }

    return createTestConfig();
  }

  setConfig(path: string, config: OrchestratorConfig): void {
    this.configs.set(path, config);
  }

  get totalLoads(): number {
    return this.loadCount;
  }

  reset(): void {
    this.loadCount = 0;
  }
}

/**
 * Mock registry for benchmarking
 */
class MockRegistry {
  private workers: Map<string, WorkerInstance> = new Map();
  private readDelayMs: number;
  private writeDelayMs: number;
  private readCount = 0;
  private writeCount = 0;

  constructor(options: { readDelayMs?: number; writeDelayMs?: number } = {}) {
    this.readDelayMs = options.readDelayMs ?? 1;
    this.writeDelayMs = options.writeDelayMs ?? 2;
  }

  async getWorker(id: string): Promise<WorkerInstance | undefined> {
    await new Promise((resolve) => setTimeout(resolve, this.readDelayMs));
    this.readCount++;
    return this.workers.get(id);
  }

  async registerWorker(instance: WorkerInstance): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, this.writeDelayMs));
    this.writeCount++;
    this.workers.set(instance.profile.id, instance);
  }

  async listWorkers(): Promise<WorkerInstance[]> {
    await new Promise((resolve) => setTimeout(resolve, this.readDelayMs));
    this.readCount++;
    return Array.from(this.workers.values());
  }

  get stats() {
    return {
      size: this.workers.size,
      reads: this.readCount,
      writes: this.writeCount,
    };
  }

  clear(): void {
    this.workers.clear();
    this.readCount = 0;
    this.writeCount = 0;
  }
}

/**
 * Mock lock manager for benchmarking
 */
class MockLockManager {
  private locks: Map<string, { owner: string; acquiredAt: number }> = new Map();
  private acquireDelayMs: number;
  private releaseDelayMs: number;
  private acquireCount = 0;
  private releaseCount = 0;
  private contentionCount = 0;

  constructor(
    options: { acquireDelayMs?: number; releaseDelayMs?: number } = {},
  ) {
    this.acquireDelayMs = options.acquireDelayMs ?? 5;
    this.releaseDelayMs = options.releaseDelayMs ?? 1;
  }

  async acquire(
    lockId: string,
    owner: string,
    timeoutMs = 5000,
  ): Promise<() => Promise<void>> {
    const startTime = Date.now();

    // Simulate lock acquisition with potential contention
    while (this.locks.has(lockId)) {
      this.contentionCount++;
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(`Lock acquisition timeout: ${lockId}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    await new Promise((resolve) => setTimeout(resolve, this.acquireDelayMs));
    this.acquireCount++;

    this.locks.set(lockId, { owner, acquiredAt: Date.now() });

    return async () => {
      await new Promise((resolve) => setTimeout(resolve, this.releaseDelayMs));
      this.releaseCount++;
      this.locks.delete(lockId);
    };
  }

  get stats() {
    return {
      held: this.locks.size,
      acquires: this.acquireCount,
      releases: this.releaseCount,
      contentions: this.contentionCount,
    };
  }

  clear(): void {
    this.locks.clear();
    this.acquireCount = 0;
    this.releaseCount = 0;
    this.contentionCount = 0;
  }
}

/**
 * Mock message bus for benchmarking
 */
class MockMessageBus {
  private subscribers: Map<string, Set<(msg: unknown) => void>> = new Map();
  private sendDelayMs: number;
  private messageCount = 0;

  constructor(options: { sendDelayMs?: number } = {}) {
    this.sendDelayMs = options.sendDelayMs ?? 1;
  }

  subscribe(topic: string, handler: (msg: unknown) => void): () => void {
    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, new Set());
    }
    this.subscribers.get(topic)!.add(handler);

    return () => {
      this.subscribers.get(topic)?.delete(handler);
    };
  }

  async send(topic: string, message: unknown): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, this.sendDelayMs));
    this.messageCount++;

    const handlers = this.subscribers.get(topic);
    if (handlers) {
      for (const handler of handlers) {
        handler(message);
      }
    }
  }

  get stats() {
    return {
      topics: this.subscribers.size,
      totalMessages: this.messageCount,
    };
  }

  clear(): void {
    this.subscribers.clear();
    this.messageCount = 0;
  }
}

describe("Performance Benchmarks Suite", () => {
  let cleanup: CleanupManager;
  let tempDir: string;
  let allResults: Map<string, BenchmarkResult>;

  beforeAll(async () => {
    tempDir = join(process.cwd(), ".tmp", "benchmarks");
    await mkdir(tempDir, { recursive: true });
    allResults = new Map();
  });

  afterAll(async () => {
    // Print summary of all benchmarks
    console.log("\n========== BENCHMARK SUMMARY ==========\n");

    for (const [name, result] of allResults) {
      const passedThreshold = checkThreshold(name, result);
      const status = passedThreshold ? "✅" : "❌";

      console.log(`${status} ${name}`);
      console.log(
        `   Mean: ${result.mean.toFixed(2)}ms | P95: ${result.p95.toFixed(2)}ms | P99: ${result.p99.toFixed(2)}ms`,
      );
      console.log(
        `   Ops/sec: ${result.opsPerSecond.toFixed(0)} | Iterations: ${result.iterations}`,
      );
      console.log("");
    }

    console.log("========================================\n");

    if (existsSync(tempDir)) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    cleanup = createCleanupManager();
  });

  afterEach(async () => {
    await cleanup.cleanupAll();
  });

  /**
   * Check if a result passes its threshold
   */
  function checkThreshold(name: string, result: BenchmarkResult): boolean {
    if (name.includes("spawn")) {
      return result.p95 < PERFORMANCE_THRESHOLDS.spawnP95Ms;
    }
    if (name.includes("config")) {
      return result.p95 < PERFORMANCE_THRESHOLDS.configLoadP95Ms;
    }
    if (name.includes("registry")) {
      return result.p95 < PERFORMANCE_THRESHOLDS.registryReadP95Ms;
    }
    if (name.includes("lock")) {
      return result.p95 < PERFORMANCE_THRESHOLDS.lockAcquireP95Ms;
    }
    if (name.includes("message")) {
      return result.p95 < PERFORMANCE_THRESHOLDS.messageSendP95Ms;
    }
    return true; // No threshold defined
  }

  describe("Worker Spawn Benchmarks", () => {
    test("benchmark: worker spawn time (simulated)", async () => {
      const spawner = new MockSpawner({ spawnDelayMs: 50 });
      const profile = createTestProfile("bench-worker");

      const result = await benchmark(
        "spawn-worker-simulated",
        async () => {
          await spawner.spawnWorker(profile);
        },
        { iterations: 50, warmup: 5 },
      );

      allResults.set("spawn-worker-simulated", result);

      console.log(
        `[SPAWN] Mean: ${result.mean.toFixed(2)}ms, P95: ${result.p95.toFixed(2)}ms`,
      );

      // Simulated spawn should be roughly the delay time
      expect(result.mean).toBeGreaterThan(40);
      expect(result.mean).toBeLessThan(100);
    });

    test("benchmark: concurrent spawn overhead", async () => {
      const spawner = new MockSpawner({ spawnDelayMs: 50 });

      const result = await benchmark(
        "spawn-concurrent-5",
        async () => {
          const profiles = Array.from({ length: 5 }, (_, i) =>
            createTestProfile(`concurrent-${i}`),
          );
          await Promise.all(profiles.map((p) => spawner.spawnWorker(p)));
        },
        { iterations: 20, warmup: 3 },
      );

      allResults.set("spawn-concurrent-5", result);

      console.log(
        `[SPAWN CONCURRENT] Mean: ${result.mean.toFixed(2)}ms for 5 concurrent`,
      );

      // Concurrent should complete in roughly the same time as single (parallel)
      expect(result.mean).toBeLessThan(150); // Some overhead expected
    });

    test("benchmark: spawn with failure recovery", async () => {
      const spawner = new MockSpawner({ spawnDelayMs: 30, successRate: 0.8 });
      const profile = createTestProfile("flaky-worker");

      const result = await benchmark(
        "spawn-with-retry",
        async () => {
          let attempts = 0;
          while (attempts < 3) {
            try {
              await spawner.spawnWorker(profile);
              return;
            } catch {
              attempts++;
            }
          }
        },
        { iterations: 50, warmup: 5 },
      );

      allResults.set("spawn-with-retry", result);

      console.log(
        `[SPAWN RETRY] Mean: ${result.mean.toFixed(2)}ms with 20% failure rate`,
      );
    });
  });

  describe("Config Loading Benchmarks", () => {
    test("benchmark: config loading (cached)", async () => {
      const loader = new MockConfigLoader({ loadDelayMs: 2 });
      const configPath = join(tempDir, "test-config.json");

      // Pre-cache the config
      loader.setConfig(configPath, createTestConfig());

      const result = await benchmark(
        "config-load-cached",
        async () => {
          await loader.loadConfig(configPath);
        },
        { iterations: 500, warmup: 10 },
      );

      allResults.set("config-load-cached", result);

      console.log(
        `[CONFIG CACHED] Mean: ${result.mean.toFixed(3)}ms, Ops/sec: ${result.opsPerSecond.toFixed(0)}`,
      );

      expect(result.p95).toBeLessThan(PERFORMANCE_THRESHOLDS.configLoadP95Ms);
    });

    test("benchmark: config loading (cold)", async () => {
      const loader = new MockConfigLoader({ loadDelayMs: 10 });

      let counter = 0;
      const result = await benchmark(
        "config-load-cold",
        async () => {
          // Each iteration uses a different path (cold cache)
          await loader.loadConfig(`/path/to/config-${counter++}.json`);
        },
        { iterations: 100, warmup: 5 },
      );

      allResults.set("config-load-cold", result);

      console.log(`[CONFIG COLD] Mean: ${result.mean.toFixed(2)}ms`);
    });

    test("benchmark: config parsing (in-memory)", async () => {
      const configJson = JSON.stringify(createTestConfig());

      const result = await benchmark(
        "config-parse-json",
        () => {
          JSON.parse(configJson);
        },
        { iterations: 10000, warmup: 100 },
      );

      allResults.set("config-parse-json", result);

      console.log(
        `[CONFIG PARSE] Mean: ${result.mean.toFixed(4)}ms, Ops/sec: ${result.opsPerSecond.toFixed(0)}`,
      );

      // JSON parsing should be very fast
      expect(result.mean).toBeLessThan(1);
    });
  });

  describe("Registry Operation Benchmarks", () => {
    test("benchmark: registry read (single worker)", async () => {
      const registry = new MockRegistry({ readDelayMs: 1 });
      const worker: WorkerInstance = {
        profile: createTestProfile("reg-worker"),
        status: "ready",
        port: 14000,
        pid: 10000,
        serverUrl: "http://localhost:14000",
        startedAt: new Date(),
        lastActivity: new Date(),
      };

      await registry.registerWorker(worker);

      const result = await benchmark(
        "registry-read-single",
        async () => {
          await registry.getWorker("reg-worker");
        },
        { iterations: 500, warmup: 10 },
      );

      allResults.set("registry-read-single", result);

      console.log(`[REGISTRY READ] Mean: ${result.mean.toFixed(3)}ms`);

      expect(result.p95).toBeLessThan(PERFORMANCE_THRESHOLDS.registryReadP95Ms);
    });

    test("benchmark: registry list (100 workers)", async () => {
      const registry = new MockRegistry({ readDelayMs: 1 });

      // Seed with 100 workers
      for (let i = 0; i < 100; i++) {
        await registry.registerWorker({
          profile: createTestProfile(`list-worker-${i}`),
          status: i % 3 === 0 ? "busy" : "ready",
          port: 14000 + i,
          pid: 10000 + i,
          serverUrl: `http://localhost:${14000 + i}`,
          startedAt: new Date(),
          lastActivity: new Date(),
        });
      }

      const result = await benchmark(
        "registry-list-100",
        async () => {
          await registry.listWorkers();
        },
        { iterations: 200, warmup: 10 },
      );

      allResults.set("registry-list-100", result);

      console.log(
        `[REGISTRY LIST] Mean: ${result.mean.toFixed(2)}ms for 100 workers`,
      );
    });

    test("benchmark: registry write throughput", async () => {
      const registry = new MockRegistry({ writeDelayMs: 1 });
      let counter = 0;

      const result = await benchmark(
        "registry-write",
        async () => {
          await registry.registerWorker({
            profile: createTestProfile(`write-worker-${counter++}`),
            status: "ready",
            port: 15000 + counter,
            pid: 20000 + counter,
            serverUrl: `http://localhost:${15000 + counter}`,
            startedAt: new Date(),
            lastActivity: new Date(),
          });
        },
        { iterations: 200, warmup: 10 },
      );

      allResults.set("registry-write", result);

      console.log(
        `[REGISTRY WRITE] Mean: ${result.mean.toFixed(2)}ms, Throughput: ${result.opsPerSecond.toFixed(0)} ops/sec`,
      );
    });
  });

  describe("Lock Acquisition Benchmarks", () => {
    test("benchmark: uncontested lock acquisition", async () => {
      const lockManager = new MockLockManager({
        acquireDelayMs: 3,
        releaseDelayMs: 1,
      });
      let lockCounter = 0;

      const result = await benchmark(
        "lock-acquire-uncontested",
        async () => {
          const release = await lockManager.acquire(
            `lock-${lockCounter++}`,
            "owner-1",
          );
          await release();
        },
        { iterations: 200, warmup: 10 },
      );

      allResults.set("lock-acquire-uncontested", result);

      console.log(`[LOCK UNCONTESTED] Mean: ${result.mean.toFixed(2)}ms`);

      expect(result.p95).toBeLessThan(PERFORMANCE_THRESHOLDS.lockAcquireP95Ms);
    });

    test("benchmark: same lock reacquisition", async () => {
      const lockManager = new MockLockManager({
        acquireDelayMs: 3,
        releaseDelayMs: 1,
      });
      const lockId = "reused-lock";

      const result = await benchmark(
        "lock-reacquire-same",
        async () => {
          const release = await lockManager.acquire(lockId, "owner-1");
          await release();
        },
        { iterations: 100, warmup: 5 },
      );

      allResults.set("lock-reacquire-same", result);

      console.log(`[LOCK REACQUIRE] Mean: ${result.mean.toFixed(2)}ms`);
    });

    test("benchmark: concurrent lock contention", async () => {
      const lockManager = new MockLockManager({
        acquireDelayMs: 2,
        releaseDelayMs: 1,
      });
      const lockId = "contended-lock";

      const result = await benchmark(
        "lock-contention",
        async () => {
          // 3 concurrent acquires on same lock
          await Promise.all([
            (async () => {
              const release = await lockManager.acquire(lockId, "owner-1");
              await new Promise((r) => setTimeout(r, 5));
              await release();
            })(),
            (async () => {
              const release = await lockManager.acquire(lockId, "owner-2");
              await new Promise((r) => setTimeout(r, 5));
              await release();
            })(),
            (async () => {
              const release = await lockManager.acquire(lockId, "owner-3");
              await new Promise((r) => setTimeout(r, 5));
              await release();
            })(),
          ]);
        },
        { iterations: 30, warmup: 3 },
      );

      allResults.set("lock-contention", result);

      const stats = lockManager.stats;
      console.log(
        `[LOCK CONTENTION] Mean: ${result.mean.toFixed(2)}ms, Contentions: ${stats.contentions}`,
      );
    });
  });

  describe("Message Passing Benchmarks", () => {
    test("benchmark: message send (no subscribers)", async () => {
      const bus = new MockMessageBus({ sendDelayMs: 0.5 });

      const result = await benchmark(
        "message-send-no-sub",
        async () => {
          await bus.send("test-topic", { type: "test", data: "hello" });
        },
        { iterations: 1000, warmup: 50 },
      );

      allResults.set("message-send-no-sub", result);

      console.log(
        `[MESSAGE NO SUB] Mean: ${result.mean.toFixed(3)}ms, Throughput: ${result.opsPerSecond.toFixed(0)} msg/sec`,
      );

      expect(result.p95).toBeLessThan(PERFORMANCE_THRESHOLDS.messageSendP95Ms);
    });

    test("benchmark: message send (with subscribers)", async () => {
      const bus = new MockMessageBus({ sendDelayMs: 0.5 });

      // Add 10 subscribers
      for (let i = 0; i < 10; i++) {
        bus.subscribe("test-topic", () => {
          // No-op handler
        });
      }

      const result = await benchmark(
        "message-send-10-subs",
        async () => {
          await bus.send("test-topic", { type: "test", data: "hello" });
        },
        { iterations: 500, warmup: 20 },
      );

      allResults.set("message-send-10-subs", result);

      console.log(`[MESSAGE 10 SUBS] Mean: ${result.mean.toFixed(3)}ms`);
    });

    test("benchmark: message throughput burst", async () => {
      const bus = new MockMessageBus({ sendDelayMs: 0.1 });
      let received = 0;

      bus.subscribe("burst-topic", () => {
        received++;
      });

      const burstSize = 100;
      const result = await benchmark(
        "message-burst-100",
        async () => {
          received = 0;
          await Promise.all(
            Array.from({ length: burstSize }, (_, i) =>
              bus.send("burst-topic", { index: i }),
            ),
          );
        },
        { iterations: 50, warmup: 5 },
      );

      allResults.set("message-burst-100", result);

      const msgsPerSecond = burstSize * result.opsPerSecond;
      console.log(
        `[MESSAGE BURST] Mean: ${result.mean.toFixed(2)}ms for ${burstSize} messages`,
      );
      console.log(
        `[MESSAGE BURST] Throughput: ${msgsPerSecond.toFixed(0)} msgs/sec`,
      );
    });
  });

  describe("Memory Efficiency Benchmarks", () => {
    test("benchmark: memory footprint under load", async () => {
      const registry = new MockRegistry();
      const bus = new MockMessageBus();

      // Force GC if available
      if (global.gc) global.gc();
      const baselineMemory = process.memoryUsage().heapUsed;

      // Create many operations
      const operationCount = 1000;

      for (let i = 0; i < operationCount; i++) {
        await registry.registerWorker({
          profile: createTestProfile(`mem-worker-${i}`, {
            purpose:
              "Memory test worker with some extra text to consume memory",
          }),
          status: "ready",
          port: 16000 + i,
          pid: 30000 + i,
          serverUrl: `http://localhost:${16000 + i}`,
          startedAt: new Date(),
          lastActivity: new Date(),
        });

        await bus.send("mem-topic", {
          operation: i,
          data: `Some payload data for message ${i}`,
        });
      }

      // Force GC if available
      if (global.gc) global.gc();
      const finalMemory = process.memoryUsage().heapUsed;

      const memoryGrowthMb = (finalMemory - baselineMemory) / (1024 * 1024);

      console.log(
        `[MEMORY] Growth after ${operationCount} ops: ${memoryGrowthMb.toFixed(2)}MB`,
      );
      console.log(
        `[MEMORY] Baseline: ${(baselineMemory / (1024 * 1024)).toFixed(2)}MB, Final: ${(finalMemory / (1024 * 1024)).toFixed(2)}MB`,
      );

      expect(memoryGrowthMb).toBeLessThan(
        PERFORMANCE_THRESHOLDS.memoryGrowthMb,
      );
    });
  });

  describe("Combined Operation Benchmarks", () => {
    test("benchmark: typical workflow (spawn + register + message)", async () => {
      const spawner = new MockSpawner({ spawnDelayMs: 30 });
      const registry = new MockRegistry({ readDelayMs: 1, writeDelayMs: 2 });
      const bus = new MockMessageBus({ sendDelayMs: 0.5 });

      let counter = 0;

      const result = await benchmark(
        "workflow-spawn-register-message",
        async () => {
          // Spawn worker
          const profile = createTestProfile(`workflow-${counter++}`);
          const instance = await spawner.spawnWorker(profile);

          // Register in registry
          await registry.registerWorker(instance);

          // Send notification
          await bus.send("worker-registered", {
            workerId: instance.profile.id,
          });
        },
        { iterations: 50, warmup: 5 },
      );

      allResults.set("workflow-spawn-register-message", result);

      console.log(
        `[WORKFLOW] Mean: ${result.mean.toFixed(2)}ms for complete workflow`,
      );
    });

    test("benchmark: config reload + registry refresh", async () => {
      const loader = new MockConfigLoader({ loadDelayMs: 5 });
      const registry = new MockRegistry({ readDelayMs: 1 });

      const result = await benchmark(
        "workflow-config-refresh",
        async () => {
          await loader.loadConfig("/config/path.json");
          await registry.listWorkers();
        },
        { iterations: 100, warmup: 10 },
      );

      allResults.set("workflow-config-refresh", result);

      console.log(`[CONFIG REFRESH] Mean: ${result.mean.toFixed(2)}ms`);
    });
  });

  describe("Threshold Validation", () => {
    test("all benchmarks should pass thresholds", async () => {
      // This test runs after all benchmarks and validates thresholds
      const failures: string[] = [];

      for (const [name, result] of allResults) {
        if (!checkThreshold(name, result)) {
          failures.push(
            `${name}: P95 ${result.p95.toFixed(2)}ms exceeded threshold`,
          );
        }
      }

      if (failures.length > 0) {
        console.log("\n❌ THRESHOLD FAILURES:");
        for (const failure of failures) {
          console.log(`  - ${failure}`);
        }
      }

      // Note: This assertion may fail if thresholds are too aggressive
      // Adjust PERFORMANCE_THRESHOLDS as needed for your environment
      expect(failures.length).toBe(0);
    });
  });
});
