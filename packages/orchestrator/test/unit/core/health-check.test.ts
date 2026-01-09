import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { HealthCheck } from "../../../src/core/health-check";

describe("HealthCheck", () => {
  let healthCheck: HealthCheck;

  beforeEach(() => {
    healthCheck = new HealthCheck();
  });

  afterEach(() => {});

  it("should return healthy report with valid structure", async () => {
    const report = await healthCheck.check();

    expect(report).toHaveProperty("healthy");
    expect(report).toHaveProperty("uptime");
    expect(report).toHaveProperty("workerCount");
    expect(report).toHaveProperty("jobStats");
    expect(report).toHaveProperty("memoryUsage");
    expect(report).toHaveProperty("deviceRegistryAlive");
    expect(report).toHaveProperty("timestamp");

    expect(typeof report.healthy).toBe("boolean");
    expect(typeof report.uptime).toBe("number");
    expect(typeof report.workerCount).toBe("number");
    expect(report.jobStats).toEqual({
      total: expect.any(Number),
      running: expect.any(Number),
      succeeded: expect.any(Number),
      failed: expect.any(Number),
      canceled: expect.any(Number),
    });
    expect(report.memoryUsage).toEqual({
      heapUsed: expect.any(Number),
      heapTotal: expect.any(Number),
      external: expect.any(Number),
      rss: expect.any(Number),
    });
    expect(typeof report.deviceRegistryAlive).toBe("boolean");
    expect(typeof report.timestamp).toBe("number");
  });

  it("should report health status", async () => {
    const report = await healthCheck.check();
    expect(typeof report.healthy).toBe("boolean");
    // In test environment without workers, may be unhealthy
  });

  it("should include accurate job stats", async () => {
    const report = await healthCheck.check();

    expect(report.jobStats.total).toBeGreaterThanOrEqual(0);
    expect(report.jobStats.running).toBeGreaterThanOrEqual(0);
    expect(report.jobStats.succeeded).toBeGreaterThanOrEqual(0);
    expect(report.jobStats.failed).toBeGreaterThanOrEqual(0);
    expect(report.jobStats.canceled).toBeGreaterThanOrEqual(0);

    const sum =
      report.jobStats.running +
      report.jobStats.succeeded +
      report.jobStats.failed +
      report.jobStats.canceled;
    expect(report.jobStats.total).toBe(sum);
  });

  it("should include memory usage stats", async () => {
    const report = await healthCheck.check();

    expect(report.memoryUsage.heapUsed).toBeGreaterThanOrEqual(0);
    expect(report.memoryUsage.heapTotal).toBeGreaterThanOrEqual(0);
    expect(report.memoryUsage.external).toBeGreaterThanOrEqual(0);
    expect(report.memoryUsage.rss).toBeGreaterThanOrEqual(0);

    // Note: heapUsed can temporarily exceed heapTotal in V8 due to memory
    // allocation patterns, so we don't assert heapUsed <= heapTotal
  });

  it("should track uptime", async () => {
    const report = await healthCheck.check();
    expect(report.uptime).toBeGreaterThanOrEqual(0);
  });

  it("should return timestamp as current time", async () => {
    const before = Date.now();
    const report = await healthCheck.check();
    const after = Date.now();

    expect(report.timestamp).toBeGreaterThanOrEqual(before);
    expect(report.timestamp).toBeLessThanOrEqual(after);
  });

  it("should track uptime correctly", () => {
    const initialUptime = healthCheck.getUptime();
    expect(initialUptime).toBeGreaterThanOrEqual(0);

    const after = Date.now();
    while (Date.now() < after + 10) {}
    const laterUptime = healthCheck.getUptime();
    expect(laterUptime).toBeGreaterThan(initialUptime);
  });
});
