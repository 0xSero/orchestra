import {
  cpus,
  totalmem,
  freemem,
  loadavg,
  uptime,
  platform,
  arch,
  networkInterfaces,
  type CpuInfo
} from "node:os";
import type { WorkerInstance } from "../types";

export interface SystemMetrics {
  cpuCount: number;
  totalMemory: number;
  freeMemory: number;
  loadAverage: number[];
  uptime: number;
  platform: string;
  arch: string;
  networkInterfaces: ReturnType<typeof networkInterfaces>;
  cpuInfo: CpuInfo[];
}

export interface WorkerAllocation {
  workerId: string;
  recommendedCores: number;
  memoryLimit: number;
  priority: 'low' | 'normal' | 'high';
}

export class SystemOptimizer {
  private metrics: SystemMetrics;

  constructor() {
    this.metrics = this.collectMetrics();
  }
  
  private collectMetrics(): SystemMetrics {
    return {
      cpuCount: cpus().length,
      totalMemory: totalmem(),
      freeMemory: freemem(),
      loadAverage: loadavg(),
      uptime: uptime(),
      platform: platform(),
      arch: arch(),
      networkInterfaces: networkInterfaces() || {},
      cpuInfo: cpus()
    };
  }
  
  /**
   * Refresh system metrics
   */
  updateMetrics(): void {
    this.metrics = this.collectMetrics();
  }
  
  /**
   * Get current system metrics
   */
  getMetrics(): SystemMetrics {
    return { ...this.metrics };
  }
  
  /**
   * Get memory usage percentage
   */
  getMemoryUsagePercentage(): number {
    return ((this.metrics.totalMemory - this.metrics.freeMemory) / this.metrics.totalMemory) * 100;
  }
  
  /**
   * Get CPU usage percentage (based on load average)
   */
  getCpuUsagePercentage(): number {
    const load = this.metrics.loadAverage[0]; // 1-minute load average
    return Math.min((load / this.metrics.cpuCount) * 100, 100);
  }
  
  /**
   * Optimize worker allocation based on system resources
   */
  calculateOptimalWorkerAllocation(workers: WorkerInstance[]): WorkerAllocation[] {
    this.updateMetrics();
    
    const allocations: WorkerAllocation[] = [];
    const availableCores = Math.max(1, this.metrics.cpuCount - 1); // Reserve 1 core for orchestrator
    const availableMemory = this.metrics.freeMemory * 0.8; // Use 80% of free memory
    
    // Sort workers by priority (vision/coder get more resources)
    const priorityOrder = { 
      coder: 3, 
      vision: 2, 
      docs: 1, 
      architect: 1, 
      explorer: 1, 
      memory: 1 
    };
    
    const sortedWorkers = workers.sort((a, b) => {
      const priorityA = priorityOrder[a.profile.id as keyof typeof priorityOrder] || 0;
      const priorityB = priorityOrder[b.profile.id as keyof typeof priorityOrder] || 0;
      return priorityB - priorityA;
    });
    
    let assignedCores = 0;
    let assignedMemory = 0;
    
    for (const worker of sortedWorkers) {
      const priority = priorityOrder[worker.profile.id as keyof typeof priorityOrder] || 1;
      
      const recommendedCores = Math.min(
        Math.max(1, Math.floor(priority * availableCores / sortedWorkers.length)),
        availableCores - assignedCores
      );
      
      // Memory allocation: minimum 512MB, priority-based scaling
      const minMemory = 512 * 1024 * 1024; // 512MB
      const priorityMultiplier = priority * 0.5; // 0.5x to 1.5x base memory
      const memoryLimit = Math.min(
        Math.max(minMemory, 1024 * 1024 * 1024 * priorityMultiplier), // Base 1GB * priority
        availableMemory - assignedMemory
      );
      
      allocations.push({
        workerId: worker.profile.id,
        recommendedCores,
        memoryLimit,
        priority: priority >= 3 ? 'high' : priority >= 2 ? 'normal' : 'low'
      });
      
      assignedCores += recommendedCores;
      assignedMemory += memoryLimit;
    }
    
    return allocations;
  }
  
  /**
   * Health check for system load
   */
  isSystemHealthy(): { healthy: boolean; reason?: string; warnings?: string[] } {
    const warnings: string[] = [];
    
    // Check CPU load
    const load = this.metrics.loadAverage[0]; // 1-minute load average
    const maxLoad = this.metrics.cpuCount * 2; // Allow 2x CPU count
    
    if (load > maxLoad) {
      return { 
        healthy: false, 
        reason: `High system load: ${load.toFixed(2)} > ${maxLoad}`,
        warnings
      };
    }
    
    if (load > this.metrics.cpuCount) {
      warnings.push(`Moderate CPU load: ${load.toFixed(2)} / ${this.metrics.cpuCount}`);
    }
    
    // Check memory usage
    const memoryUsage = this.getMemoryUsagePercentage();
    if (memoryUsage > 90) {
      return { 
        healthy: false, 
        reason: `High memory usage: ${memoryUsage.toFixed(1)}%`,
        warnings
      };
    }
    
    if (memoryUsage > 80) {
      warnings.push(`High memory usage: ${memoryUsage.toFixed(1)}%`);
    }
    
    return { healthy: true, warnings };
  }
  
  /**
   * Get optimal worker spawn delay based on system load
   */
  getOptimalWorkerSpawnDelay(): number {
    const load = this.metrics.loadAverage[0];
    const cpuCount = this.metrics.cpuCount;
    const memoryUsage = this.getMemoryUsagePercentage();
    
    let baseDelay = 500; // Base 500ms
    
    // Adjust for CPU load
    if (load > cpuCount * 1.5) {
      baseDelay *= 4; // 4x delay under very high load
    } else if (load > cpuCount) {
      baseDelay *= 2; // 2x delay under high load
    } else if (load < cpuCount * 0.5) {
      baseDelay = 200; // Fast spawning when system is idle
    }
    
    // Adjust for memory usage
    if (memoryUsage > 85) {
      baseDelay *= 2; // Additional delay for high memory usage
    }
    
    return baseDelay;
  }
  
  /**
   * Get system information summary
   */
  getSystemSummary(): string {
    const cpuModel = this.metrics.cpuInfo[0]?.model || 'Unknown';
    const cpuSpeed = this.metrics.cpuInfo[0]?.speed || 0;
    const memoryUsage = this.getMemoryUsagePercentage();
    const cpuUsage = this.getCpuUsagePercentage();
    
    return `System: ${this.metrics.platform}-${this.metrics.arch} | ` +
           `CPU: ${this.metrics.cpuCount}x ${cpuModel}@${cpuSpeed}GHz (${cpuUsage.toFixed(1)}% load) | ` +
           `Memory: ${memoryUsage.toFixed(1)}% used | ` +
           `Uptime: ${Math.floor(this.metrics.uptime / 3600)}h`;
  }
  
  /**
   * Check if system can handle additional workers
   */
  canSpawnWorkers(count: number = 1): boolean {
    const health = this.isSystemHealthy();
    if (!health.healthy) return false;
    
    // Rough estimate: each worker needs at least 512MB and 0.5 cores
    const requiredMemory = count * 512 * 1024 * 1024;
    const requiredCores = count * 0.5;
    
    return this.metrics.freeMemory >= requiredMemory && 
           this.metrics.loadAverage[0] <= this.metrics.cpuCount - requiredCores;
  }
}
