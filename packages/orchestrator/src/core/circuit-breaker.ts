export type CircuitBreakerState = "closed" | "open" | "half-open";

export interface CircuitBreakerConfig {
  failureThreshold: number;
  failureWindowMs: number;
  halfOpenTimeoutMs: number;
}

export interface CircuitBreakerMetrics {
  state: CircuitBreakerState;
  failureCount: number;
  lastFailureAt: number | null;
  successCount: number;
}

export type OrchestratorConfigCircuitBreaker = {
  failureThreshold?: number;
  failureWindowMs?: number;
  halfOpenTimeoutMs?: number;
};

export class CircuitBreaker {
  private failures: number[] = [];
  private successCount = 0;
  private state: CircuitBreakerState = "closed";
  private lastFailureAt: number | null = null;
  private readonly config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = {
      failureThreshold: config?.failureThreshold ?? 5,
      failureWindowMs: config?.failureWindowMs ?? 10 * 60 * 1000,
      halfOpenTimeoutMs: config?.halfOpenTimeoutMs ?? 5 * 60 * 1000,
    };
  }

  private cleanOldFailures(): void {
    const now = Date.now();
    const windowStart = now - this.config.failureWindowMs;
    this.failures = this.failures.filter((t) => t > windowStart);
  }

  private updateState(): void {
    const now = Date.now();
    const windowStart = now - this.config.failureWindowMs;

    if (this.state === "closed") {
      const recentFailures = this.failures.filter((t) => t > windowStart);
      if (recentFailures.length >= this.config.failureThreshold) {
        this.state = "open";
        this.lastFailureAt = now;
      }
    } else if (this.state === "open") {
      if (
        this.lastFailureAt !== null &&
        now - this.lastFailureAt >= this.config.halfOpenTimeoutMs
      ) {
        this.state = "half-open";
      }
    }
  }

  recordSuccess(): void {
    if (this.state === "half-open") {
      this.state = "closed";
      this.failures = [];
      this.successCount = 0;
    } else if (this.state === "closed") {
      this.successCount++;
    }
  }

  recordFailure(): void {
    const now = Date.now();
    this.failures.push(now);
    this.lastFailureAt = now;
    this.updateState();
  }

  canExecute(): boolean {
    this.updateState();
    return this.state !== "open";
  }

  getState(): CircuitBreakerState {
    this.updateState();
    return this.state;
  }

  getMetrics(): CircuitBreakerMetrics {
    this.cleanOldFailures();
    return {
      state: this.getState(),
      failureCount: this.failures.length,
      lastFailureAt: this.lastFailureAt,
      successCount: this.successCount,
    };
  }

  reset(): void {
    this.failures = [];
    this.successCount = 0;
    this.state = "closed";
    this.lastFailureAt = null;
  }

  getConfig(): CircuitBreakerConfig {
    return { ...this.config };
  }
}

export function getDefaultCircuitBreakerConfig(): CircuitBreakerConfig {
  return {
    failureThreshold: 5,
    failureWindowMs: 10 * 60 * 1000,
    halfOpenTimeoutMs: 5 * 60 * 1000,
  };
}

export function resolveCircuitBreakerConfig(
  config?: OrchestratorConfigCircuitBreaker,
): CircuitBreakerConfig | undefined {
  if (!config) return undefined;
  return {
    failureThreshold:
      config.failureThreshold ??
      getDefaultCircuitBreakerConfig().failureThreshold,
    failureWindowMs:
      config.failureWindowMs ??
      getDefaultCircuitBreakerConfig().failureWindowMs,
    halfOpenTimeoutMs:
      config.halfOpenTimeoutMs ??
      getDefaultCircuitBreakerConfig().halfOpenTimeoutMs,
  };
}
