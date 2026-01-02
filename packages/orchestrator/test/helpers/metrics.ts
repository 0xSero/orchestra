/**
 * Performance metrics collection utilities for test harness
 *
 * Provides interfaces and implementation for collecting performance metrics
 * during test execution including spawn latency, memory usage, file I/O,
 * and throughput measurements.
 */

import { listOpencodeServeProcesses } from "../../src/core/process-metrics";

/**
 * Core metrics collected during test execution
 */
export interface Metrics {
  /** Spawn latency measurements in milliseconds */
  spawnLatencyMs: number[];
  /** Memory usage samples in megabytes */
  memoryUsageMb: number[];
  /** File I/O latency measurements in milliseconds */
  fileIoLatencyMs: number[];
  /** Total messages processed */
  messageCount: number;
  /** Current number of active workers */
  activeWorkers: number;
  /** Errors encountered during collection */
  errors: string[];
}

/**
 * Extended performance metrics matching architecture spec
 */
export interface PerformanceMetrics {
  spawn: {
    /** Time from spawnWorker call to ready */
    latencyMs: number[];
    /** Percentage of successful spawns */
    successRate: number;
    /** Times in-flight dedup triggered */
    deduplicationHits: number;
  };
  memory: {
    /** RSS samples over time */
    rssBytes: number[];
    /** V8 heap usage */
    heapUsedBytes: number[];
    /** External memory (buffers) */
    externalBytes: number[];
    /** Maximum RSS observed */
    peakRssBytes: number;
  };
  io: {
    /** File read latencies */
    deviceRegistryReadMs: number[];
    /** File write latencies */
    deviceRegistryWriteMs: number[];
    /** Profile lock acquisition time */
    lockAcquireMs: number[];
  };
  throughput: {
    /** Message bus throughput */
    messagesPerSecond: number;
    /** Worker prompt rate */
    promptsPerMinute: number;
  };
  jobs: {
    /** Current active jobs */
    activeCount: number;
    /** Total completed */
    completedCount: number;
    /** Average job duration */
    avgDurationMs: number;
    /** Estimated job registry memory */
    memoryBytesUsed: number;
  };
}

/**
 * Time series data for visualization and analysis
 */
export interface TimeSeriesData {
  /** Timestamps in milliseconds since epoch */
  timestamps: number[];
  /** RSS bytes at each timestamp */
  rssBytes: number[];
  /** Heap bytes at each timestamp */
  heapBytes: number[];
  /** OpenCode process count at each timestamp */
  opencodeProcessCount: number[];
  /** Active jobs at each timestamp */
  activeJobs: number[];
}

/**
 * Span tracking for measuring operation durations
 */
interface ActiveSpan {
  name: string;
  startTime: number;
}

/**
 * Creates a new MetricsCollector instance for tracking test performance
 */
export interface MetricsCollector {
  /**
   * Start a timing span for an operation
   * @param name - Name of the span/operation
   * @returns Function to call when span ends
   */
  startSpan(name: string): () => void;

  /**
   * Record current memory usage snapshot
   */
  recordMemory(): void;

  /**
   * Record an error that occurred during testing
   * @param error - Error message to record
   */
  recordError(error: string): void;

  /**
   * Record a spawn latency measurement
   * @param latencyMs - Spawn latency in milliseconds
   */
  recordSpawnLatency(latencyMs: number): void;

  /**
   * Record a file I/O latency measurement
   * @param latencyMs - I/O latency in milliseconds
   */
  recordFileIo(latencyMs: number): void;

  /**
   * Increment message count
   */
  recordMessage(): void;

  /**
   * Set active worker count
   * @param count - Number of active workers
   */
  setActiveWorkers(count: number): void;

  /**
   * Get current metrics snapshot
   */
  getMetrics(): Metrics;

  /**
   * Get full performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics;

  /**
   * Get time series data for all samples
   */
  getTimeSeries(): TimeSeriesData;

  /**
   * Reset all collected metrics
   */
  reset(): void;

  /**
   * Start automatic sampling
   */
  start(): void;

  /**
   * Stop sampling and return final metrics
   */
  stop(): PerformanceMetrics;

  /**
   * Take a point-in-time sample
   */
  sample(): Promise<void>;
}

