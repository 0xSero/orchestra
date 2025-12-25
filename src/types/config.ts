import type { WorkerProfile } from "./worker";
import type { WorkflowsConfig, SecurityConfig } from "./workflow";
import type { MemoryConfig } from "./memory";
import type { IntegrationsConfig, TelemetryConfig } from "./integrations";

export type SpawnPolicy = {
  /** Allow auto-spawn at orchestrator startup */
  autoSpawn?: boolean;
  /** Allow on-demand spawns (vision routing, delegate_task, etc.) */
  onDemand?: boolean;
  /** Allow manual spawns via tools */
  allowManual?: boolean;
  /** Allow warm pool pre-spawns */
  warmPool?: boolean;
  /** Deprecated: device registry reuse was removed; this flag is ignored. */
  reuseExisting?: boolean;
};

export type SpawnPolicyConfig = {
  /** Default policy applied to any profile without an override */
  default?: SpawnPolicy;
  /** Per-profile policy overrides */
  profiles?: Record<string, SpawnPolicy>;
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
  /** Worker IDs allowed to auto-spawn on demand */
  spawnOnDemand?: string[];
  /** Per-profile spawn policy overrides */
  spawnPolicy?: SpawnPolicyConfig;
  /** Timeout for worker startup (ms) */
  startupTimeout: number;
  /** Health check interval (ms) */
  healthCheckInterval: number;
  /** Health check settings */
  healthCheck?: {
    enabled?: boolean;
    intervalMs?: number;
    timeoutMs?: number;
    maxRetries?: number;
  };
  /** Warm pool pre-spawn settings */
  warmPool?: {
    enabled?: boolean;
    profiles?: Record<string, { size?: number; idleTimeoutMs?: number }>;
  };
  /** Model selection preferences */
  modelSelection?: {
    mode?: "performance" | "balanced" | "economical";
    maxCostPer1kTokens?: number;
    preferredProviders?: string[];
  };
  /** Model alias table */
  modelAliases?: Record<string, string>;
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
  /** External integration settings */
  integrations?: IntegrationsConfig;
  /** Telemetry settings (PostHog) */
  telemetry?: TelemetryConfig;
}

export type OrchestratorConfigFile = {
  $schema?: string;
  basePort?: number;
  autoSpawn?: boolean;
  spawnOnDemand?: string[];
  spawnPolicy?: SpawnPolicyConfig;
  startupTimeout?: number;
  healthCheckInterval?: number;
  healthCheck?: OrchestratorConfig["healthCheck"];
  warmPool?: OrchestratorConfig["warmPool"];
  modelSelection?: OrchestratorConfig["modelSelection"];
  modelAliases?: OrchestratorConfig["modelAliases"];
  ui?: OrchestratorConfig["ui"];
  notifications?: OrchestratorConfig["notifications"];
  agent?: OrchestratorConfig["agent"];
  commands?: OrchestratorConfig["commands"];
  pruning?: OrchestratorConfig["pruning"];
  workflows?: OrchestratorConfig["workflows"];
  security?: OrchestratorConfig["security"];
  memory?: OrchestratorConfig["memory"];
  integrations?: OrchestratorConfig["integrations"];
  telemetry?: OrchestratorConfig["telemetry"];
  /** Profiles available to spawn (overrides/custom). Strings reference built-ins. */
  profiles?: Array<string | WorkerProfile>;
  /** Profiles to auto-spawn. Strings reference profiles by id. */
  workers?: Array<string | WorkerProfile>;
};
