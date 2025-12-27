import type { OrchestratorService } from "../orchestrator";
import type { Factory, OrchestratorConfig, ServiceLifecycle } from "../types";
import type { WorkerManager } from "../workers";
import type { WorkflowEngine } from "../workflows/factory";
import { createSystemTransform, createToolGuard } from "./hooks";
import { createWorkerTools } from "./worker-tools";
import { createWorkflowTools } from "./workflow-tools";

export type ToolsConfig = OrchestratorConfig;

export type ToolsDeps = {
  orchestrator: OrchestratorService;
  workers: WorkerManager;
  workflows?: WorkflowEngine;
};

export type ToolsService = ServiceLifecycle & {
  tool: Record<string, any>;
  guard: ReturnType<typeof createToolGuard>;
  systemTransform: ReturnType<typeof createSystemTransform>;
  compaction: ReturnType<typeof createSystemTransform>;
};

export const createTools: Factory<ToolsConfig, ToolsDeps, ToolsService> = ({ config, deps }) => {
  const workerTools = createWorkerTools({ orchestrator: deps.orchestrator, workers: deps.workers });
  const workflowTools = createWorkflowTools({ orchestrator: deps.orchestrator, workflows: deps.workflows });

  const tool = {
    ...workerTools,
    ...workflowTools,
  };

  return {
    tool,
    guard: createToolGuard(config),
    systemTransform: createSystemTransform(config, deps.workers),
    compaction: createSystemTransform(config, deps.workers),
    start: async () => {},
    stop: async () => {},
    health: async () => ({ ok: true }),
  };
};
