/**
 * Orchestrator tool exports
 *
 * This file is intentionally small: tool implementations live in per-area modules.
 */

import type { ToolDefinition } from "@opencode-ai/plugin";
import type { OrchestratorContext } from "../context/orchestrator-context";
import { getOrchestratorContext } from "./state";
import { createWorkerTools } from "./workers";
import { createProfileTools } from "./profiles";
import { createMemoryTools } from "./memory";
import { createMemoryAgentTools } from "../memory/tools";
import { createUxTools } from "./ux";
import { createDiagnosticsTools } from "./diagnostics";
import { createWorkflowTools } from "./workflows";

export {
  setClient,
  setDirectory,
  setProfiles,
  setProjectId,
  setSecurityConfig,
  setSpawnDefaults,
  setUiDefaults,
  setWorkflowConfig,
  setWorktree,
} from "./state";

export {
  askWorker,
  askWorkerAsync,
  awaitWorkerJob,
  delegateTask,
  ensureWorkers,
  findWorker,
  getWorkerJob,
  getWorkerInfo,
  listWorkers,
  listWorkerJobs,
  spawnNewWorker,
  stopWorkerTool,
  workerTrace,
} from "./workers";
export {
  autofillProfileModels,
  listModels,
  listProfiles,
  orchestratorConfig,
  resetProfileModels,
  setAutoSpawn,
  setOrchestratorAgent,
  setProfileModel,
} from "./profiles";
export { memoryLink, memoryPut, memoryRecentTool, memorySearchTool } from "./memory";
export {
  clearPassthroughMode,
  enableDocsPassthrough,
  macosKeybindsFix,
  orchestratorDashboard,
  orchestratorOutput,
  orchestratorDeviceRegistry,
  orchestratorDemo,
  orchestratorHelp,
  orchestratorResults,
  orchestratorStart,
  orchestratorTodoView,
  setPassthroughMode,
} from "./ux";
export { orchestratorDiagnostics } from "./diagnostics";
export { listWorkflowsTool, runWorkflowTool } from "./workflows";

function buildToolSets(context: OrchestratorContext) {
  const workerTools = createWorkerTools(context);
  const profileTools = createProfileTools(context);
  const memoryTools = createMemoryTools(context);
  const memoryAgentTools = createMemoryAgentTools(context);
  const uxTools = createUxTools(context);
  const diagnosticsTools = createDiagnosticsTools(context);
  const workflowTools = createWorkflowTools(context);

  const core: Record<string, ToolDefinition> = {
    // Core worker lifecycle + messaging
    spawn_worker: workerTools.spawnNewWorker,
    ask_worker: workerTools.askWorker,
    ask_worker_async: workerTools.askWorkerAsync,
    await_worker_job: workerTools.awaitWorkerJob,
    get_worker_job: workerTools.getWorkerJob,
    list_worker_jobs: workerTools.listWorkerJobs,
    delegate_task: workerTools.delegateTask,
    stop_worker: workerTools.stopWorkerTool,

    // Discovery
    list_profiles: profileTools.listProfiles,
    list_workers: workerTools.listWorkers,
    list_models: profileTools.listModels,
    orchestrator_status: profileTools.orchestratorConfig,
    list_workflows: workflowTools.listWorkflowsTool,
    run_workflow: workflowTools.runWorkflowTool,

    // Memory agent workflow tools
    orchestrator_memory_put: memoryAgentTools.memoryPut,
    orchestrator_memory_link: memoryAgentTools.memoryLink,
    orchestrator_memory_done: memoryAgentTools.memoryDone,

    // Observability (useful for orchestration + debugging)
    orchestrator_output: uxTools.orchestratorOutput,
    orchestrator_results: uxTools.orchestratorResults,
    orchestrator_device_registry: uxTools.orchestratorDeviceRegistry,
    orchestrator_diagnostics: diagnosticsTools.orchestratorDiagnostics,

    // Passthrough (session-scoped)
    set_passthrough: uxTools.setPassthroughMode,
    clear_passthrough: uxTools.clearPassthroughMode,
    enable_docs_passthrough: uxTools.enableDocsPassthrough,
  };

  const plugin: Record<string, ToolDefinition> = {
    // UX helpers
    orchestrator_start: uxTools.orchestratorStart,
    orchestrator_demo: uxTools.orchestratorDemo,
    orchestrator_dashboard: uxTools.orchestratorDashboard,
    orchestrator_results: uxTools.orchestratorResults,
    orchestrator_device_registry: uxTools.orchestratorDeviceRegistry,
    orchestrator_diagnostics: diagnosticsTools.orchestratorDiagnostics,
    worker_trace: workerTools.workerTrace,
    orchestrator_todo: uxTools.orchestratorTodoView,
    orchestrator_keybinds_macos: uxTools.macosKeybindsFix,
    orchestrator_help: uxTools.orchestratorHelp,
    enable_docs_passthrough: uxTools.enableDocsPassthrough,

    // Config tools (manual by design)
    set_profile_model: profileTools.setProfileModel,
    reset_profile_models: profileTools.resetProfileModels,
    set_autospawn: profileTools.setAutoSpawn,
    set_orchestrator_agent: profileTools.setOrchestratorAgent,

    // Memory tools
    memory_put: memoryTools.memoryPut,
    memory_link: memoryTools.memoryLink,
    memory_search: memoryTools.memorySearchTool,
    memory_recent: memoryTools.memoryRecentTool,

    // Extra
    get_worker_info: workerTools.getWorkerInfo,
    ensure_workers: workerTools.ensureWorkers,
    find_worker: workerTools.findWorker,
    autofill_profile_models: profileTools.autofillProfileModels,
  };

  return { core, plugin };
}

export function createCoreOrchestratorTools(context: OrchestratorContext): Record<string, ToolDefinition> {
  return buildToolSets(context).core;
}

export function createPluginTools(context: OrchestratorContext): Record<string, ToolDefinition> {
  return buildToolSets(context).plugin;
}

export function createOrchestratorTools(context: OrchestratorContext): Record<string, ToolDefinition> {
  const { core, plugin } = buildToolSets(context);
  return { ...core, ...plugin };
}

export function createAdvancedTools(context: OrchestratorContext): Record<string, ToolDefinition> {
  return createOrchestratorTools(context);
}

const defaultSets = buildToolSets(getOrchestratorContext());

/**
 * Core tools exported for the plugin (minimal set for orchestration + workflows)
 */
export const coreOrchestratorTools: Record<string, ToolDefinition> = defaultSets.core;

export const pluginTools: Record<string, ToolDefinition> = defaultSets.plugin;

export const orchestratorTools: Record<string, ToolDefinition> = {
  ...coreOrchestratorTools,
  ...pluginTools,
};

/**
 * Advanced/internal tools (not exported to LLM by default, but available for power users)
 * These can be accessed programmatically if needed.
 */
export const advancedTools: Record<string, ToolDefinition> = {
  // Back-compat alias; everything is now exported in `orchestratorTools`.
  ...orchestratorTools,
};
