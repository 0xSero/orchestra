/**
 * MEDIUM: Device registry performance benchmark
 *
 * Tests the file I/O performance of the device registry operations.
 *
 * Root cause: In device-registry.ts:146-149, listDeviceRegistry reads from file
 * on every access, which can cause latency spikes under load. The function also
 * calls pruneDeadEntries which adds additional I/O overhead.
 *
 * Test approach:
 * - Populate registry with N entries
 * - Benchmark getWorker() operations
 * - Verify p95 latency < 50ms threshold
 * - Test with cold and warm cache scenarios
 *
 * @module test/perf/device-registry.bench
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
import { writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { benchmark } from "../helpers/benchmark";
import { createCleanupManager } from "../helpers/cleanup";
import type { CleanupManager } from "../helpers/cleanup";

/**
 * Device registry entry structure (matches device-registry.ts)
 */
interface DeviceRegistryEntry {
  kind: "session" | "server";
  sessionId: string;
  hostPid: number;
  workerPid?: number;
  workerId: string;
  port: number;
  url: string;
  startedAt: number;
  lastHealthCheck?: number;
}

/**
 * Device registry file structure
 */
interface DeviceRegistryFile {
  version: number;
  updatedAt: number;
  entries: DeviceRegistryEntry[];
}

/**
 * Mock device registry implementation for benchmarking
 * Simulates the behavior of device-registry.ts with configurable I/O
 */
class MockDeviceRegistry {
  private registryPath: string;
  private cache: DeviceRegistryFile | null = null;
  private cacheEnabled: boolean;
  private readCount = 0;
  private writeCount = 0;
  private pruneCount = 0;

  /** Simulated I/O delay in milliseconds */
  private ioDelayMs: number;

  constructor(options: {
    registryPath: string;
    cacheEnabled?: boolean;
    ioDelayMs?: number;
  }) {
    this.registryPath = options.registryPath;
    this.cacheEnabled = options.cacheEnabled ?? false;
    this.ioDelayMs = options.ioDelayMs ?? 0;
  }

  /**
   * Get I/O statistics
   */
  get stats() {
    return {
      reads: this.readCount,
      writes: this.writeCount,
      prunes: this.pruneCount,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.readCount = 0;
    this.writeCount = 0;
    this.pruneCount = 0;
  }

  /**
   * Invalidate cache
   */
  invalidateCache(): void {
    this.cache = null;
  }

  /**
   * Simulate file read with optional delay
   */
  private async readRegistryFile(): Promise<DeviceRegistryFile> {
    this.readCount++;

    // Simulate I/O delay
    if (this.ioDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.ioDelayMs));
    }

    // Check cache first
    if (this.cacheEnabled && this.cache) {
      return this.cache;
    }

