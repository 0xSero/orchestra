import { describe, it, expect } from "bun:test";
import { CleanupScheduler } from "../../../src/core/cleanup-scheduler";

describe("CleanupScheduler integration with config", () => {
  it("should use config.intervalMs when provided", () => {
    let callCount = 0;
    const cleanupFn = () => {
      callCount++;
      return Promise.resolve();
    };

    const scheduler = new CleanupScheduler(cleanupFn, {
      intervalMs: 1000,
    });

    expect(scheduler.getConfig().intervalMs).toBe(1000);

    scheduler.start();

    expect(callCount).toBe(0);

    scheduler.stop();
  });

  it("should default to 300000ms when config not provided", () => {
    let callCount = 0;
    const cleanupFn = () => {
      callCount++;
      return Promise.resolve();
    };

    const scheduler = new CleanupScheduler(cleanupFn);

    expect(scheduler.getConfig().intervalMs).toBe(300000);

    scheduler.start();

    expect(callCount).toBe(0);

    scheduler.stop();
  });

  it("should accept zero intervalMs", () => {
    let callCount = 0;
    const cleanupFn = () => {
      callCount++;
      return Promise.resolve();
    };

    const scheduler = new CleanupScheduler(cleanupFn, {
      intervalMs: 0,
    });

    expect(scheduler.getConfig().intervalMs).toBe(0);

    scheduler.start();

    expect(callCount).toBe(0);

    scheduler.stop();
  });

  it("should handle config with very large interval", () => {
    let callCount = 0;
    const cleanupFn = () => {
      callCount++;
      return Promise.resolve();
    };

    const scheduler = new CleanupScheduler(cleanupFn, {
      intervalMs: 3600000,
    });

    expect(scheduler.getConfig().intervalMs).toBe(3600000);

    scheduler.start();

    expect(callCount).toBe(0);

    scheduler.stop();
  });

  it("should be configurable with Partial<CleanupSchedulerConfig>", () => {
    let callCount = 0;
    const cleanupFn = () => {
      callCount++;
      return Promise.resolve();
    };

    const scheduler = new CleanupScheduler(cleanupFn, {
      intervalMs: 5000,
    });

    expect(scheduler.getConfig().intervalMs).toBe(5000);

    scheduler.start();
    scheduler.stop();
  });

  it("should pass config object structure matching runtime config", () => {
    let callCount = 0;
    const cleanupFn = () => {
      callCount++;
      return Promise.resolve();
    };

    const customConfig = { intervalMs: 12345 };
    const scheduler = new CleanupScheduler(cleanupFn, customConfig);

    expect(scheduler.getConfig()).toEqual({ intervalMs: 12345 });

    scheduler.start();
    scheduler.stop();
  });

  it("should work with runtime-style config loading", () => {
    let callCount = 0;
    const cleanupFn = () => {
      callCount++;
      return Promise.resolve();
    };

    const runtimeConfig = {
      cleanup: {
        intervalMs: 60000,
      },
    };

    const scheduler = new CleanupScheduler(cleanupFn, runtimeConfig.cleanup);

    expect(scheduler.getConfig().intervalMs).toBe(60000);

    scheduler.start();
    scheduler.stop();
  });

  it("should handle undefined config gracefully", () => {
    let callCount = 0;
    const cleanupFn = () => {
      callCount++;
      return Promise.resolve();
    };

    const scheduler = new CleanupScheduler(cleanupFn, undefined);

    expect(scheduler.getConfig().intervalMs).toBe(300000);

    scheduler.start();
    scheduler.stop();
  });

  it("should run cleanup at configured interval with fake timers", async () => {
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

  it("should not call cleanup before interval elapses", async () => {
    let callCount = 0;
    const cleanupFn = () => {
      callCount++;
      return Promise.resolve();
    };

    const scheduler = new CleanupScheduler(cleanupFn, { intervalMs: 200 });

    scheduler.start();

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(callCount).toBe(0);

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(callCount).toBe(1);

    scheduler.stop();
  });

  it("should pass config from orchestrator config structure", () => {
    let callCount = 0;
    const cleanupFn = () => {
      callCount++;
      return Promise.resolve();
    };

    const orchestratorConfig = {
      cleanup: {
        intervalMs: 75000,
      },
    } as { cleanup?: { intervalMs?: number } };

    const scheduler = new CleanupScheduler(
      cleanupFn,
      orchestratorConfig.cleanup,
    );
    expect(scheduler.getConfig().intervalMs).toBe(75000);

    scheduler.start();
    scheduler.stop();
  });

  it("should use default when cleanup config is empty object", () => {
    let callCount = 0;
    const cleanupFn = () => {
      callCount++;
      return Promise.resolve();
    };

    const scheduler = new CleanupScheduler(cleanupFn, {});
    expect(scheduler.getConfig().intervalMs).toBe(300000);

    scheduler.start();
    scheduler.stop();
  });
});
