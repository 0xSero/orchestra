/**
 * Type definitions for the Orchestrator plugin
 */

export type WorkerStatus = "starting" | "ready" | "busy" | "error" | "stopped";

export interface WorkerProfile {
  /** Unique identifier for this worker */
  id: string;
  /** Human-readable name */
  name: string;
  /** Model to use (e.g., "openrouter/meta-llama/llama-3.2-11b-vision-instruct", "anthropic/claude-sonnet-4") */
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

export type WorkflowSecurityConfig = {
  /** Maximum steps allowed in a workflow */
  maxSteps?: number;
  /** Maximum characters allowed in the initial task */
  maxTaskChars?: number;
  /** Maximum characters allowed to carry between steps */
  maxCarryChars?: number;
  /** Timeout per step (ms) */
  perStepTimeoutMs?: number;
};

export type WorkflowStepConfig = {
  id: string;
  title?: string;
  workerId?: string;
  prompt?: string;
  carry?: boolean;
};

export type WorkflowsConfig = {
  enabled?: boolean;
  roocodeBoomerang?: {
    enabled?: boolean;
    steps?: WorkflowStepConfig[];
    maxSteps?: number;
    maxTaskChars?: number;
    maxCarryChars?: number;
    perStepTimeoutMs?: number;
  };
};

export type SecurityConfig = {
  workflows?: WorkflowSecurityConfig;
};

export type MemoryConfig = {
  enabled?: boolean;
  autoSpawn?: boolean;
  autoRecord?: boolean;
  scope?: "project" | "global";
  maxChars?: number;
};

export type TelemetryConfig = {
  enabled?: boolean;
  /** PostHog API key (or set POSTHOG_API_KEY env var) */
  apiKey?: string;
  /** PostHog host (default: https://us.i.posthog.com) */
  host?: string;
};

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
    /** Enable debug logging for orchestrator internals */
    debug?: boolean;
    /** Allow logs to print to console (default: false) */
    logToConsole?: boolean;
    /**
     * First-run demo behavior (no config file detected):
     * - true: auto-run `orchestrator.demo` once per machine/user
     * - false: only show a toast tip
     */
    firstRunDemo?: boolean;
    /**
     * Inject a prompt into the orchestrator session when workers send wakeups.
     * This allows async workers to actually "wake up" the orchestrator instead of
     * just storing events to poll.
     * Default: true
     */
    wakeupInjection?: boolean;
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
    /** If true, also override the built-in `build` agent model */
    applyToBuild?: boolean;
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
  /** Workflow configuration */
  workflows?: WorkflowsConfig;
  /** Security limits */
  security?: SecurityConfig;
  /** Memory graph settings */
  memory?: MemoryConfig;
  /** Telemetry settings (PostHog) */
  telemetry?: TelemetryConfig;
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
  memory?: OrchestratorConfig["memory"];
  telemetry?: OrchestratorConfig["telemetry"];
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

/** Payload sent by workers to wake up the orchestrator */
export interface WakeupPayload {
  /** Worker ID that triggered the wakeup */
  workerId: string;
  /** Optional job ID if related to an async job */
  jobId?: string;
  /** Reason for the wakeup */
  reason: "result_ready" | "needs_attention" | "error" | "progress" | "custom";
  /** Optional summary or message */
  summary?: string;
  /** Optional structured data */
  data?: Record<string, unknown>;
  /** Timestamp when the wakeup was triggered */
  timestamp: number;
}

export interface OrchestratorEvents {
  "worker:spawned": { worker: WorkerInstance };
  "worker:ready": { worker: WorkerInstance };
  "worker:busy": { worker: WorkerInstance };
  "worker:error": { worker: WorkerInstance; error: string };
  "worker:stopped": { worker: WorkerInstance };
  "worker:response": { worker: WorkerInstance; response: WorkerResponse };
  "worker:wakeup": { payload: WakeupPayload };
  "registry:updated": { registry: Registry };
}