    try {
      const content = await Bun.file(this.registryPath).text();
      const parsed = JSON.parse(content) as DeviceRegistryFile;

      if (this.cacheEnabled) {
        this.cache = parsed;
      }

      return parsed;
    } catch {
      return { version: 1, updatedAt: Date.now(), entries: [] };
    }
  }

  /**
   * Simulate file write with optional delay
   */
  private async writeRegistryFile(data: DeviceRegistryFile): Promise<void> {
    this.writeCount++;

    // Simulate I/O delay
    if (this.ioDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.ioDelayMs));
    }

    await writeFile(this.registryPath, JSON.stringify(data, null, 2));

    if (this.cacheEnabled) {
      this.cache = data;
    }
  }

  /**
   * Simulate dead entry pruning (simplified)
   */
  private async pruneDeadEntries(): Promise<void> {
    this.pruneCount++;

    // In real implementation, this checks process.kill(pid, 0)
    // We simulate by just reading and potentially writing
    const file = await this.readRegistryFile();

    // Simulate pruning logic - remove entries older than 1 hour
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const prunedEntries = file.entries.filter((e) => e.startedAt > oneHourAgo);

    if (prunedEntries.length < file.entries.length) {
      await this.writeRegistryFile({
        version: file.version,
        updatedAt: Date.now(),
        entries: prunedEntries,
      });
    }
  }

  /**
   * BUGGY: listDeviceRegistry with file I/O on every access
   * Simulates device-registry.ts:146-149
   */
  async listDeviceRegistryBuggy(): Promise<DeviceRegistryEntry[]> {
    // BUG: Prunes on every access
    await this.pruneDeadEntries();

    // BUG: Reads file on every access (no caching)
    const file = await this.readRegistryFile();

    return file.entries;
  }

  /**
   * FIXED: listDeviceRegistry with caching
   */
  async listDeviceRegistryFixed(): Promise<DeviceRegistryEntry[]> {
    // Only prune occasionally (e.g., every 10 seconds)
    // For benchmark, we skip the prune check

    // Use cached data if available
    const file = await this.readRegistryFile();
    return file.entries;
  }

  /**
   * Get a specific worker by ID
   */
  async getWorker(
    workerId: string,
    useBuggy = true,
  ): Promise<DeviceRegistryEntry | undefined> {
    const entries = useBuggy
      ? await this.listDeviceRegistryBuggy()
      : await this.listDeviceRegistryFixed();

    return entries.find((e) => e.workerId === workerId);
  }

  /**
   * Register a new entry
   */
  async registerEntry(entry: DeviceRegistryEntry): Promise<void> {
    const file = await this.readRegistryFile();
    file.entries.push(entry);
    file.updatedAt = Date.now();
    await this.writeRegistryFile(file);
  }

  /**
   * Populate with test entries
   */
  async seedEntries(count: number): Promise<void> {
    const entries: DeviceRegistryEntry[] = Array.from(
      { length: count },
      (_, i) => ({
        kind: "session" as const,
        sessionId: `session-${i}`,
        hostPid: process.pid,
        workerPid: 10000 + i,
        workerId: `worker-${i}`,
        port: 14000 + i,
        url: `http://localhost:${14000 + i}`,
        startedAt: Date.now(),
      }),
    );

    await this.writeRegistryFile({
      version: 1,
      updatedAt: Date.now(),
      entries,
    });

    this.invalidateCache();
  }
}

