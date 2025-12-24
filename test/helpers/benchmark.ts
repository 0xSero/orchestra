/**
 * Benchmark harness for performance testing
 * 
 * Provides utilities for running benchmarks with warmup iterations,
 * statistical analysis, and comparison capabilities.
 */

import { calculateStats } from "./metrics";

/**
 * Configuration for a benchmark run
 */
export interface BenchmarkConfig {
  /** Name of the benchmark */
  name: string;
  /** Number of warmup iterations (default: 5) */
  warmupIterations?: number;
  /** Number of measurement iterations (default: 100) */
  measureIterations?: number;
  /** Setup function called once before all iterations */
  setup?: () => Promise<void>;
  /** Teardown function called once after all iterations */
  teardown?: () => Promise<void>;
  /** Function called before each iteration */
  beforeEach?: () => Promise<void>;
  /** Function called after each iteration */
  afterEach?: () => Promise<void>;
}

/**
 * Options for a single benchmark call
 */
export interface BenchmarkOptions {
  /** Number of measurement iterations (default: 100) */
  iterations?: number;
  /** Number of warmup iterations (default: 5) */
  warmup?: number;
  /** Timeout in milliseconds per iteration (default: 30000) */
  timeout?: number;
}

/**
 * Result of a benchmark run
 */
export interface BenchmarkResult {
  /** Name of the benchmark */
  name: string;
  /** Number of measurement iterations performed */
  iterations: number;
  /** Number of warmup iterations performed */
  warmupIterations: number;
  /** Mean duration in milliseconds */
  mean: number;
  /** Median duration in milliseconds */
  median: number;
  /** 95th percentile duration in milliseconds */
  p95: number;
  /** 99th percentile duration in milliseconds */
  p99: number;
  /** Minimum duration in milliseconds */
  min: number;
  /** Maximum duration in milliseconds */
  max: number;
  /** Standard deviation in milliseconds */
  stdDev: number;
  /** Raw sample data */
  samples: number[];
  /** Total runtime including warmup */
  totalRuntimeMs: number;
  /** Throughput in operations per second */
  opsPerSecond: number;
  /** Timestamp of benchmark run */
  timestamp: number;
}

/**
 * Comparison result between two benchmark runs
 */
export interface BenchmarkComparison {
  /** Whether a regression was detected */
  regression: boolean;
  /** Improvement percentage (negative means regression) */
  improvementPercent: number;
  /** Statistical significance level (0-1, lower is more significant) */
  significanceLevel: number;
  /** Baseline result */
  baseline: BenchmarkResult;
  /** Current result */
  current: BenchmarkResult;
  /** Analysis summary */
  summary: string;
}

/**
 * Performance baseline for regression detection
 */
export interface PerformanceBaseline {
  /** Version of the codebase */
  version: string;
  /** Timestamp of baseline creation */
  timestamp: number;
  /** Platform info */
  platform: string;
  /** Metrics captured */
  metrics: {
    spawnLatency: { p50: number; p95: number; p99: number };
    memoryBaseline: number;
    fileReadLatency: { p50: number; p95: number };
    lockAcquisition: { p50: number; p95: number };
  };
  /** Raw benchmark results */
  benchmarks: Record<string, BenchmarkResult>;
}

/**
 * Run a benchmark with warmup and measurement iterations
 * 
 * @param name - Name of the benchmark
 * @param fn - Function to benchmark
 * @param options - Benchmark options
 * @returns Benchmark results with statistics
 * 
 * @example
 * ```typescript
 * const result = await benchmark('spawnWorker', async () => {
 *   const worker = await spawnWorker(profile);
 *   await stopWorker(worker.profile.id);
 * }, { iterations: 50, warmup: 5 });
 * 
 * console.log(`Mean: ${result.mean.toFixed(2)}ms`);
 * console.log(`P95: ${result.p95.toFixed(2)}ms`);
 * ```
 */
export async function benchmark(
  name: string,
  fn: () => Promise<void> | void,
  options?: BenchmarkOptions
): Promise<BenchmarkResult> {
  const iterations = options?.iterations ?? 100;
  const warmup = options?.warmup ?? 5;
  const timeout = options?.timeout ?? 30_000;

  const samples: number[] = [];
  const startTotal = performance.now();

  // Warmup phase
  for (let i = 0; i < warmup; i++) {
    const result = fn();
    if (result instanceof Promise) {
      await Promise.race([
        result,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Warmup iteration ${i} timed out`)), timeout)
        ),
      ]);
    }
    // Discard warmup measurements, just run them
  }

  // Measurement phase
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const result = fn();
    if (result instanceof Promise) {
      await Promise.race([
        result,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Iteration ${i} timed out`)), timeout)
        ),
      ]);
    }
    const elapsed = performance.now() - start;
    samples.push(elapsed);
  }

  const totalRuntimeMs = performance.now() - startTotal;
  const stats = calculateStats(samples);

  return {
    name,
    iterations,
    warmupIterations: warmup,
    mean: stats.mean,
    median: stats.median,
    p95: stats.p95,
    p99: stats.p99,
    min: stats.min,
    max: stats.max,
    stdDev: stats.stdDev,
    samples,
    totalRuntimeMs,
    opsPerSecond: iterations / (totalRuntimeMs / 1000),
    timestamp: Date.now(),
  };
}

