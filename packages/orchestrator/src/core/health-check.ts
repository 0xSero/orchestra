import { workerPool } from "./worker-pool";
import { workerJobs } from "./jobs";
import { listDeviceRegistry } from "./worker-pool";
import { isProcessAlive } from "../helpers/process";

export interface HealthReport {
  healthy: boolean;
  uptime: number;
  workerCount: number;
  jobStats: {
    total: number;
    running: number;
    succeeded: number;
    failed: number;
    canceled: number;
  };
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  deviceRegistryAlive: boolean;
  timestamp: number;
}

export class HealthCheck {
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  async check(): Promise<HealthReport> {
    const uptime = Date.now() - this.startTime;

    const workers = [...workerPool.workers.values()];
    const workerCount = workers.length;

    const jobSummary = workerJobs.getJobSummary();

    const memUsage = process.memoryUsage();

    let deviceRegistryAlive = true;
    try {
      const entries = await listDeviceRegistry();
      for (const entry of entries) {
        if (entry.kind === "worker") {
          if (!isProcessAlive(entry.pid)) {
            deviceRegistryAlive = false;
            break;
          }
        } else if (entry.kind === "session") {
          if (!isProcessAlive(entry.hostPid)) {
            deviceRegistryAlive = false;
            break;
          }
        }
      }
    } catch {
      deviceRegistryAlive = false;
    }

    const healthy = this.evaluateHealth(workerCount, {
      total: jobSummary.total,
      running: jobSummary.running,
      failed: jobSummary.failed,
    });

    return {
      healthy,
      uptime,
      workerCount,
      jobStats: {
        total: jobSummary.total,
        running: jobSummary.running,
        succeeded: jobSummary.succeeded,
        failed: jobSummary.failed,
        canceled: jobSummary.canceled,
      },
      memoryUsage: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss,
      },
      deviceRegistryAlive,
      timestamp: Date.now(),
    };
  }

  private evaluateHealth(
    workerCount: number,
    jobStats: { total: number; running: number; failed: number },
  ): boolean {
    if (workerCount === 0) return false;

    const errorRate = jobStats.total > 0 ? jobStats.failed / jobStats.total : 0;
    if (errorRate > 0.5) return false;

    return true;
  }

  getUptime(): number {
    return Date.now() - this.startTime;
  }
}

export const healthCheck = new HealthCheck();
