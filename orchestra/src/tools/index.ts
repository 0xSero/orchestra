import type { ToolDefinition } from "@opencode-ai/plugin";
import type { OrchestratorService } from "../orchestrator";
import type { Factory, OrchestratorConfig, ServiceLifecycle } from "../types";
import type { WorkerManager } from "../workers";
import type { WorkflowEngine } from "../workflows/factory";
import { createCompactionTransform, createSystemTransform, createToolGuard } from "./hooks";
import { createLinearTools } from "./linear-tools";
import { createWorkerTools } from "./worker-tools";
import { createWorkflowTools } from "./workflow-tools";

export type ToolsConfig = OrchestratorConfig;

export type ToolsDeps = {
  orchestrator: OrchestratorService;
  workers: WorkerManager;
  workflows?: WorkflowEngine;
};

export type ToolsService = ServiceLifecycle & {
  tool: Record<string, ToolDefinition>;
  workerTool: Record<string, ToolDefinition>;
  guard: ReturnType<typeof createToolGuard>;
  systemTransform: ReturnType<typeof createSystemTransform>;
  compaction: ReturnType<typeof createCompactionTransform>;
};

export const createTools: Factory<ToolsConfig, ToolsDeps, ToolsService> = ({ config, deps }) => {
  const workerTools = createWorkerTools({ orchestrator: deps.orchestrator, workers: deps.workers });
  const workflowTools = createWorkflowTools({ orchestrator: deps.orchestrator, workflows: deps.workflows });
  const linearTools = createLinearTools({ config: config.integrations?.linear });

  // Orchestrator gets all tools (including Linear write tools)
  const tool = {
    ...workerTools,
    ...workflowTools,
    ...linearTools.orchestrator,
  };

  // Workers get limited tools (Linear read only)
  const workerTool = {
    ...linearTools.workers,
  };

  return {
    tool,
    workerTool,
    guard: createToolGuard(config),
    systemTransform: createSystemTransform(config, deps.workers),
    compaction: createCompactionTransform(config, deps.workers),
    start: async () => {},
    stop: async () => {},
    health: async () => ({ ok: true }),
  };
};