/**
 * Run a benchmark with full configuration including setup/teardown
 * 
 * @param config - Benchmark configuration
 * @param fn - Function to benchmark
 * @returns Benchmark results with statistics
 * 
 * @example
 * ```typescript
 * const result = await benchmarkWithConfig({
 *   name: 'file-read',
 *   warmupIterations: 10,
 *   measureIterations: 100,
 *   setup: async () => { await seedFixtures(); },
 *   teardown: async () => { await cleanupFixtures(); }
 * }, async () => {
 *   await readFixture();
 * });
 * ```
 */
export async function benchmarkWithConfig(
  config: BenchmarkConfig,
  fn: () => Promise<void> | void
): Promise<BenchmarkResult> {
  const warmupIterations = config.warmupIterations ?? 5;
  const measureIterations = config.measureIterations ?? 100;

  // Run setup
  if (config.setup) {
    await config.setup();
  }

  try {
    const samples: number[] = [];
    const startTotal = performance.now();

    // Warmup phase
    for (let i = 0; i < warmupIterations; i++) {
      if (config.beforeEach) {
        await config.beforeEach();
      }

      const result = fn();
      if (result instanceof Promise) {
        await result;
      }
      // Discard warmup measurements

      if (config.afterEach) {
        await config.afterEach();
      }
    }

    // Measurement phase
    for (let i = 0; i < measureIterations; i++) {
      if (config.beforeEach) {
        await config.beforeEach();
      }

      const start = performance.now();
      const result = fn();
      if (result instanceof Promise) {
        await result;
      }
      const elapsed = performance.now() - start;
      samples.push(elapsed);

      if (config.afterEach) {
        await config.afterEach();
      }
    }

    const totalRuntimeMs = performance.now() - startTotal;
    const stats = calculateStats(samples);

    return {
      name: config.name,
      iterations: measureIterations,
      warmupIterations,
      mean: stats.mean,
      median: stats.median,
      p95: stats.p95,
      p99: stats.p99,
      min: stats.min,
      max: stats.max,
      stdDev: stats.stdDev,
      samples,
      totalRuntimeMs,
      opsPerSecond: measureIterations / (totalRuntimeMs / 1000),
      timestamp: Date.now(),
    };
  } finally {
    // Always run teardown
    if (config.teardown) {
      await config.teardown();
    }
  }
}

/**
 * Compare two benchmark results and detect regression
 * 
 * @param baseline - Baseline benchmark result
 * @param current - Current benchmark result
 * @param options - Comparison options
 * @returns Comparison analysis
 * 
 * @example
 * ```typescript
 * const comparison = compareBenchmarks(baselineResult, currentResult);
 * if (comparison.regression) {
 *   console.error(`Performance regression detected: ${comparison.summary}`);
 * }
 * ```
 */
export function compareBenchmarks(
  baseline: BenchmarkResult,
  current: BenchmarkResult,
  options?: {
    /** Threshold percentage for regression detection (default: 10) */
    regressionThreshold?: number;
    /** Whether to use p95 instead of mean for comparison (default: true) */
    useP95?: boolean;
  }
): BenchmarkComparison {
  const threshold = options?.regressionThreshold ?? 10;
  const useP95 = options?.useP95 ?? true;

  const baselineValue = useP95 ? baseline.p95 : baseline.mean;
  const currentValue = useP95 ? current.p95 : current.mean;

  const improvementPercent = ((baselineValue - currentValue) / baselineValue) * 100;
  const regression = improvementPercent < -threshold;

  // Simple significance calculation based on standard deviation overlap
  const baselineRange = {
    low: baseline.mean - baseline.stdDev,
    high: baseline.mean + baseline.stdDev,
  };
  const currentRange = {
    low: current.mean - current.stdDev,
    high: current.mean + current.stdDev,
  };

  // Check for overlap
  const overlap = 
    currentRange.low <= baselineRange.high && 
    currentRange.high >= baselineRange.low;

  // Rough significance level (lower = more significant difference)
  const significanceLevel = overlap
    ? 0.5 + Math.abs(improvementPercent) / 200
    : Math.max(0.01, 0.1 - Math.abs(improvementPercent) / 1000);

  let summary: string;
  if (regression) {
    summary = `Regression detected: ${current.name} is ${Math.abs(improvementPercent).toFixed(1)}% slower (${baselineValue.toFixed(2)}ms -> ${currentValue.toFixed(2)}ms)`;
  } else if (improvementPercent > threshold) {
    summary = `Improvement: ${current.name} is ${improvementPercent.toFixed(1)}% faster (${baselineValue.toFixed(2)}ms -> ${currentValue.toFixed(2)}ms)`;
  } else {
    summary = `No significant change: ${current.name} (${baselineValue.toFixed(2)}ms -> ${currentValue.toFixed(2)}ms, ${improvementPercent.toFixed(1)}%)`;
  }

  return {
    regression,
    improvementPercent,
    significanceLevel,
    baseline,
    current,
    summary,
  };
}

