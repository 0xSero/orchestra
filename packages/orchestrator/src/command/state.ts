import type { PluginInput } from "@opencode-ai/plugin";
import type { OrchestratorConfig, WorkerProfile } from "../types";
import { builtInProfiles } from "../config/profiles";
import { workerPool } from "../core/worker-pool";
import type { OrchestratorContext, ToolExecutionContext } from "../context/orchestrator-context";

export type ToolContext = ToolExecutionContext;

const fallbackConfig: OrchestratorConfig = {
  basePort: 14096,
  autoSpawn: false,
  startupTimeout: 30000,
  healthCheckInterval: 30000,
  profiles: builtInProfiles,
  spawn: [],
};

const defaultContext: OrchestratorContext = {
  directory: process.cwd(),
  worktree: undefined,
  projectId: undefined,
  client: undefined,
  config: fallbackConfig,
  spawnDefaults: { basePort: fallbackConfig.basePort, timeout: fallbackConfig.startupTimeout },
  profiles: fallbackConfig.profiles,
  defaultListFormat: "markdown",
  workflows: undefined,
  security: undefined,
  runtime: undefined,
  workerPool,
};

export function getOrchestratorContext(): OrchestratorContext {
  return defaultContext;
}

export function getDirectory(): string {
  return defaultContext.directory;
}

export function getWorktree(): string | undefined {
  return defaultContext.worktree;
}

export function getProjectId(): string | undefined {
  return defaultContext.projectId;
}

export function getClient(): PluginInput["client"] | undefined {
  return defaultContext.client;
}

export function getSpawnDefaults(): { basePort: number; timeout: number } {
  return defaultContext.spawnDefaults;
}

export function getProfiles(): Record<string, WorkerProfile> {
  return defaultContext.profiles;
}

export function getDefaultListFormat(): "markdown" | "json" {
  return defaultContext.defaultListFormat;
}

export function getWorkflowsConfig(): OrchestratorConfig["workflows"] | undefined {
  return defaultContext.workflows;
}

export function getSecurityConfig(): OrchestratorConfig["security"] | undefined {
  return defaultContext.security;
}

export function setDirectory(dir: string) {
  defaultContext.directory = dir;
}

export function setWorktree(next: string | undefined) {
  defaultContext.worktree = next;
}

export function setProjectId(next: string) {
  defaultContext.projectId = next;
}

export function setClient(next: PluginInput["client"]) {
  defaultContext.client = next;
}

export function setSpawnDefaults(input: { basePort: number; timeout: number }) {
  defaultContext.spawnDefaults = input;
  defaultContext.config = {
    ...defaultContext.config,
    basePort: input.basePort,
    startupTimeout: input.timeout,
  };
}

export function setProfiles(next: Record<string, WorkerProfile>) {
  defaultContext.profiles = next;
  defaultContext.config = {
    ...defaultContext.config,
    profiles: next,
  };
}

export function setUiDefaults(input: { defaultListFormat?: "markdown" | "json" }) {
  if (input.defaultListFormat) {
    defaultContext.defaultListFormat = input.defaultListFormat;
    defaultContext.config = {
      ...defaultContext.config,
      ui: { ...(defaultContext.config.ui ?? {}), defaultListFormat: input.defaultListFormat },
    };
  }
}

export function setWorkflowConfig(next: OrchestratorConfig["workflows"] | undefined) {
  defaultContext.workflows = next;
  defaultContext.config = {
    ...defaultContext.config,
    workflows: next,
  };
}

export function setSecurityConfig(next: OrchestratorConfig["security"] | undefined) {
  defaultContext.security = next;
  defaultContext.config = {
    ...defaultContext.config,
    security: next,
  };
}
