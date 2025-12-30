import type { PluginInput } from "@opencode-ai/plugin";
import type { OrchestratorConfig, WorkerProfile } from "../types";
import type { OrchestratorRuntime } from "../core/runtime";
import { workerPool } from "../core/worker-pool";

export type ToolExecutionContext = {
  agent?: string;
  sessionID?: string;
  messageID?: string;
};

export type OrchestratorContext = {
  directory: string;
  worktree?: string;
  projectId?: string;
  client?: PluginInput["client"];
  /** Snapshot of the orchestrator config used to build this context. */
  config: OrchestratorConfig;
  spawnDefaults: { basePort: number; timeout: number };
  profiles: Record<string, WorkerProfile>;
  defaultListFormat: "markdown" | "json";
  workflows?: OrchestratorConfig["workflows"];
  security?: OrchestratorConfig["security"];
  runtime?: OrchestratorRuntime;
  workerPool: typeof workerPool;
};

export function createOrchestratorContext(input: {
  directory: string;
  worktree?: string;
  projectId?: string;
  client?: PluginInput["client"];
  config: OrchestratorConfig;
  runtime?: OrchestratorRuntime;
}): OrchestratorContext {
  const { config } = input;
  return {
    directory: input.directory,
    worktree: input.worktree,
    projectId: input.projectId,
    client: input.client,
    config,
    spawnDefaults: { basePort: config.basePort, timeout: config.startupTimeout },
    profiles: config.profiles,
    defaultListFormat: config.ui?.defaultListFormat ?? "markdown",
    workflows: config.workflows,
    security: config.security,
    runtime: input.runtime,
    workerPool,
  };
}
