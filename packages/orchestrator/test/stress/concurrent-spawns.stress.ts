/**
 * CRITICAL: Concurrent spawn race condition stress test
 * 
 * Tests for the race condition in spawner.ts:271-282 where the async gap
 * between checking inFlightSpawns and setting it can allow duplicate spawns.
 * 
 * Root cause: The spawn deduplication relies on checking `inFlightSpawns.get(profile.id)`
 * and then creating a promise. If multiple concurrent calls hit the check before
 * any has set the map entry, duplicate spawns can occur.
 * 
 * Test approach:
 * - Fire N concurrent spawn requests for the same profile
 * - Verify only 1 worker process is created (check PIDs)
 * - Verify all callers receive the same worker handle
 * 
 * @module test/stress/concurrent-spawns.stress
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createCleanupManager } from "../helpers/cleanup";
import { createMetricsCollector } from "../helpers/metrics";
import { createTestProfile } from "../helpers/fixtures";
import type { CleanupManager } from "../helpers/cleanup";
import type { MetricsCollector } from "../helpers/metrics";
import type { WorkerInstance, WorkerProfile } from "../../src/types";

// We need to mock/spy on the spawner module
// Since we're testing the race condition, we'll create a controlled test environment

/**
 * Mock spawner that simulates the race condition behavior
 * This replicates the logic in spawner.ts:271-282 for testing
 */
class MockSpawner {
  private inFlightSpawns = new Map<string, Promise<WorkerInstance>>();
  private spawnedWorkers = new Map<string, WorkerInstance>();
  private spawnCount = 0;
  private pidsUsed = new Set<number>();
  
  /** Artificial delay to simulate async spawn time */
  private spawnDelayMs: number;
  
  constructor(options: { spawnDelayMs?: number } = {}) {
    this.spawnDelayMs = options.spawnDelayMs ?? 100;
  }
  
  /**
   * Get count of actual spawn operations (not deduplicated)
   */
  get actualSpawnCount(): number {
    return this.spawnCount;
  }
  
  /**
   * Get unique PIDs that were used
   */
  get uniquePids(): number[] {
    return Array.from(this.pidsUsed);
  }
  
  /**
   * Reset state between tests
   */
  reset(): void {
    this.inFlightSpawns.clear();
    this.spawnedWorkers.clear();
    this.spawnCount = 0;
    this.pidsUsed.clear();
  }
  
  /**
   * Simulates the BUGGY spawn logic from spawner.ts:271-282
   * 
   * The race condition occurs here:
   * 1. Check if inFlightSpawns has entry -> false
   * 2. (async gap - other calls can enter here)
   * 3. Create spawn promise and set in map
   * 
   * If multiple calls reach step 1 before any reaches step 3,
   * they will all start spawning.
   */
  async spawnWorkerBuggy(profile: WorkerProfile): Promise<WorkerInstance> {
    // Check existing worker (replicates spawner.ts:275-280)
    const existing = this.spawnedWorkers.get(profile.id);
    if (existing && existing.status !== "error" && existing.status !== "stopped") {
      return existing;
    }
    
    // Race condition window: check in-flight (spawner.ts:284-289)
    // BUG: This check happens before the async spawn starts
    const inFlight = this.inFlightSpawns.get(profile.id);
    if (inFlight) {
      return inFlight;
    }
    
    // Create spawn promise - but there's an async gap before this executes
    const spawnPromise = (async () => {
      // Simulate spawn delay - this is where the race window exists
      await new Promise((resolve) => setTimeout(resolve, this.spawnDelayMs));
      
      this.spawnCount++;
      const pid = 10000 + this.spawnCount;
      this.pidsUsed.add(pid);
      
      const instance: WorkerInstance = {
        profile,
        status: "ready",
        port: 14096 + this.spawnCount,
        pid,
        serverUrl: `http://localhost:${14096 + this.spawnCount}`,
        startedAt: new Date(),
        lastActivity: new Date(),
      };
      
      this.spawnedWorkers.set(profile.id, instance);
      return instance;
    })();
    
    // Set the in-flight promise AFTER creating it
    // BUG: Other concurrent calls may have already passed the check
    this.inFlightSpawns.set(profile.id, spawnPromise);
    
    try {
      return await spawnPromise;
    } finally {
      this.inFlightSpawns.delete(profile.id);
    }
  }
  
