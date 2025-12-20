import type { PluginInput } from "@opencode-ai/plugin";
import type { OrchestratorConfig, WorkerProfile } from "../types";
import { WorkerRegistry } from "./registry";
import { builtInWorkflows, createWorkflowEngine, type WorkflowEngine } from "../workflows";

export type OrchestratorSpawnDefaults = {
  basePort: number;
  timeout: number;
};

export type OrchestratorUiDefaults = {
  defaultListFormat: "markdown" | "json";
};

export type OrchestratorRuntime = {
  directory: string;
  worktree?: string;
  projectId?: string;
  client: PluginInput["client"];
  config: OrchestratorConfig;
  registry: WorkerRegistry;
  profiles: Record<string, WorkerProfile>;
  spawnDefaults: OrchestratorSpawnDefaults;
  uiDefaults: OrchestratorUiDefaults;
  showToast: (message: string, variant: "success" | "info" | "warning" | "error") => Promise<void>;
  workflows: WorkflowEngine;
};

export function createOrchestratorRuntime(input: {
  directory: string;
  worktree?: string;
  projectId?: string;
  client: PluginInput["client"];
  config: OrchestratorConfig;
}): OrchestratorRuntime {
  const registry = new WorkerRegistry();
  const uiDefaults: OrchestratorUiDefaults = {
    defaultListFormat: input.config.ui?.defaultListFormat ?? "markdown",
  };

  const showToast = async (message: string, variant: "success" | "info" | "warning" | "error") => {
    if (input.config.ui?.toasts === false) return;
    await input.client.tui.showToast({ body: { message, variant } }).catch(() => {});
  };

  const runtime = {
    directory: input.directory,
    worktree: input.worktree,
    projectId: input.projectId,
    client: input.client,
    config: input.config,
    registry,
    profiles: input.config.profiles,
    spawnDefaults: { basePort: input.config.basePort, timeout: input.config.startupTimeout },
    uiDefaults,
    showToast,
  } as Omit<OrchestratorRuntime, "workflows"> as OrchestratorRuntime;

  runtime.workflows = createWorkflowEngine(runtime, builtInWorkflows);
  return runtime;
}