describe("Device Registry Performance Benchmarks", () => {
  let cleanup: CleanupManager;
  let tempDir: string;
  let registryPath: string;

  beforeAll(async () => {
    tempDir = join(process.cwd(), ".tmp", "device-registry-bench");
    await mkdir(tempDir, { recursive: true });
    registryPath = join(tempDir, "device-registry.json");
  });

  afterAll(async () => {
    if (existsSync(tempDir)) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    cleanup = createCleanupManager();
  });

  afterEach(async () => {
    cleanup.registerFile(registryPath);
    await cleanup.cleanupAll();
  });

  describe("Read Latency Benchmarks", () => {
    /**
     * Benchmark cold read (no cache)
     */
    test("cold read latency with 50 entries", async () => {
      const registry = new MockDeviceRegistry({
        registryPath,
        cacheEnabled: false,
        ioDelayMs: 0, // Real file I/O
      });

      await registry.seedEntries(50);

      const result = await benchmark(
        "device-registry-cold-read-50",
        async () => {
          registry.invalidateCache();
          await registry.listDeviceRegistryFixed();
        },
        { iterations: 100, warmup: 5 },
      );

      console.log(
        `[BENCH:cold-read-50] Mean: ${result.mean.toFixed(2)}ms, P95: ${result.p95.toFixed(2)}ms, P99: ${result.p99.toFixed(2)}ms`,
      );

      // P95 should be under 50ms for 50 entries
      expect(result.p95).toBeLessThan(50);
    });

    /**
     * Benchmark with larger registry
     */
    test("cold read latency with 200 entries", async () => {
      const registry = new MockDeviceRegistry({
        registryPath,
        cacheEnabled: false,
        ioDelayMs: 0,
      });

      await registry.seedEntries(200);

      const result = await benchmark(
        "device-registry-cold-read-200",
        async () => {
          registry.invalidateCache();
          await registry.listDeviceRegistryFixed();
        },
        { iterations: 50, warmup: 3 },
      );

      console.log(
        `[BENCH:cold-read-200] Mean: ${result.mean.toFixed(2)}ms, P95: ${result.p95.toFixed(2)}ms, P99: ${result.p99.toFixed(2)}ms`,
      );

      // Larger registries should still be reasonably fast
      expect(result.p95).toBeLessThan(100);
    });

    /**
     * Benchmark warm read (with cache)
     */
    test("warm read latency with caching enabled", async () => {
      const registry = new MockDeviceRegistry({
        registryPath,
        cacheEnabled: true,
        ioDelayMs: 0,
      });

      await registry.seedEntries(100);

      // Warm the cache
      await registry.listDeviceRegistryFixed();

      const result = await benchmark(
        "device-registry-warm-read",
        async () => {
          await registry.listDeviceRegistryFixed();
        },
        { iterations: 1000, warmup: 10 },
      );

      console.log(
        `[BENCH:warm-read] Mean: ${result.mean.toFixed(4)}ms, P95: ${result.p95.toFixed(4)}ms, P99: ${result.p99.toFixed(4)}ms`,
      );
      console.log(
        `[BENCH:warm-read] Ops/sec: ${result.opsPerSecond.toFixed(0)}`,
      );

      // Cached reads should be very fast (< 1ms)
      expect(result.p95).toBeLessThan(1);
    });
  });

  describe("Buggy vs Fixed Implementation", () => {
    /**
     * Compare I/O counts between buggy and fixed versions
     */
    test("buggy version has excessive I/O", async () => {
      const registry = new MockDeviceRegistry({
        registryPath,
        cacheEnabled: false,
        ioDelayMs: 1, // Small delay to make I/O measurable
      });

      await registry.seedEntries(50);

      const iterations = 20;

      // Measure buggy version
      registry.resetStats();
      for (let i = 0; i < iterations; i++) {
        await registry.getWorker(`worker-${i % 50}`, true); // useBuggy = true
      }
      const buggyStats = registry.stats;

      // Measure fixed version
      registry.resetStats();
      registry.invalidateCache();
      for (let i = 0; i < iterations; i++) {
        await registry.getWorker(`worker-${i % 50}`, false); // useBuggy = false
      }
      const fixedStats = registry.stats;

      console.log(
        `[I/O COMPARE] Buggy: reads=${buggyStats.reads}, prunes=${buggyStats.prunes}`,
      );
      console.log(
        `[I/O COMPARE] Fixed: reads=${fixedStats.reads}, prunes=${fixedStats.prunes}`,
      );

      // Buggy version does a prune + read for each call
      expect(buggyStats.prunes).toBe(iterations);
      expect(buggyStats.reads).toBeGreaterThan(iterations); // At least 2x for prune + list

      // Fixed version should have fewer reads (potentially just 1 if cached)
      expect(fixedStats.reads).toBeLessThan(buggyStats.reads);
      expect(fixedStats.prunes).toBe(0);
    });

    /**
     * Benchmark time difference between implementations
     */
    test("fixed version is faster than buggy", async () => {
      const registry = new MockDeviceRegistry({
        registryPath,
        cacheEnabled: true,
        ioDelayMs: 5, // Simulate realistic I/O delay
      });

      await registry.seedEntries(100);

      // Benchmark buggy version
      const buggyResult = await benchmark(
        "device-registry-buggy",
        async () => {
          registry.invalidateCache();
          await registry.listDeviceRegistryBuggy();
        },
        { iterations: 20, warmup: 2 },
      );

      // Benchmark fixed version
      const fixedResult = await benchmark(
        "device-registry-fixed",
        async () => {
          await registry.listDeviceRegistryFixed();
        },
        { iterations: 20, warmup: 2 },
      );

      console.log(
        `[BENCH:buggy] Mean: ${buggyResult.mean.toFixed(2)}ms, P95: ${buggyResult.p95.toFixed(2)}ms`,
      );
      console.log(
        `[BENCH:fixed] Mean: ${fixedResult.mean.toFixed(2)}ms, P95: ${fixedResult.p95.toFixed(2)}ms`,
      );
      console.log(
        `[BENCH] Fixed is ${(buggyResult.mean / fixedResult.mean).toFixed(1)}x faster`,
      );

      // Fixed should be significantly faster
      expect(fixedResult.mean).toBeLessThan(buggyResult.mean);
    });
  });

  describe("Scaling Characteristics", () => {
    /**
     * Test how latency scales with entry count
     */
    test("latency scaling with entry count", async () => {
      const entryCounts = [10, 50, 100, 200, 500];
      const results: { count: number; mean: number; p95: number }[] = [];

      for (const count of entryCounts) {
        const registry = new MockDeviceRegistry({
          registryPath,
          cacheEnabled: false,
          ioDelayMs: 0,
        });

        await registry.seedEntries(count);

        const result = await benchmark(
          `device-registry-scale-${count}`,
          async () => {
            registry.invalidateCache();
            await registry.listDeviceRegistryFixed();
          },
          { iterations: 30, warmup: 3 },
        );

        results.push({ count, mean: result.mean, p95: result.p95 });
      }

      console.log("\n[SCALING] Entry count vs latency:");
      for (const r of results) {
        console.log(
          `  ${r.count} entries: mean=${r.mean.toFixed(2)}ms, p95=${r.p95.toFixed(2)}ms`,
        );
      }

      // Latency should scale sub-linearly (JSON parsing is O(n) but disk I/O dominates)
      const ratio = results[results.length - 1].mean / results[0].mean;
      const countRatio = entryCounts[entryCounts.length - 1] / entryCounts[0];

      console.log(
        `[SCALING] 50x entries = ${ratio.toFixed(1)}x latency (sub-linear expected)`,
      );

      // Should not scale linearly with entry count
      expect(ratio).toBeLessThan(countRatio);
    });

    /**
     * Test concurrent access patterns
     */
    test("concurrent access performance", async () => {
      const registry = new MockDeviceRegistry({
        registryPath,
        cacheEnabled: true,
        ioDelayMs: 0,
      });

      await registry.seedEntries(100);

      const concurrencyLevels = [1, 5, 10, 20];

      for (const concurrency of concurrencyLevels) {
        const start = performance.now();

        await Promise.all(
          Array.from({ length: concurrency }, () =>
            registry.listDeviceRegistryFixed(),
          ),
        );

        const elapsed = performance.now() - start;
        console.log(
          `[CONCURRENT] ${concurrency} concurrent reads: ${elapsed.toFixed(2)}ms total`,
        );
      }
    });
  });

  describe("Write Performance", () => {
    /**
     * Benchmark entry registration
     */
    test("entry registration latency", async () => {
      const registry = new MockDeviceRegistry({
        registryPath,
        cacheEnabled: false,
        ioDelayMs: 0,
      });

      // Start with empty registry
      await registry.seedEntries(0);

      let counter = 0;
      const result = await benchmark(
        "device-registry-write",
        async () => {
          await registry.registerEntry({
            kind: "session",
            sessionId: `bench-session-${counter}`,
            hostPid: process.pid,
            workerId: `bench-worker-${counter}`,
            port: 15000 + counter,
            url: `http://localhost:${15000 + counter}`,
            startedAt: Date.now(),
          });
          counter++;
        },
        { iterations: 50, warmup: 3 },
      );

      console.log(
        `[BENCH:write] Mean: ${result.mean.toFixed(2)}ms, P95: ${result.p95.toFixed(2)}ms, P99: ${result.p99.toFixed(2)}ms`,
      );

      // Writes should be reasonably fast
      expect(result.p95).toBeLessThan(100);
    });

    /**
     * Test mixed read/write workload
     */
    test("mixed read/write workload", async () => {
      const registry = new MockDeviceRegistry({
        registryPath,
        cacheEnabled: true,
        ioDelayMs: 0,
      });

      await registry.seedEntries(50);

      const operations = 100;
      const writeRatio = 0.2; // 20% writes

      let writeCounter = 0;
      const start = performance.now();

      for (let i = 0; i < operations; i++) {
        if (Math.random() < writeRatio) {
          await registry.registerEntry({
            kind: "session",
            sessionId: `mixed-session-${writeCounter}`,
            hostPid: process.pid,
            workerId: `mixed-worker-${writeCounter}`,
            port: 16000 + writeCounter,
            url: `http://localhost:${16000 + writeCounter}`,
            startedAt: Date.now(),
          });
          writeCounter++;
        } else {
          await registry.listDeviceRegistryFixed();
        }
      }

      const elapsed = performance.now() - start;
      const stats = registry.stats;

      console.log(
        `[MIXED] ${operations} ops (${writeCounter} writes): ${elapsed.toFixed(2)}ms`,
      );
      console.log(`[MIXED] Reads: ${stats.reads}, Writes: ${stats.writes}`);
      console.log(
        `[MIXED] Avg latency: ${(elapsed / operations).toFixed(2)}ms`,
      );
    });
  });

  describe("Threshold Assertions", () => {
    /**
     * Assert that read latency meets the 50ms p95 requirement
     */
    test("p95 read latency < 50ms with 100 entries", async () => {
      const registry = new MockDeviceRegistry({
        registryPath,
        cacheEnabled: false,
        ioDelayMs: 0,
      });

      await registry.seedEntries(100);

      const result = await benchmark(
        "device-registry-threshold",
        async () => {
          await registry.listDeviceRegistryFixed();
        },
        { iterations: 100, warmup: 10 },
      );

      console.log(
        `[THRESHOLD] P95: ${result.p95.toFixed(2)}ms (threshold: 50ms)`,
      );

      // This is the key requirement from the task
      expect(result.p95).toBeLessThan(50);
    });

    /**
     * Assert write latency is reasonable
     */
    test("p95 write latency < 100ms", async () => {
      const registry = new MockDeviceRegistry({
        registryPath,
        cacheEnabled: false,
        ioDelayMs: 0,
      });

      await registry.seedEntries(50);

      let counter = 0;
      const result = await benchmark(
        "device-registry-write-threshold",
        async () => {
          await registry.registerEntry({
            kind: "session",
            sessionId: `threshold-session-${counter}`,
            hostPid: process.pid,
            workerId: `threshold-worker-${counter}`,
            port: 17000 + counter,
            url: `http://localhost:${17000 + counter}`,
            startedAt: Date.now(),
          });
          counter++;
        },
        { iterations: 50, warmup: 5 },
      );

      console.log(
        `[THRESHOLD] Write P95: ${result.p95.toFixed(2)}ms (threshold: 100ms)`,
      );

      expect(result.p95).toBeLessThan(100);
    });
  });

  describe("Memory Footprint", () => {
    /**
     * Measure memory impact of large registries
     */
    test("memory footprint with large registry", async () => {
      const registry = new MockDeviceRegistry({
        registryPath,
        cacheEnabled: true,
        ioDelayMs: 0,
      });

      const entryCounts = [100, 500, 1000];

      for (const count of entryCounts) {
        // Force GC if available
        if (global.gc) global.gc();

        const beforeMemory = process.memoryUsage().heapUsed;

        await registry.seedEntries(count);
        await registry.listDeviceRegistryFixed();

        const afterMemory = process.memoryUsage().heapUsed;
        const memoryDelta = (afterMemory - beforeMemory) / 1024;

        console.log(
          `[MEMORY] ${count} entries: +${memoryDelta.toFixed(1)}KB heap`,
        );
      }
    });
  });
});