  /**
   * Fixed version that properly handles the race condition
   * Uses synchronous state update before any async work
   */
  async spawnWorkerFixed(profile: WorkerProfile): Promise<WorkerInstance> {
    // Check existing worker
    const existing = this.spawnedWorkers.get(profile.id);
    if (existing && existing.status !== "error" && existing.status !== "stopped") {
      return existing;
    }
    
    // FIXED: Check AND set atomically before any async work
    const inFlight = this.inFlightSpawns.get(profile.id);
    if (inFlight) {
      return inFlight;
    }
    
    // Create a deferred promise that we can set BEFORE the async work
    let resolveSpawn!: (instance: WorkerInstance) => void;
    let rejectSpawn!: (error: Error) => void;
    const spawnPromise = new Promise<WorkerInstance>((resolve, reject) => {
      resolveSpawn = resolve;
      rejectSpawn = reject;
    });
    
    // Set in-flight SYNCHRONOUSLY before any await
    this.inFlightSpawns.set(profile.id, spawnPromise);
    
    try {
      // Now do the async spawn work
      await new Promise((resolve) => setTimeout(resolve, this.spawnDelayMs));
      
      this.spawnCount++;
      const pid = 10000 + this.spawnCount;
      this.pidsUsed.add(pid);
      
      const instance: WorkerInstance = {
        profile,
        status: "ready",
        port: 14096 + this.spawnCount,
        pid,
        serverUrl: `http://localhost:${14096 + this.spawnCount}`,
        startedAt: new Date(),
        lastActivity: new Date(),
      };
      
      this.spawnedWorkers.set(profile.id, instance);
      resolveSpawn(instance);
      return instance;
    } catch (error) {
      rejectSpawn(error as Error);
      throw error;
    } finally {
      this.inFlightSpawns.delete(profile.id);
    }
  }
}

