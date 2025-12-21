import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { WorkerHealthChecker } from "./core/net-utils.js";
import { SystemOptimizer } from "./core/system-optimizer.js";
import { ConfigFileMonitor, WorkerWorkspaceManager } from "./core/file-monitor.js";
import { logger } from "./core/logger.js";

// Handle both ESM and CommonJS compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

export interface MainConfig {
  directory?: string;
  enableHealthCheck?: boolean;
  enableSystemOptimizer?: boolean;
  enableFileMonitoring?: boolean;
  healthPort?: number;
}

export class EnhancedOrchestratorMain {
  private healthChecker: WorkerHealthChecker;
  private systemOptimizer: SystemOptimizer;
  private fileMonitor: ConfigFileMonitor;
  private workspaceManager: WorkerWorkspaceManager;
  private config: MainConfig;
  
  constructor(config: MainConfig = {}) {
    this.config = {
      enableHealthCheck: true,
      enableSystemOptimizer: true,
      enableFileMonitoring: true,
      healthPort: 0,
      ...config
    };
    
    this.healthChecker = new WorkerHealthChecker();
    this.systemOptimizer = new SystemOptimizer();
    this.fileMonitor = new ConfigFileMonitor();
    this.workspaceManager = new WorkerWorkspaceManager(config.directory || process.cwd());
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
    
    // Start file monitoring if enabled
    if (this.config.enableFileMonitoring && this.config.directory) {
      this.setupFileMonitoring();
    }
    
    await Promise.all(initPromises);
    
    // Log system information
    if (this.config.enableSystemOptimizer) {
      const systemInfo = this.systemOptimizer.getSystemSummary();
      logger.info(`[EnhancedMain] ${systemInfo}`);
    }
  }
  
  private setupFileMonitoring(): void {
    // Monitor main orchestrator config
    const configPath = join(this.config.directory!, '.opencode', 'orchestrator.json');
    this.fileMonitor.startWatching(configPath);
    
    // Monitor global config if it exists
    const globalConfigPath = join(this.config.directory!, 'orchestrator.json');
    this.fileMonitor.startWatching(globalConfigPath);
    
    // Set up file change handler
    this.fileMonitor.onFileChange((event) => {
      logger.info(`[EnhancedMain] Configuration file changed: ${event.path}`);
      // In a real implementation, this would trigger config reload
    });
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
   * Create workspace for a worker
   */
  async createWorkerWorkspace(workerId: string): Promise<string> {
    return this.workspaceManager.createWorkspace(workerId);
  }
  
  /**
   * Cleanup worker workspace
   */
  async cleanupWorkerWorkspace(workerId: string): Promise<void> {
    return this.workspaceManager.cleanupWorkspace(workerId);
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
      this.fileMonitor.stopAll();
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
      },
      fileMonitoring: {
        enabled: this.config.enableFileMonitoring,
        watchedFiles: this.fileMonitor.getWatchedPaths()
      },
      workspaceManager: {
        activeWorkspaces: this.workspaceManager.listWorkspaces()
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