/**
 * Run multiple benchmarks in a suite
 * 
 * @param name - Suite name
 * @param benchmarks - Map of benchmark names to functions
 * @param options - Shared options for all benchmarks
 * @returns Record of all benchmark results
 * 
 * @example
 * ```typescript
 * const results = await benchmarkSuite('io-operations', {
 *   'read-config': async () => await loadConfig(),
 *   'write-config': async () => await saveConfig(config),
 *   'list-files': async () => await readFixture(),
 * }, { iterations: 50 });
 * ```
 */
export async function benchmarkSuite(
  name: string,
  benchmarks: Record<string, () => Promise<void> | void>,
  options?: BenchmarkOptions
): Promise<Record<string, BenchmarkResult>> {
  const results: Record<string, BenchmarkResult> = {};

  console.log(`\n=== Benchmark Suite: ${name} ===\n`);

  for (const [benchName, fn] of Object.entries(benchmarks)) {
    console.log(`Running: ${benchName}...`);
    const result = await benchmark(benchName, fn, options);
    results[benchName] = result;
    console.log(
      `  Mean: ${result.mean.toFixed(2)}ms | ` +
      `Median: ${result.median.toFixed(2)}ms | ` +
      `P95: ${result.p95.toFixed(2)}ms | ` +
      `Ops/s: ${result.opsPerSecond.toFixed(1)}`
    );
  }

  console.log(`\n=== Suite Complete ===\n`);

  return results;
}

/**
 * Format benchmark result as a table row
 */
export function formatBenchmarkResult(result: BenchmarkResult): string {
  return [
    result.name.padEnd(30),
    `${result.mean.toFixed(2)}ms`.padStart(12),
    `${result.median.toFixed(2)}ms`.padStart(12),
    `${result.p95.toFixed(2)}ms`.padStart(12),
    `${result.p99.toFixed(2)}ms`.padStart(12),
    `${result.min.toFixed(2)}ms`.padStart(12),
    `${result.max.toFixed(2)}ms`.padStart(12),
    `${result.opsPerSecond.toFixed(1)}`.padStart(10),
  ].join(" | ");
}

/**
 * Format benchmark results as a markdown table
 */
export function formatBenchmarkTable(results: BenchmarkResult[]): string {
  const header = [
    "Benchmark".padEnd(30),
    "Mean".padStart(12),
    "Median".padStart(12),
    "P95".padStart(12),
    "P99".padStart(12),
    "Min".padStart(12),
    "Max".padStart(12),
    "Ops/s".padStart(10),
  ].join(" | ");

  const separator = [
    "-".repeat(30),
    "-".repeat(12),
    "-".repeat(12),
    "-".repeat(12),
    "-".repeat(12),
    "-".repeat(12),
    "-".repeat(12),
    "-".repeat(10),
  ].join("-|-");

  const rows = results.map(formatBenchmarkResult);

  return `| ${header} |\n| ${separator} |\n${rows.map((r) => `| ${r} |`).join("\n")}`;
}

/**
 * Create a performance baseline from current benchmarks
 */
export function createBaseline(
  version: string,
  benchmarks: Record<string, BenchmarkResult>
): PerformanceBaseline {
  const spawnLatency = benchmarks["spawn-worker"];
  const fileRead = benchmarks["file-read"];
  const lockAcquire = benchmarks["lock-acquisition"];

  return {
    version,
    timestamp: Date.now(),
    platform: `${process.platform}-${process.arch}`,
    metrics: {
      spawnLatency: spawnLatency
        ? {
            p50: spawnLatency.median,
            p95: spawnLatency.p95,
            p99: spawnLatency.p99,
          }
        : { p50: 0, p95: 0, p99: 0 },
      memoryBaseline: process.memoryUsage().rss,
      fileReadLatency: fileRead
        ? { p50: fileRead.median, p95: fileRead.p95 }
        : { p50: 0, p95: 0 },
      lockAcquisition: lockAcquire
        ? { p50: lockAcquire.median, p95: lockAcquire.p95 }
        : { p50: 0, p95: 0 },
    },
    benchmarks,
  };
}

/**
 * Detect regressions comparing current benchmarks to a baseline
 */
export function detectRegressions(
  baseline: PerformanceBaseline,
  current: Record<string, BenchmarkResult>,
  thresholdPercent = 10
): BenchmarkComparison[] {
  const regressions: BenchmarkComparison[] = [];

  for (const [name, currentResult] of Object.entries(current)) {
    const baselineResult = baseline.benchmarks[name];
    if (baselineResult) {
      const comparison = compareBenchmarks(baselineResult, currentResult, {
        regressionThreshold: thresholdPercent,
      });
      if (comparison.regression) {
        regressions.push(comparison);
      }
    }
  }

  return regressions;
}

/**
 * Sleep utility for benchmark delays
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
