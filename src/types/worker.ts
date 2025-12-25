import type { ToolPermissions } from "./permissions";

export type WorkerStatus = "starting" | "ready" | "busy" | "error" | "stopped";

export interface WorkerProfile {
  /** Unique identifier for this worker */
  id: string;
  /** Human-readable name */
  name: string;
  /** Model to use (provider/model or auto/node tag) */
  model: string;
  /** Provider ID */
  providerID?: string;
  /** What this worker specializes in */
  purpose: string;
  /** When to use this worker (injected into context) */
  whenToUse: string;
  /** Optional system prompt override */
  systemPrompt?: string;
  /** Port assigned to this worker's opencode instance */
  port?: number;
  /** Whether this worker can see images */
  supportsVision?: boolean;
  /** Whether this worker has web access */
  supportsWeb?: boolean;
  /** Custom tools to enable/disable */
  tools?: Record<string, boolean>;
  /** Temperature setting */
  temperature?: number;
  /** Optional keywords/tags to improve matching */
  tags?: string[];
  /** Whether to inject repo context on auto-launch (for docs worker) */
  injectRepoContext?: boolean;
  /** Optional tool permission constraints */
  permissions?: ToolPermissions;
  /** Extend another profile */
  extends?: string;
  /** Compose multiple profiles */
  compose?: string[];
}

export interface WorkerInstance {
  profile: WorkerProfile;
  status: WorkerStatus;
  port: number;
  /** PID of the spawned `opencode serve` process (when spawned by orchestrator) */
  pid?: number;
  /** Base URL of the worker server */
  serverUrl?: string;
  /** Directory context for tool execution (query.directory) */
  directory?: string;
  sessionId?: string;
  client?: ReturnType<typeof import("@opencode-ai/sdk").createOpencodeClient>;
  /** If this worker was spawned in-process, this shuts down its server */
  shutdown?: () => void | Promise<void>;
  startedAt: Date;
  lastActivity?: Date;
  error?: string;
  warning?: string;
  currentTask?: string;
  /** Most recent completed output (for UI) */
  lastResult?: {
    at: Date;
    jobId?: string;
    response: string;
    report?: {
      summary?: string;
      details?: string;
      issues?: string[];
      notes?: string;
    };
    durationMs?: number;
  };
  /** How the worker model was resolved */
  modelResolution?: string;
}

export interface Registry {
  workers: Map<string, WorkerInstance>;
  getWorker(id: string): WorkerInstance | undefined;
  getWorkersByCapability(capability: string): WorkerInstance[];
  getActiveWorkers(): WorkerInstance[];
}

export interface MessageToWorker {
  workerId: string;
  content: string;
  attachments?: Array<{
    type: "image" | "file";
    path?: string;
    base64?: string;
    mimeType?: string;
  }>;
  /** Wait for response */
  waitForResponse?: boolean;
  /** Timeout in ms */
  timeout?: number;
}

export interface WorkerResponse {
  workerId: string;
  content: string;
  success: boolean;
  error?: string;
  duration?: number;
}