/**
 * Creates a new MetricsCollector instance
 *
 * @example
 * ```typescript
 * const collector = createMetricsCollector();
 * collector.start();
 *
 * // During test execution
 * const endSpan = collector.startSpan('spawnWorker');
 * await spawnWorker(profile);
 * endSpan();
 *
 * // After test
 * const metrics = collector.stop();
 * console.log(`Spawn P95: ${percentile(metrics.spawn.latencyMs, 95)}ms`);
 * ```
 */
export function createMetricsCollector(options?: {
  /** Automatic sampling interval in ms (default: 1000) */
  sampleIntervalMs?: number;
  /** Whether to auto-start sampling (default: false) */
  autoStart?: boolean;
}): MetricsCollector {
  const sampleIntervalMs = options?.sampleIntervalMs ?? 1000;

  // Core metrics storage
  let spawnLatencyMs: number[] = [];
  let memoryUsageMb: number[] = [];
  let fileIoLatencyMs: number[] = [];
  let messageCount = 0;
  let activeWorkers = 0;
  let errors: string[] = [];

  // Extended metrics storage
  let spawnSuccessCount = 0;
  let spawnFailureCount = 0;
  let deduplicationHits = 0;
  let rssBytes: number[] = [];
  let heapUsedBytes: number[] = [];
  let externalBytes: number[] = [];
  let peakRssBytes = 0;
  let deviceRegistryReadMs: number[] = [];
  let deviceRegistryWriteMs: number[] = [];
  let lockAcquireMs: number[] = [];
  let promptCount = 0;
  let jobsCompleted = 0;
  let jobDurations: number[] = [];

  // Time series data
  let timestamps: number[] = [];
  let timeSeriesRss: number[] = [];
  let timeSeriesHeap: number[] = [];
  let timeSeriesProcessCount: number[] = [];
  let timeSeriesActiveJobs: number[] = [];

  // Active spans for timing
  const activeSpans = new Map<string, ActiveSpan>();

  // Sampling state
  let sampleInterval: ReturnType<typeof setInterval> | null = null;
  let startTime = 0;

  const collector: MetricsCollector = {
    startSpan(name: string): () => void {
      const span: ActiveSpan = {
        name,
        startTime: performance.now(),
      };
      activeSpans.set(`${name}-${Date.now()}`, span);

      return () => {
        const duration = performance.now() - span.startTime;

        // Categorize spans by name prefix
        if (name.startsWith("spawn")) {
          spawnLatencyMs.push(duration);
          spawnSuccessCount++;
        } else if (name.startsWith("io:read")) {
          deviceRegistryReadMs.push(duration);
          fileIoLatencyMs.push(duration);
        } else if (name.startsWith("io:write")) {
          deviceRegistryWriteMs.push(duration);
          fileIoLatencyMs.push(duration);
        } else if (name.startsWith("lock")) {
          lockAcquireMs.push(duration);
        } else if (name.startsWith("job")) {
          jobDurations.push(duration);
          jobsCompleted++;
        }

        activeSpans.delete(`${name}-${span.startTime}`);
      };
    },

    recordMemory(): void {
      const memUsage = process.memoryUsage();
      const rssMb = memUsage.rss / (1024 * 1024);

      memoryUsageMb.push(rssMb);
      rssBytes.push(memUsage.rss);
      heapUsedBytes.push(memUsage.heapUsed);
      externalBytes.push(memUsage.external);

      if (memUsage.rss > peakRssBytes) {
        peakRssBytes = memUsage.rss;
      }
    },

    recordError(error: string): void {
      errors.push(error);
    },

    recordSpawnLatency(latencyMs: number): void {
      spawnLatencyMs.push(latencyMs);
    },

    recordFileIo(latencyMs: number): void {
      fileIoLatencyMs.push(latencyMs);
    },

    recordMessage(): void {
      messageCount++;
    },

    setActiveWorkers(count: number): void {
      activeWorkers = count;
    },

    getMetrics(): Metrics {
      return {
        spawnLatencyMs: [...spawnLatencyMs],
        memoryUsageMb: [...memoryUsageMb],
        fileIoLatencyMs: [...fileIoLatencyMs],
        messageCount,
        activeWorkers,
        errors: [...errors],
      };
    },

    getPerformanceMetrics(): PerformanceMetrics {
      const totalSpawns = spawnSuccessCount + spawnFailureCount;
      const elapsedMinutes = (Date.now() - startTime) / 60_000;
      const avgJobDuration =
        jobDurations.length > 0
          ? jobDurations.reduce((a, b) => a + b, 0) / jobDurations.length
          : 0;

      return {
        spawn: {
          latencyMs: [...spawnLatencyMs],
          successRate: totalSpawns > 0 ? spawnSuccessCount / totalSpawns : 1,
          deduplicationHits,
        },
        memory: {
          rssBytes: [...rssBytes],
          heapUsedBytes: [...heapUsedBytes],
          externalBytes: [...externalBytes],
          peakRssBytes,
        },
        io: {
          deviceRegistryReadMs: [...deviceRegistryReadMs],
          deviceRegistryWriteMs: [...deviceRegistryWriteMs],
          lockAcquireMs: [...lockAcquireMs],
        },
        throughput: {
          messagesPerSecond:
            elapsedMinutes > 0 ? messageCount / (elapsedMinutes * 60) : 0,
          promptsPerMinute:
            elapsedMinutes > 0 ? promptCount / elapsedMinutes : 0,
        },
        jobs: {
          activeCount: activeSpans.size,
          completedCount: jobsCompleted,
          avgDurationMs: avgJobDuration,
          memoryBytesUsed: peakRssBytes,
        },
      };
    },

    getTimeSeries(): TimeSeriesData {
      return {
        timestamps: [...timestamps],
        rssBytes: [...timeSeriesRss],
        heapBytes: [...timeSeriesHeap],
        opencodeProcessCount: [...timeSeriesProcessCount],
        activeJobs: [...timeSeriesActiveJobs],
      };
    },

    reset(): void {
      spawnLatencyMs = [];
      memoryUsageMb = [];
      fileIoLatencyMs = [];
      messageCount = 0;
      activeWorkers = 0;
      errors = [];
      spawnSuccessCount = 0;
      spawnFailureCount = 0;
      deduplicationHits = 0;
      rssBytes = [];
      heapUsedBytes = [];
      externalBytes = [];
      peakRssBytes = 0;
      deviceRegistryReadMs = [];
      deviceRegistryWriteMs = [];
      lockAcquireMs = [];
      promptCount = 0;
      jobsCompleted = 0;
      jobDurations = [];
      timestamps = [];
      timeSeriesRss = [];
      timeSeriesHeap = [];
      timeSeriesProcessCount = [];
      timeSeriesActiveJobs = [];
      activeSpans.clear();
      startTime = 0;
    },

    start(): void {
      startTime = Date.now();
      this.sample();

      sampleInterval = setInterval(() => {
        this.sample();
      }, sampleIntervalMs);
    },

    stop(): PerformanceMetrics {
      if (sampleInterval) {
        clearInterval(sampleInterval);
        sampleInterval = null;
      }
      return this.getPerformanceMetrics();
    },

    async sample(): Promise<void> {
      const now = Date.now();
      const memUsage = process.memoryUsage();

      timestamps.push(now);
      timeSeriesRss.push(memUsage.rss);
      timeSeriesHeap.push(memUsage.heapUsed);
      timeSeriesActiveJobs.push(activeSpans.size);

      // Sample OpenCode process count
      try {
        const procs = await listOpencodeServeProcesses();
        timeSeriesProcessCount.push(procs.length);
        activeWorkers = procs.length;
      } catch {
        timeSeriesProcessCount.push(0);
      }

      // Update peak RSS
      if (memUsage.rss > peakRssBytes) {
        peakRssBytes = memUsage.rss;
      }

      rssBytes.push(memUsage.rss);
      heapUsedBytes.push(memUsage.heapUsed);
      memoryUsageMb.push(memUsage.rss / (1024 * 1024));
    },
  };

  if (options?.autoStart) {
    collector.start();
  }

  return collector;
}

/**
 * Calculate percentile from an array of numbers
 *
 * @param values - Array of numeric values
 * @param p - Percentile (0-100)
 * @returns The value at the given percentile
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Calculate statistics for an array of numbers
 */
export function calculateStats(values: number[]): {
  mean: number;
  median: number;
  min: number;
  max: number;
  stdDev: number;
  p95: number;
  p99: number;
} {
  if (values.length === 0) {
    return { mean: 0, median: 0, min: 0, max: 0, stdDev: 0, p95: 0, p99: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;

  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(variance);

  const medianIndex = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[medianIndex - 1] + sorted[medianIndex]) / 2
      : sorted[medianIndex];

  return {
    mean,
    median,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    stdDev,
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

/**
 * Format bytes as human-readable string
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 ? 0 : unit <= 2 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

/**
 * Format duration in milliseconds as human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = ((ms % 60_000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
}
