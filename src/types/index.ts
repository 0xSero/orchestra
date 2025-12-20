/**
 * Type definitions for the Orchestrator plugin
 */

export type WorkerStatus = "starting" | "ready" | "busy" | "error" | "stopped";

export interface WorkerProfile {
  /** Unique identifier for this worker */
  id: string;
  /** Human-readable name */
  name: string;
  /** Model to use (e.g., "zhipuai/glm-4.6v", "anthropic/claude-sonnet-4") */
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
}

export interface WorkerInstance {
  profile: WorkerProfile;
  status: WorkerStatus;
  port: number;
  /** Directory context for tool execution (query.directory) */
  directory?: string;
  sessionId?: string;
  client?: ReturnType<typeof import("@opencode-ai/sdk").createOpencodeClient>;
  /** If this worker was spawned in-process, this shuts down its server */
  shutdown?: () => void;
  startedAt: Date;
  lastActivity?: Date;
  error?: string;
}

export interface Registry {
  workers: Map<string, WorkerInstance>;
  getWorker(id: string): WorkerInstance | undefined;
  getWorkersByCapability(capability: string): WorkerInstance[];
  getActiveWorkers(): WorkerInstance[];
}

export interface OrchestratorConfig {
  /** Base port to start assigning from */
  basePort: number;
  /** Available worker profiles (built-ins + overrides + custom) */
  profiles: Record<string, WorkerProfile>;
  /** Profile IDs to auto-spawn on startup */
  spawn: string[];
  /** Auto-spawn workers on plugin init */
  autoSpawn: boolean;
  /** Timeout for worker startup (ms) */
  startupTimeout: number;
  /** Health check interval (ms) */
  healthCheckInterval: number;
  /** UX and prompt injection settings */
  ui?: {
    /** Show OpenCode toasts for orchestrator events */
    toasts?: boolean;
    /** Inject available workers into system prompt */
    injectSystemContext?: boolean;
    /** Maximum workers to include in system context */
    systemContextMaxWorkers?: number;
    /** Default tool output format */
    defaultListFormat?: "markdown" | "json";
  };
  /** Optional idle notifications */
  notifications?: {
    idle?: {
      enabled?: boolean;
      title?: string;
      message?: string;
      delayMs?: number;
    };
  };
  /** Inject an orchestrator agent definition into OpenCode config */
  agent?: {
    enabled?: boolean;
    name?: string;
    model?: string;
    prompt?: string;
    mode?: "primary" | "subagent";
    color?: string;
  };
  /** Inject command shortcuts into OpenCode config */
  commands?: {
    enabled?: boolean;
    /** Prefix for generated command names (default: "orchestrator.") */
    prefix?: string;
  };
  /** Context pruning settings (DCP-inspired) */
  pruning?: {
    enabled?: boolean;
    /** Max chars to keep for completed tool outputs */
    maxToolOutputChars?: number;
    /** Max chars to keep for tool inputs (write/edit) */
    maxToolInputChars?: number;
    /** Tools that should never be pruned */
    protectedTools?: string[];
  };

  /**
   * Workflow system configuration (multi-step orchestrations).
   * Workflows are local to this plugin and run by delegating to worker profiles.
   */
  workflows?: {
    enabled?: boolean;
    /** Optional allow-list of workflow IDs that can be executed. If set, others are blocked. */
    allow?: string[];
    /** Built-in Roocode sequential boomerang workflow defaults/overrides. */
    roocodeBoomerang?: {
      enabled?: boolean;
      maxSteps?: number;
      perStepTimeoutMs?: number;
      maxTaskChars?: number;
      maxCarryChars?: number;
      /**
       * Optional step override (advanced). If provided, replaces the default sequence.
       * Each step references a worker profile by id and a prompt template.
       */
      steps?: Array<{
        id: string;
        profileId: string;
        prompt: string;
        forwardAttachments?: boolean;
      }>;
    };
  };

  /**
   * Security hardening knobs.
   * These are intentionally conservative by default.
   */
  security?: {
    /**
     * Attachment path sandboxing.
     * Note: the plugin always defaults to restricting path attachments to the current project directory.
     */
    attachments?: {
      allowFileAttachments?: boolean;
      maxFileBytes?: number;
      maxBase64Chars?: number;
      maxAttachments?: number;
    };
    /** If true (default), refuse to write memory entries that look like secrets. */
    blockSecretsInMemory?: boolean;
  };
}

export type OrchestratorConfigFile = {
  $schema?: string;
  basePort?: number;
  autoSpawn?: boolean;
  startupTimeout?: number;
  healthCheckInterval?: number;
  ui?: OrchestratorConfig["ui"];
  notifications?: OrchestratorConfig["notifications"];
  agent?: OrchestratorConfig["agent"];
  commands?: OrchestratorConfig["commands"];
  pruning?: OrchestratorConfig["pruning"];
  workflows?: OrchestratorConfig["workflows"];
  security?: OrchestratorConfig["security"];
  /** Profiles available to spawn (overrides/custom). Strings reference built-ins. */
  profiles?: Array<string | WorkerProfile>;
  /** Profiles to auto-spawn. Strings reference profiles by id. */
  workers?: Array<string | WorkerProfile>;
};

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

export interface OrchestratorEvents {
  "worker:spawned": { worker: WorkerInstance };
  "worker:ready": { worker: WorkerInstance };
  "worker:busy": { worker: WorkerInstance };
  "worker:error": { worker: WorkerInstance; error: string };
  "worker:stopped": { worker: WorkerInstance };
  "worker:response": { worker: WorkerInstance; response: WorkerResponse };
  "registry:updated": { registry: Registry };
}
