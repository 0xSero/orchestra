import { describe, expect, test } from "bun:test";
import {
  formatBytes,
  getProcessRssBytes,
  listOpencodeServeProcesses,
} from "../../../src/core/process-metrics";

describe("formatBytes", () => {
  test("formats bytes", () => {
    expect(formatBytes(500)).toBe("500 B");
  });

  test("formats kilobytes", () => {
    expect(formatBytes(1024)).toMatch(/1\.?(\d+)? KB/);
  });

  test("formats megabytes", () => {
    expect(formatBytes(1024 * 1024)).toMatch(/1\.\d+ MB/);
  });

  test("formats gigabytes", () => {
    expect(formatBytes(1024 * 1024 * 1024)).toMatch(/1\.\d+ GB/);
  });

  test("formats terabytes", () => {
    expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe("1.00 TB");
  });

  test("handles zero", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  test("returns unknown for negative", () => {
    expect(formatBytes(-100)).toBe("unknown");
  });

  test("returns unknown for Infinity", () => {
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("unknown");
  });

  test("returns unknown for NaN", () => {
    expect(formatBytes(Number.NaN)).toBe("unknown");
  });
});

describe("getProcessRssBytes", () => {
  test("returns undefined for invalid pid", async () => {
    expect(await getProcessRssBytes(0)).toBeUndefined();
    expect(await getProcessRssBytes(-1)).toBeUndefined();
    expect(await getProcessRssBytes(Number.NaN)).toBeUndefined();
  });

  test("handles process not found gracefully", async () => {
    const result = await getProcessRssBytes(999999999);
    // Either undefined or 0 are valid (depending on ps behavior)
    expect(result === undefined || result === 0).toBe(true);
  });
});

describe("listOpencodeServeProcesses", () => {
  test("returns array of processes", async () => {
    const result = await listOpencodeServeProcesses();
    expect(Array.isArray(result)).toBe(true);
  });

  test("process info has required fields", async () => {
    const result = await listOpencodeServeProcesses();
    for (const proc of result) {
      expect(typeof proc.pid).toBe("number");
      expect(proc.pid).toBeGreaterThan(0);
      expect(typeof proc.args).toBe("string");
      expect(proc.args).toContain("opencode serve");
    }
  });

  test("rssBytes is optional number", async () => {
    const result = await listOpencodeServeProcesses();
    for (const proc of result) {
      if (proc.rssBytes !== undefined) {
        expect(typeof proc.rssBytes).toBe("number");
        expect(proc.rssBytes).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
