import { watch, type FSWatcher } from "node:fs";
import { stat, readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { logger } from "./logger";

export interface FileChangeEvent {
  type: 'change' | 'rename' | 'unlink';
  path: string;
  timestamp: number;
  workerId?: string;
  content?: string;
}

export interface FileStats {
  size: number;
  mtime: Date;
  ctime: Date;
  isFile: boolean;
  isDirectory: boolean;
}

export class ConfigFileMonitor {
  private watchers = new Map<string, FSWatcher>();
  private eventHandlers = new Set<(event: FileChangeEvent) => void>();
  private fileContents = new Map<string, string>();
  
  startWatching(configPath: string, workerId?: string): void {
    if (this.watchers.has(configPath)) return;
    
    // Store initial content
    this.loadInitialContent(configPath);
    
    const watcher = watch(configPath, { persistent: false }, async (eventType, filename) => {
      logger.debug(`[FileMonitor] File ${eventType}: ${filename} for worker ${workerId || 'global'}`);
      
      let content: string | undefined;
      if (eventType === 'change') {
        try {
          content = await readFile(configPath, 'utf-8');
          this.fileContents.set(configPath, content);
        } catch (error) {
          logger.error(`[FileMonitor] Failed to read file ${configPath}: ${error}`);
        }
      }
      
      const event: FileChangeEvent = {
        type: eventType === 'change' ? 'change' : 'rename',
        path: configPath,
        timestamp: Date.now(),
        workerId,
        content
      };
      
      this.notifyHandlers(event);
    });
    
    watcher.on('error', (error) => {
      logger.error(`[FileMonitor] Watcher error for ${configPath}: ${error.message}`);
    });
    
    this.watchers.set(configPath, watcher);
    logger.debug(`[FileMonitor] Started watching: ${configPath}`);
  }
  
  private async loadInitialContent(configPath: string): Promise<void> {
    try {
      const content = await readFile(configPath, 'utf-8');
      this.fileContents.set(configPath, content);
    } catch (error) {
      // File might not exist initially, that's okay
      logger.debug(`[FileMonitor] Could not load initial content for ${configPath}: ${error}`);
    }
  }
  
  stopWatching(configPath: string): void {
    const watcher = this.watchers.get(configPath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(configPath);
      this.fileContents.delete(configPath);
      logger.debug(`[FileMonitor] Stopped watching: ${configPath}`);
    }
  }
  
  onFileChange(handler: (event: FileChangeEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }
  
  private notifyHandlers(event: FileChangeEvent): void {
    this.eventHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        logger.error(`[FileMonitor] Error in file change handler: ${error}`);
      }
    });
  }
  
  getContent(path: string): string | undefined {
    return this.fileContents.get(path);
  }
  
  stopAll(): void {
    this.watchers.forEach(watcher => {
      try {
        watcher.close();
      } catch (error) {
        logger.warn(`[FileMonitor] Error closing watcher: ${error}`);
      }
    });
    this.watchers.clear();
    this.eventHandlers.clear();
    this.fileContents.clear();
  }
  
  getWatchedPaths(): string[] {
    return Array.from(this.watchers.keys());
  }
}

export class WorkerWorkspaceManager {
  private workspaces = new Map<string, string>();
  private baseWorkspacesDir: string;
  
  constructor(baseDir: string) {
    this.baseWorkspacesDir = join(baseDir, '.opencode', 'workspaces');
  }
  
