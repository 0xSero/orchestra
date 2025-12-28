import type { ToolDefinition } from "@opencode-ai/plugin";
import { getIntegrationTools } from "../integrations/registry";
import type { OrchestratorService } from "../orchestrator";
import type { Factory, OrchestratorConfig, ServiceLifecycle } from "../types";
import type { WorkerManager } from "../workers";
import type { WorkflowEngine } from "../workflows/factory";
import { createCompactionTransform, createSystemTransform, createToolGuard } from "./hooks";
import { createWorkerTools } from "./worker-tools";
import { createWorkflowTools } from "./workflow-tools";

export type ToolsConfig = OrchestratorConfig;

export type ToolsDeps = {
  orchestrator: OrchestratorService;
  workers: WorkerManager;
  workflows?: WorkflowEngine;
};

export type ToolsService = ServiceLifecycle & {
  /** All orchestrator tools (full access) */
  tool: Record<string, ToolDefinition>;
  /** Worker tools (limited, no orchestration) */
  workerTool: Record<string, ToolDefinition>;
  /** Agent tools (workers with skillPermissions: "inherit" can delegate to other workers) */
  agentTool: Record<string, ToolDefinition>;
  guard: ReturnType<typeof createToolGuard>;
  systemTransform: ReturnType<typeof createSystemTransform>;
  compaction: ReturnType<typeof createCompactionTransform>;
};

export const createTools: Factory<ToolsConfig, ToolsDeps, ToolsService> = ({ config, deps }) => {
  const workerTools = createWorkerTools({ orchestrator: deps.orchestrator, workers: deps.workers });
  const workflowTools = createWorkflowTools({ orchestrator: deps.orchestrator, workflows: deps.workflows });
  const integrationTools = getIntegrationTools(config.integrations);

  // Orchestrator gets all tools (including Linear write tools)
  const tool = {
    ...workerTools,
    ...workflowTools,
    ...integrationTools.orchestrator,
  };

  // Workers get limited tools (Linear read only)
  const workerTool = {
    ...integrationTools.workers,
  };

  // Agent tools - for workers with skillPermissions: "inherit"
  // These can delegate to other workers but don't have full orchestrator access
  const agentTool = {
    ask_worker: workerTools.ask_worker,
    ask_worker_async: workerTools.ask_worker_async,
    await_worker_job: workerTools.await_worker_job,
    delegate_task: workerTools.delegate_task,
    list_workers: workerTools.list_workers,
    list_profiles: workerTools.list_profiles,
    ...integrationTools.workers,
  };

  return {
    tool,
    workerTool,
    agentTool,
    guard: createToolGuard(config),
    systemTransform: createSystemTransform(config, deps.workers),
    compaction: createCompactionTransform(config, deps.workers),
    start: async () => {},
    stop: async () => {},
    health: async () => ({ ok: true }),
  };
};
