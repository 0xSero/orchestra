import { 
  inspect, 
   
  format, 
  callbackify,
  debuglog
} from "node:util";
import type { WorkerInstance } from "../types";
import { logger } from "../core/logger";

// Enhanced debugging for worker states
export const workerDebug = debuglog('opencode:worker');

// Type checking utilities
export const isWorkerInstance = (obj: unknown): obj is WorkerInstance => {
  return typeof obj === 'object' && 
         obj !== null &&
         typeof (obj as WorkerInstance).profile === 'object' &&
         typeof (obj as WorkerInstance).status === 'string';
};

// Formatted worker status reporting
export const formatWorkerStatus = (worker: WorkerInstance): string => {
  return format('Worker %s: %s (pid: %s, port: %s)', 
    worker.profile.id, 
    worker.status, 
    worker.pid || 'unknown',
    worker.port || 'unknown'
  );
};

// Safe callback wrapper for async worker operations
export const safeCallbackify = <T extends any[], R>(
  fn: (...args: T) => Promise<R>
) => {
  return callbackify(fn);
};

// Deprecated method wrapper with clear migration path
export const deprecatedWorkerMethod = (workerId: string) => {
  logger.warn(
    `deprecatedWorkerMethod(${workerId}) is deprecated. Use checkWorkerHealth() instead.`
  );
};

// Enhanced inspection for worker objects
export const inspectWorker = (worker: WorkerInstance, depth = 2): string => {
  return inspect(worker, {
    depth,
    colors: process.stdout.isTTY,
    compact: false,
    showHidden: false
  });
};

// Safe JSON parsing with error handling
export const safeJsonParse = <T = unknown>(str: string, fallback: T): T => {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
};

// Timeout utility for async operations
export const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, timeoutError: Error = new Error('Operation timed out')): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(timeoutError), timeoutMs);
    })
  ]);
};

// Retry utility with exponential backoff
export const retry = async <T>(fn: () => Promise<T>, maxAttempts = 3, baseDelay = 1000): Promise<T> => {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxAttempts) {
        throw lastError;
      }
      
      const delay = baseDelay * 2 ** (attempt - 1);
      workerDebug(`Attempt ${attempt} failed, retrying in ${delay}ms: ${lastError.message}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
};

// Memory usage formatting
export const formatMemoryUsage = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
};

// Performance timer utility
export const createTimer = () => {
  const start = process.hrtime.bigint();
  
  return {
    elapsed: (): number => {
      const end = process.hrtime.bigint();
      return Number(end - start) / 1000000; // Convert to milliseconds
    },
    
    elapsedMicros: (): number => {
      const end = process.hrtime.bigint();
      return Number(end - start) / 1000; // Convert to microseconds
    }
  };
};

// Safe process exit handling
export const gracefulShutdown = (cleanup: () => Promise<void> | void) => {
  const shutdown = async (signal: string) => {
    workerDebug(`Received ${signal}, starting graceful shutdown`);
    try {
      await cleanup();
      workerDebug('Cleanup completed, exiting');
      process.exit(0);
    } catch (error) {
      workerDebug(`Cleanup failed: ${error}`);
      process.exit(1);
    }
  };
  
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGUSR2', () => shutdown('SIGUSR2')); // For nodemon
};
