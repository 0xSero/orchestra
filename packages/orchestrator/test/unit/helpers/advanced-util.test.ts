import { describe, expect, test } from "bun:test";
import type { WorkerInstance } from "../../../src/types";
import {
  isWorkerInstance,
  formatWorkerStatus,
  safeJsonParse,
  withTimeout,
  retry,
  formatMemoryUsage,
  createTimer,
} from "../../../src/helpers/advanced-util";

describe("isWorkerInstance", () => {
  test("returns true for valid worker instance", () => {
    const worker: WorkerInstance = {
      profile: {
        id: "test",
        name: "Test",
        model: "node",
        purpose: "test",
        whenToUse: "test",
      },
      status: "ready",
      port: 0,
      startedAt: new Date(),
    };
    expect(isWorkerInstance(worker)).toBe(true);
  });

  test("returns false for null", () => {
    expect(isWorkerInstance(null)).toBe(false);
  });

  test("returns false for missing profile", () => {
    expect(
      isWorkerInstance({
        status: "ready",
        port: 0,
        startedAt: new Date(),
      } as WorkerInstance),
    ).toBe(false);
  });

  test("returns false for missing status", () => {
    const worker = {
      profile: {
        id: "test",
        name: "Test",
        model: "node",
        purpose: "test",
        whenToUse: "test",
      },
      port: 0,
      startedAt: new Date(),
    };
    expect(isWorkerInstance(worker)).toBe(false);
  });

  test("returns false for primitives", () => {
    expect(isWorkerInstance("string")).toBe(false);
    expect(isWorkerInstance(123)).toBe(false);
  });
});

describe("formatWorkerStatus", () => {
  test("formats worker with all fields", () => {
    const worker: WorkerInstance = {
      profile: {
        id: "coder",
        name: "Coder",
        model: "node",
        purpose: "coding",
        whenToUse: "test",
      },
      status: "ready",
      pid: 12345,
      port: 3000,
      startedAt: new Date(),
    };
    const result = formatWorkerStatus(worker);
    expect(result).toContain("coder");
    expect(result).toContain("ready");
    expect(result).toContain("12345");
    expect(result).toContain("3000");
  });

  test("handles missing optional fields", () => {
    const worker: WorkerInstance = {
      profile: {
        id: "test",
        name: "Test",
        model: "node",
        purpose: "test",
        whenToUse: "test",
      },
      status: "starting",
      port: 0,
      startedAt: new Date(),
    };
    const result = formatWorkerStatus(worker);
    expect(result).toContain("test");
    expect(result).toContain("starting");
    expect(result).toContain("unknown");
  });
});

describe("safeJsonParse", () => {
  test("parses valid JSON", () => {
    const result = safeJsonParse<{ a: number }>('{"a":1}', { a: 0 });
    expect(result).toEqual({ a: 1 });
  });

  test("returns fallback on invalid JSON", () => {
    const result = safeJsonParse("not json", { fallback: true });
    expect(result).toEqual({ fallback: true });
  });

  test("returns fallback on parse error", () => {
    const result = safeJsonParse("{invalid}", { fallback: false });
    expect(result).toEqual({ fallback: false });
  });

  test("supports typed fallbacks", () => {
    const result = safeJsonParse("not an array", [] as number[]);
    expect(result).toEqual([]);
  });
});

describe("withTimeout", () => {
  test("resolves immediately if promise completes first", async () => {
    const result = await withTimeout(Promise.resolve("success"), 1000);
    expect(result).toBe("success");
  });

  test("rejects on timeout", async () => {
    await expect(withTimeout(new Promise(() => {}), 50)).rejects.toThrow(
      "timed out",
    );
  });

  test("uses custom error message", async () => {
    const customError = new Error("custom timeout");
    await expect(
      withTimeout(new Promise(() => {}), 50, customError),
    ).rejects.toThrow("custom timeout");
  });
});

describe("retry", () => {
  test("succeeds on first attempt", async () => {
    let attempts = 0;
    const result = await retry(
      async () => {
        attempts++;
        return "success";
      },
      3,
      10,
    );
    expect(result).toBe("success");
    expect(attempts).toBe(1);
  });

  test("retries on failure and succeeds", async () => {
    let attempts = 0;
    const result = await retry(
      async () => {
        attempts++;
        if (attempts < 2) throw new Error("fail");
        return "success";
      },
      3,
      10,
    );
    expect(result).toBe("success");
    expect(attempts).toBe(2);
  });

  test("exhausts retries and throws", async () => {
    let attempts = 0;
    await expect(
      retry(
        async () => {
          attempts++;
          throw new Error("always fails");
        },
        3,
        10,
      ),
    ).rejects.toThrow("always fails");
    expect(attempts).toBe(3);
  });

  test("uses custom max attempts", async () => {
    let attempts = 0;
    await expect(
      retry(
        async () => {
          attempts++;
          throw new Error("fail");
        },
        5,
        10,
      ),
    ).rejects.toThrow();
    expect(attempts).toBe(5);
  });
});

describe("formatMemoryUsage", () => {
  test("format byte", () => {
    expect(formatMemoryUsage(500)).toBe("500.00 B");
  });

  test("format kilobytes", () => {
    expect(formatMemoryUsage(1024)).toBe("1.00 KB");
  });

  test("format megabytes", () => {
    expect(formatMemoryUsage(1024 * 1024)).toBe("1.00 MB");
  });

  test("format gigabytes", () => {
    expect(formatMemoryUsage(1024 * 1024 * 1024)).toBe("1.00 GB");
  });

  test("handles zero", () => {
    expect(formatMemoryUsage(0)).toBe("0.00 B");
  });
});

describe("createTimer", () => {
  test("returns elapsed time in milliseconds", async () => {
    const timer = createTimer();
    await new Promise((r) => setTimeout(r, 50));
    const elapsed = timer.elapsed();
    expect(elapsed).toBeGreaterThanOrEqual(50);
    expect(elapsed).toBeLessThan(100);
  });

  test("returns elapsed time in microsecond", async () => {
    const timer = createTimer();
    await new Promise((r) => setTimeout(r, 10));
    const elapsed = timer.elapsedMicros();
    expect(elapsed).toBeGreaterThanOrEqual(10000);
    expect(elapsed).toBeLessThan(20000);
  });

  test("can be called multiple times", async () => {
    const timer = createTimer();
    const first = timer.elapsed();
    await new Promise((r) => setTimeout(r, 20));
    const second = timer.elapsed();
    expect(second).toBeGreaterThanOrEqual(first);
  });
});