describe("Concurrent Spawn Race Condition", () => {
  let cleanup: CleanupManager;
  let metrics: MetricsCollector;
  let spawner: MockSpawner;
  let testProfile: WorkerProfile;
  
  beforeEach(() => {
    cleanup = createCleanupManager();
    metrics = createMetricsCollector();
    spawner = new MockSpawner({ spawnDelayMs: 50 });
    testProfile = createTestProfile("race-test-worker", {
      name: "Race Condition Test Worker",
      model: "test-model",
      purpose: "Testing spawn race conditions",
      whenToUse: "For race condition tests",
    });
  });
  
  afterEach(async () => {
    spawner.reset();
    await cleanup.cleanupAll();
  });
  
  /**
   * Test that demonstrates the race condition bug
   * 
   * When N concurrent spawn requests are made, the buggy implementation
   * should allow multiple actual spawns to occur because all requests
   * pass the inFlightSpawns check before any has set the map entry.
   */
  test("BUGGY: concurrent spawns create multiple workers (demonstrates bug)", async () => {
    const concurrency = 10;
    const endSpan = metrics.startSpan("spawn:concurrent-buggy");
    
    // Fire all spawn requests concurrently
    const promises = Array.from({ length: concurrency }, () =>
      spawner.spawnWorkerBuggy(testProfile)
    );
    
    const results = await Promise.all(promises);
    endSpan();
    
    // With the buggy implementation, we expect multiple spawns
    // because all calls pass the inFlightSpawns check before any sets it
    console.log(`[RACE-TEST] Buggy spawner: concurrency=${concurrency}, actualSpawns=${spawner.actualSpawnCount}, uniquePids=${spawner.uniquePids.length}`);
    
    // This assertion SHOULD FAIL with the buggy implementation
    // demonstrating the race condition creates multiple workers
    const hasRaceCondition = spawner.actualSpawnCount > 1;
    
    if (hasRaceCondition) {
      console.log(`[RACE-TEST] Race condition detected: ${spawner.actualSpawnCount} spawns for 1 profile`);
      console.log(`[RACE-TEST] Unique PIDs: ${spawner.uniquePids.join(", ")}`);
    }
    
    // The buggy version WILL have multiple spawns - this test documents the bug
    expect(hasRaceCondition).toBe(true);
    expect(spawner.actualSpawnCount).toBeGreaterThan(1);
    
    // Verify all results are valid (even if they're different instances)
    for (const result of results) {
      expect(result.profile.id).toBe(testProfile.id);
      expect(result.status).toBe("ready");
    }
  });
  
  /**
   * Test the fixed implementation that should NOT have the race condition
   * 
   * All concurrent spawns should deduplicate to a single actual spawn.
   */
  test("FIXED: concurrent spawns should deduplicate to single worker", async () => {
    const concurrency = 10;
    const endSpan = metrics.startSpan("spawn:concurrent-fixed");
    
    // Fire all spawn requests concurrently
    const promises = Array.from({ length: concurrency }, () =>
      spawner.spawnWorkerFixed(testProfile)
    );
    
    const results = await Promise.all(promises);
    endSpan();
    
    console.log(`[RACE-TEST] Fixed spawner: concurrency=${concurrency}, actualSpawns=${spawner.actualSpawnCount}, uniquePids=${spawner.uniquePids.length}`);
    
    // With the fixed implementation, only 1 spawn should occur
    expect(spawner.actualSpawnCount).toBe(1);
    expect(spawner.uniquePids.length).toBe(1);
    
    // All callers should receive the SAME worker instance
    const firstPid = results[0].pid;
    for (const result of results) {
      expect(result.pid).toBe(firstPid);
      expect(result.profile.id).toBe(testProfile.id);
      expect(result.status).toBe("ready");
    }
  });
  
  /**
   * Stress test with high concurrency to reliably trigger the race condition
   */
  test("STRESS: high concurrency reliably triggers race condition in buggy version", async () => {
    const concurrency = 50;
    const iterations = 5;
    let totalRaceConditions = 0;
    
    for (let i = 0; i < iterations; i++) {
      spawner.reset();
      
      const profile = createTestProfile(`stress-worker-${i}`, {
        name: `Stress Test Worker ${i}`,
        model: "test-model",
        purpose: "High concurrency stress test",
        whenToUse: "For stress tests",
      });
      
      const promises = Array.from({ length: concurrency }, () =>
        spawner.spawnWorkerBuggy(profile)
      );
      
      await Promise.all(promises);
      
      if (spawner.actualSpawnCount > 1) {
        totalRaceConditions++;
        console.log(`[STRESS] Iteration ${i + 1}: Race condition - ${spawner.actualSpawnCount} spawns`);
      }
    }
    
    console.log(`[STRESS] Race conditions triggered: ${totalRaceConditions}/${iterations} iterations`);
    
    // Race condition should be triggered in most iterations with high concurrency
    expect(totalRaceConditions).toBeGreaterThan(0);
  });
  
  /**
   * Verify the fixed version never races under high stress
   */
  test("STRESS: fixed version never races under high concurrency", async () => {
    const concurrency = 50;
    const iterations = 10;
    
    for (let i = 0; i < iterations; i++) {
      spawner.reset();
      
      const profile = createTestProfile(`stress-fixed-${i}`, {
        name: `Fixed Stress Test Worker ${i}`,
        model: "test-model",
        purpose: "Fixed high concurrency test",
        whenToUse: "For stress tests",
      });
      
      const promises = Array.from({ length: concurrency }, () =>
        spawner.spawnWorkerFixed(profile)
      );
      
      const results = await Promise.all(promises);
      
      // Fixed version should ALWAYS have exactly 1 spawn
      expect(spawner.actualSpawnCount).toBe(1);
      expect(spawner.uniquePids.length).toBe(1);
      
      // All results should be identical
      const firstPid = results[0].pid;
      expect(results.every((r) => r.pid === firstPid)).toBe(true);
    }
  });
  
  /**
   * Test different profiles don't interfere with each other
   */
  test("different profiles spawn independently", async () => {
    const profileA = createTestProfile("profile-a", { name: "Worker A" });
    const profileB = createTestProfile("profile-b", { name: "Worker B" });
    
    const promises = [
      ...Array.from({ length: 5 }, () => spawner.spawnWorkerFixed(profileA)),
      ...Array.from({ length: 5 }, () => spawner.spawnWorkerFixed(profileB)),
    ];
    
    const results = await Promise.all(promises);
    
    // Should have exactly 2 spawns (one per profile)
    expect(spawner.actualSpawnCount).toBe(2);
    expect(spawner.uniquePids.length).toBe(2);
    
    // Verify correct profile-to-result mapping
    const profileAResults = results.filter((r) => r.profile.id === "profile-a");
    const profileBResults = results.filter((r) => r.profile.id === "profile-b");
    
    expect(profileAResults.length).toBe(5);
    expect(profileBResults.length).toBe(5);
    
    // All results for same profile should have same PID
    const pidA = profileAResults[0].pid;
    const pidB = profileBResults[0].pid;
    expect(pidA).not.toBe(pidB);
    expect(profileAResults.every((r) => r.pid === pidA)).toBe(true);
    expect(profileBResults.every((r) => r.pid === pidB)).toBe(true);
  });
  
  /**
   * Test timing measurements for spawn deduplication
   */
  test("deduplication should be faster than multiple spawns", async () => {
    const concurrency = 20;
    
    // Measure buggy (potentially multiple spawns)
    spawner.reset();
    const buggyStart = performance.now();
    await Promise.all(
      Array.from({ length: concurrency }, () =>
        spawner.spawnWorkerBuggy(createTestProfile("timing-buggy"))
      )
    );
    const buggyTime = performance.now() - buggyStart;
    const buggySpawns = spawner.actualSpawnCount;
    
    // Measure fixed (single spawn)
    spawner.reset();
    const fixedStart = performance.now();
    await Promise.all(
      Array.from({ length: concurrency }, () =>
        spawner.spawnWorkerFixed(createTestProfile("timing-fixed"))
      )
    );
    const fixedTime = performance.now() - fixedStart;
    const fixedSpawns = spawner.actualSpawnCount;
    
    console.log(`[TIMING] Buggy: ${buggyTime.toFixed(2)}ms for ${buggySpawns} spawns`);
    console.log(`[TIMING] Fixed: ${fixedTime.toFixed(2)}ms for ${fixedSpawns} spawns`);
    
    // Fixed should have exactly 1 spawn
    expect(fixedSpawns).toBe(1);
    
    // If buggy had multiple spawns, it likely took longer due to resource contention
    if (buggySpawns > 1) {
      // Not asserting time comparison as it's not deterministic
      // but logging for analysis
      console.log(`[TIMING] Buggy had ${buggySpawns - 1} extra spawns due to race condition`);
    }
  });
  
  /**
   * Test that errors are propagated correctly in concurrent scenarios
   */
  test("errors propagate to all concurrent callers", async () => {
    
    // Create a spawner that fails on first call but deduplicates correctly
    class FailingMockSpawner extends MockSpawner {
      private inFlightPromise: Promise<WorkerInstance> | null = null;
      private failed = false;
      
      async spawnWorkerFailing(profile: WorkerProfile): Promise<WorkerInstance> {
        if (this.inFlightPromise) {
          return this.inFlightPromise;
        }
        
        let resolveSpawn!: (instance: WorkerInstance) => void;
        let rejectSpawn!: (error: Error) => void;
        this.inFlightPromise = new Promise<WorkerInstance>((resolve, reject) => {
          resolveSpawn = resolve;
          rejectSpawn = reject;
        });
        
        try {
          await new Promise((resolve) => setTimeout(resolve, 50));
          
          if (!this.failed) {
            this.failed = true;
            const error = new Error("Simulated spawn failure");
            rejectSpawn(error);
            throw error;
          }
          
          const instance: WorkerInstance = {
            profile,
            status: "ready",
            port: 14100,
            pid: 99999,
            serverUrl: "http://localhost:14100",
            startedAt: new Date(),
            lastActivity: new Date(),
          };
          resolveSpawn(instance);
          return instance;
        } finally {
          this.inFlightPromise = null;
        }
      }
    }
    
    const failingInstance = new FailingMockSpawner();
    const failProfile = createTestProfile("fail-worker");
    
    // All concurrent calls should receive the same error
    const promises = Array.from({ length: 5 }, () =>
      failingInstance.spawnWorkerFailing(failProfile).catch((e) => e)
    );
    
    const results = await Promise.all(promises);
    
    // All results should be the same error
    for (const result of results) {
      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toBe("Simulated spawn failure");
    }
  });
});

describe("Real Spawner Integration (if available)", () => {
  /**
   * This test would run against the real spawner if imported
   * Currently serves as documentation for manual verification
   */
  test("integration: real spawner deduplication", async () => {
    const { spawnWorker, stopWorker } = await import("../../src/workers/spawner");
    const profile = createTestProfile("real-test", { model: "opencode/gpt-5-nano" });

    const promises = Array.from({ length: 5 }, () =>
      spawnWorker(profile, { basePort: 0, timeout: 60_000, directory: process.cwd() })
    );
    const results = await Promise.all(promises);

    const pids = new Set(results.map((r) => r.pid));
    expect(pids.size).toBe(1);

    await stopWorker(profile.id);
  }, 180_000);
});
