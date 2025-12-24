import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { WorkerHealthChecker } from "./core/net-utils.js";
import { SystemOptimizer } from "./core/system-optimizer.js";
import { logger } from "./core/logger.js";

// Handle both ESM and CommonJS compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

export interface MainConfig {
  directory?: string;
  enableHealthCheck?: boolean;
  enableSystemOptimizer?: boolean;
  healthPort?: number;
}

export class EnhancedOrchestratorMain {
  private healthChecker: WorkerHealthChecker;
  private systemOptimizer: SystemOptimizer;
  private config: MainConfig;
  
  constructor(config: MainConfig = {}) {
    this.config = {
      enableHealthCheck: true,
      enableSystemOptimizer: true,
      healthPort: 0,
      ...config
    };
    
    this.healthChecker = new WorkerHealthChecker();
    this.systemOptimizer = new SystemOptimizer();
  }
  
  /**
   * Initialize all enhanced components
   */
  async initialize(): Promise<void> {
    logger.info('[EnhancedMain] Initializing enhanced orchestrator components');
    
    const initPromises: Promise<void>[] = [];
    
    // Start health checker if enabled
    if (this.config.enableHealthCheck && this.config.healthPort) {
      initPromises.push(
        this.healthChecker.startHealthServer(this.config.healthPort)
          .catch(error => {
            logger.warn(`[EnhancedMain] Failed to start health checker: ${error}`);
          })
      );
    }
    
    await Promise.all(initPromises);
    
    // Log system information
    if (this.config.enableSystemOptimizer) {
      const systemInfo = this.systemOptimizer.getSystemSummary();
      logger.info(`[EnhancedMain] ${systemInfo}`);
    }
  }
  
  /**
   * Get system health status
   */
  getSystemHealth() {
    if (!this.config.enableSystemOptimizer) {
      return { healthy: true, message: 'System optimizer disabled' };
    }
    
    return this.systemOptimizer.isSystemHealthy();
  }
  
  /**
   * Get optimal worker allocation
   */
  async getOptimalWorkerAllocation(workers: any[]) {
    if (!this.config.enableSystemOptimizer) {
      return [];
    }
    
    return this.systemOptimizer.calculateOptimalWorkerAllocation(workers);
  }
  
  /**
   * Check worker health
   */
  async checkWorkerHealth(workerId: string, port: number): Promise<boolean> {
    if (!this.config.enableHealthCheck) {
      return true; // Assume healthy if disabled
    }
    
    return this.healthChecker.checkWorkerHealth(workerId, port);
  }
  
  /**
   * Get optimal spawn delay
   */
  getOptimalSpawnDelay(): number {
    if (!this.config.enableSystemOptimizer) {
      return 1000; // Default delay
    }
    
    return this.systemOptimizer.getOptimalWorkerSpawnDelay();
  }
  
  /**
   * Shutdown all components
   */
  async shutdown(): Promise<void> {
    logger.info('[EnhancedMain] Shutting down enhanced components');
    
    const shutdownPromises: Promise<void>[] = [];
    
    shutdownPromises.push(this.healthChecker.stopHealthServer());
    
    return Promise.all(shutdownPromises).then(() => {
      logger.info('[EnhancedMain] All enhanced components shut down');
    });
  }
  
  /**
   * Get component status
   */
  getStatus() {
    return {
      healthChecker: {
        enabled: this.config.enableHealthCheck,
        port: this.healthChecker.getHealthPort()
      },
      systemOptimizer: {
        enabled: this.config.enableSystemOptimizer,
        healthy: this.getSystemHealth()
      }
    };
  }
}

/**
 * Factory function for creating enhanced main instance
 */
export function createEnhancedMain(config?: MainConfig): EnhancedOrchestratorMain {
  return new EnhancedOrchestratorMain(config);
}

/**
 * Legacy compatibility function
 */
export function createMain() {
  return {
    // Enhanced main entry point with better error handling
    async start() {
      try {
        const { OrchestratorPlugin } = await import('./index.js');
        return OrchestratorPlugin;
      } catch (error) {
        console.error('Failed to load orchestrator plugin:', error);
        process.exit(1);
      }
    },
    
    // Compatibility layer for different module systems
    require,
    
    // Path utilities
    paths: {
      __dirname,
      __filename,
      resolve: (...paths: string[]) => join(__dirname, ...paths)
    }
  };
}

// Default export for backward compatibility
export default {
  EnhancedOrchestratorMain,
  createEnhancedMain,
  createMain
};

// Named exports
export {
  __dirname,
  __filename,
  require
};
