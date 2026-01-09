import { describe, it, expect, beforeEach } from "bun:test";
import { CircuitBreaker } from "../../../src/core/circuit-breaker";

describe("CircuitBreaker", () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      failureWindowMs: 10000,
      halfOpenTimeoutMs: 5000,
    });
  });

  describe("initial state", () => {
    it("should start in closed state", () => {
      expect(circuitBreaker.getState()).toBe("closed");
    });

    it("should allow execution when closed", () => {
      expect(circuitBreaker.canExecute()).toBe(true);
    });

    it("should have zero failure count", () => {
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.failureCount).toBe(0);
      expect(metrics.successCount).toBe(0);
    });
  });

  describe("failure tracking", () => {
    it("should stay closed with few failures", () => {
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();

      expect(circuitBreaker.getState()).toBe("closed");
      expect(circuitBreaker.canExecute()).toBe(true);
    });

    it("should open circuit when failure threshold exceeded", () => {
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();

      expect(circuitBreaker.getState()).toBe("open");
      expect(circuitBreaker.canExecute()).toBe(false);
    });

    it("should block execution when open", () => {
      for (let i = 0; i < 3; i++) {
        circuitBreaker.recordFailure();
      }

      expect(circuitBreaker.canExecute()).toBe(false);
    });
  });

  describe("success tracking", () => {
    it("should stay closed on success", () => {
      circuitBreaker.recordSuccess();

      expect(circuitBreaker.getState()).toBe("closed");
      expect(circuitBreaker.getMetrics().successCount).toBe(1);
    });

    it("should not reset failure count immediately on success", () => {
      circuitBreaker.recordFailure();
      circuitBreaker.recordSuccess();

      expect(circuitBreaker.getMetrics().failureCount).toBe(1);
    });
  });

  describe("reset", () => {
    it("should reset all state", () => {
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();

      circuitBreaker.reset();

      expect(circuitBreaker.getState()).toBe("closed");
      expect(circuitBreaker.canExecute()).toBe(true);
      expect(circuitBreaker.getMetrics().failureCount).toBe(0);
      expect(circuitBreaker.getMetrics().successCount).toBe(0);
    });
  });

  describe("config", () => {
    it("should use default config when not provided", () => {
      const cb = new CircuitBreaker();
      const config = cb.getConfig();

      expect(config.failureThreshold).toBe(5);
      expect(config.failureWindowMs).toBe(600000);
      expect(config.halfOpenTimeoutMs).toBe(300000);
    });

    it("should respect custom config", () => {
      const cb = new CircuitBreaker({
        failureThreshold: 10,
        failureWindowMs: 60000,
        halfOpenTimeoutMs: 60000,
      });

      const config = cb.getConfig();
      expect(config.failureThreshold).toBe(10);
      expect(config.failureWindowMs).toBe(60000);
      expect(config.halfOpenTimeoutMs).toBe(60000);
    });
  });

  describe("metrics", () => {
    it("should track last failure time", () => {
      circuitBreaker.recordFailure();

      const metrics = circuitBreaker.getMetrics();
      expect(metrics.lastFailureAt).not.toBeNull();
    });

    it("should update last failure time on each failure", async () => {
      circuitBreaker.recordFailure();
      const firstFailure = circuitBreaker.getMetrics().lastFailureAt;

      await new Promise((resolve) => setTimeout(resolve, 100));
      circuitBreaker.recordFailure();
      const secondFailure = circuitBreaker.getMetrics().lastFailureAt;

      expect(secondFailure).toBeGreaterThan(firstFailure!);
    });
  });
});