  async createWorkspace(workerId: string): Promise<string> {
    const workspacePath = join(this.baseWorkspacesDir, workerId);
    
    try {
      // Check if workspace already exists
      const workspaceStats = await stat(workspacePath);
      if (workspaceStats.isDirectory()) {
        logger.debug(`[WorkspaceManager] Workspace already exists: ${workspacePath}`);
      }
    } catch {
      // Create workspace directory with subdirectories
      await mkdir(workspacePath, { recursive: true });
      
      // Create standard subdirectories
      await mkdir(join(workspacePath, 'temp'), { recursive: true });
      await mkdir(join(workspacePath, 'output'), { recursive: true });
      await mkdir(join(workspacePath, 'cache'), { recursive: true });
      
      // Create .gitignore
      await writeFile(join(workspacePath, '.gitignore'), 
        `# Ignore everything except .gitignore
*
!.gitignore
# Allow output directory
!output/
`);
      
      // Create workspace metadata
      const metadata = {
        workerId,
        createdAt: new Date().toISOString(),
        version: '1.0.0'
      };
      
      await writeFile(join(workspacePath, 'workspace.json'), JSON.stringify(metadata, null, 2));
      
      logger.info(`[WorkspaceManager] Created workspace: ${workspacePath}`);
    }
    
    this.workspaces.set(workerId, workspacePath);
    return workspacePath;
  }
  
  getWorkspacePath(workerId: string): string | undefined {
    return this.workspaces.get(workerId);
  }
  
  async cleanupWorkspace(workerId: string): Promise<void> {
    const workspacePath = this.workspaces.get(workerId);
    if (workspacePath) {
      try {
        // Clean up temp files but keep workspace structure
        const tempDir = join(workspacePath, 'temp');
        const cacheDir = join(workspacePath, 'cache');
        
        await this.cleanupDirectory(tempDir);
        await this.cleanupDirectory(cacheDir);
        
        logger.debug(`[WorkspaceManager] Cleaned workspace: ${workerId}`);
      } catch (error) {
        logger.warn(`[WorkspaceManager] Error cleaning workspace ${workerId}: ${error}`);
      }
      
      this.workspaces.delete(workerId);
    }
  }
  
  private async cleanupDirectory(dirPath: string): Promise<void> {
    try {
      const entries = await readdir(dirPath);
      for (const entry of entries) {
        // Only remove files, keep directory structure
        const entryPath = join(dirPath, entry);
        const entryStat = await stat(entryPath);
        if (entryStat.isFile()) {
          // In a real implementation, you might use rimraf or similar
          logger.debug(`[WorkspaceManager] Would clean file: ${entryPath}`);
        }
      }
    } catch (error) {
      // Directory might not exist, that's okay
      logger.debug(`[WorkspaceManager] Could not clean directory ${dirPath}: ${error}`);
    }
  }
  
  async getWorkspaceStats(workerId: string): Promise<FileStats | null> {
    const workspacePath = this.workspaces.get(workerId);
    if (!workspacePath) return null;
    
    try {
      const stats = await stat(workspacePath);
      return {
        size: stats.size,
        mtime: stats.mtime,
        ctime: stats.ctime,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory()
      };
    } catch (error) {
      logger.warn(`[WorkspaceManager] Error getting stats for ${workerId}: ${error}`);
      return null;
    }
  }
  
  listWorkspaces(): string[] {
    return Array.from(this.workspaces.keys());
  }
}

export class FileOperations {
  /**
   * Safely read a JSON file with error handling
   */
  static async readJsonFile<T = unknown>(filePath: string, fallback: T): Promise<T> {
    try {
      const content = await readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      logger.debug(`[FileOperations] Failed to read JSON file ${filePath}: ${error}`);
      return fallback;
    }
  }
  
  /**
   * Safely write a JSON file with pretty formatting
   */
  static async writeJsonFile(filePath: string, data: unknown): Promise<void> {
    try {
      const content = JSON.stringify(data, null, 2);
      await writeFile(filePath, content, 'utf-8');
    } catch (error) {
      logger.error(`[FileOperations] Failed to write JSON file ${filePath}: ${error}`);
      throw error;
    }
  }
  
  /**
   * Ensure a directory exists
   */
  static async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await mkdir(dirPath, { recursive: true });
    } catch (error) {
      logger.error(`[FileOperations] Failed to create directory ${dirPath}: ${error}`);
      throw error;
    }
  }
  
  /**
   * Get file extension
   */
  static getFileExtension(filePath: string): string {
    return extname(filePath).toLowerCase();
  }
  
  /**
   * Get file basename without extension
   */
  static getFileBaseName(filePath: string): string {
    return basename(filePath, extname(filePath));
  }
}
