import type { OrchestratorConfigFile } from "../../types";

export function buildDefaultOrchestratorConfigFile(): OrchestratorConfigFile {
  return {
    basePort: 14096,
    autoSpawn: false, // Workers spawn on-demand, not automatically
    spawnOnDemand: ["vision"],
    spawnPolicy: {
      default: {
        autoSpawn: false, // Don't auto-spawn on plugin init
        onDemand: true, // Allow on-demand spawning via tools
        allowManual: true,
        warmPool: false, // Don't pre-warm workers
        reuseExisting: true,
      },
      profiles: {},
    },
    startupTimeout: 30000,
    healthCheckInterval: 30000,
    healthCheck: {
      enabled: true,
      intervalMs: 30000,
      timeoutMs: 3000,
      maxRetries: 3,
    },
    warmPool: {
      enabled: false,
      profiles: {},
    },
    modelSelection: {
      mode: "performance",
    },
    modelAliases: {},
    ui: {
      toasts: true,
      injectSystemContext: true,
      systemContextMaxWorkers: 12,
      defaultListFormat: "markdown",
      debug: false,
      logToConsole: false,
      firstRunDemo: true,
    },
    notifications: {
      idle: { enabled: false, title: "OpenCode", message: "Session is idle", delayMs: 1500 },
    },
    agent: {
      enabled: true,
      name: "orchestrator",
      mode: "primary",
      applyToBuild: false,
    },
    commands: { enabled: true, prefix: "orchestrator." },
    pruning: {
      enabled: false,
      maxToolOutputChars: 12000,
      maxToolInputChars: 4000,
      protectedTools: ["task", "todowrite", "todoread"],
    },
    workflows: {
      enabled: true,
      roocodeBoomerang: {
        enabled: true,
        maxSteps: 4,
        maxTaskChars: 12000,
        maxCarryChars: 24000,
        perStepTimeoutMs: 120_000,
      },
    },
    security: {
      workflows: {
        maxSteps: 4,
        maxTaskChars: 12000,
        maxCarryChars: 24000,
        perStepTimeoutMs: 120_000,
      },
    },
    memory: {
      enabled: true,
      autoSpawn: true,
      autoRecord: true,
      autoInject: true,
      scope: "project",
      maxChars: 2000,
      summaries: {
        enabled: true,
        sessionMaxChars: 2000,
        projectMaxChars: 2000,
      },
      trim: {
        maxMessagesPerSession: 60,
        maxMessagesPerProject: 400,
        maxMessagesGlobal: 2000,
        maxProjectsGlobal: 25,
      },
      inject: {
        maxChars: 2000,
        maxEntries: 8,
        includeMessages: false,
        includeSessionSummary: true,
        includeProjectSummary: true,
        includeGlobal: true,
        maxGlobalEntries: 3,
      },
    },
    integrations: {
      linear: { enabled: true },
      neo4j: { enabled: false },
      monitoring: { enabled: false },
    },
    telemetry: {
      enabled: false,
    },
    profiles: [
      {
        id: "glm47-vision-demo",
        name: "GLM-4.7 Vision Demo",
        model: "zhipu/glm-4.7v",
        purpose: "Multimodal onboarding demo (vision + workflow).",
        whenToUse: "Use for the onboarding multimodal demo flow.",
        supportsVision: true,
        enabled: true,
      },
    ],
    workers: [], // No auto-spawn - orchestrator decides when to spawn workers
  };
}
