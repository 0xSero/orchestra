import { describe, it, expect } from "bun:test";
import { CleanupScheduler } from "../../../src/core/cleanup-scheduler";

describe("CleanupScheduler", () => {
  it("should call cleanup function on schedule", async () => {
    let callCount = 0;
    const cleanupFn = () => {
      callCount++;
      return Promise.resolve();
    };
    const scheduler = new CleanupScheduler(cleanupFn, { intervalMs: 50 });

    scheduler.start();

    expect(callCount).toBe(0);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(callCount).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(callCount).toBe(2);

    scheduler.stop();
  });

  it("should not start if already running", () => {
    const cleanupFn = () => Promise.resolve();
    const scheduler = new CleanupScheduler(cleanupFn, { intervalMs: 5000 });

    scheduler.start();
    expect(scheduler.getIsRunning()).toBe(true);

    scheduler.start();
    expect(scheduler.getIsRunning()).toBe(true);

    scheduler.stop();
  });

  it("should stop cleanly", () => {
    const cleanupFn = () => Promise.resolve();
    const scheduler = new CleanupScheduler(cleanupFn, { intervalMs: 5000 });

    scheduler.start();
    expect(scheduler.getIsRunning()).toBe(true);

    scheduler.stop();
    expect(scheduler.getIsRunning()).toBe(false);
  });

  it("should respect config override", () => {
    const cleanupFn = () => Promise.resolve();
    const scheduler = new CleanupScheduler(cleanupFn, { intervalMs: 10000 });

    expect(scheduler.getConfig().intervalMs).toBe(10000);
    scheduler.start();
    scheduler.stop();
  });

  it("should use default interval when not specified", () => {
    const cleanupFn = () => Promise.resolve();
    const scheduler = new CleanupScheduler(cleanupFn);

    expect(scheduler.getConfig().intervalMs).toBe(300000);
    scheduler.start();
    scheduler.stop();
  });

  it("should force cleanup immediately", async () => {
    let callCount = 0;
    const cleanupFn = () => {
      callCount++;
      return Promise.resolve();
    };
    const scheduler = new CleanupScheduler(cleanupFn, { intervalMs: 60000 });

    expect(scheduler.getIsRunning()).toBe(false);

    await scheduler.forceCleanup();
    expect(callCount).toBe(1);

    expect(scheduler.getIsRunning()).toBe(false);
  });

  it("should handle cleanup function errors gracefully", async () => {
    let callCount = 0;
    const cleanupFn = () => {
      callCount++;
      return Promise.reject(new Error("cleanup failed"));
    };
    const scheduler = new CleanupScheduler(cleanupFn, { intervalMs: 50 });

    scheduler.start();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(callCount).toBe(1);

    expect(scheduler.getIsRunning()).toBe(true);

    scheduler.stop();
  });

  it("should return correct config", () => {
    const cleanupFn = () => Promise.resolve();
    const scheduler = new CleanupScheduler(cleanupFn, { intervalMs: 12345 });

    const config = scheduler.getConfig();
    expect(config.intervalMs).toBe(12345);
  });
});
