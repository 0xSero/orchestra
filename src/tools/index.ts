/**
 * Orchestrator tool exports
 *
 * This file is intentionally small: tool implementations live in per-area modules.
 */

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
} from "./tools-workers";
export {
  autofillProfileModels,
  listModels,
  listProfiles,
  orchestratorConfig,
  resetProfileModels,
  setAutoSpawn,
  setOrchestratorAgent,
  setProfileModel,
} from "./tools-profiles";
export { memoryLink, memoryPut, memoryRecentTool, memorySearchTool } from "./tools-memory";
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
} from "./tools-ux";
export { orchestratorDiagnostics } from "./tools-diagnostics";
export { listWorkflowsTool, runWorkflowTool } from "./tools-workflows";

import {
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
} from "./tools-workers";
import {
  autofillProfileModels,
  listModels,
  listProfiles,
  orchestratorConfig,
  resetProfileModels,
  setAutoSpawn,
  setOrchestratorAgent,
  setProfileModel,
} from "./tools-profiles";
import { memoryLink, memoryPut, memoryRecentTool, memorySearchTool } from "./tools-memory";
import {
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
} from "./tools-ux";
import { orchestratorDiagnostics } from "./tools-diagnostics";
import { listWorkflowsTool, runWorkflowTool } from "./tools-workflows";

/**
 * Core tools exported for the plugin (simplified from 27 to 8 essential tools)
 */
export const coreOrchestratorTools = {
  // Core worker lifecycle + messaging
  spawn_worker: spawnNewWorker,
  ask_worker: askWorker,
  ask_worker_async: askWorkerAsync,
  await_worker_job: awaitWorkerJob,
  get_worker_job: getWorkerJob,
  list_worker_jobs: listWorkerJobs,
  delegate_task: delegateTask,
  stop_worker: stopWorkerTool,

  // Discovery
  list_profiles: listProfiles,
  list_workers: listWorkers,
  list_models: listModels,
  orchestrator_status: orchestratorConfig,
  list_workflows: listWorkflowsTool,
  run_workflow: runWorkflowTool,

  // Observability (useful for orchestration + debugging)
  orchestrator_output: orchestratorOutput,
  orchestrator_results: orchestratorResults,
  orchestrator_device_registry: orchestratorDeviceRegistry,
  orchestrator_diagnostics: orchestratorDiagnostics,

  // Passthrough (session-scoped)
  set_passthrough: setPassthroughMode,
  clear_passthrough: clearPassthroughMode,
  enable_docs_passthrough: enableDocsPassthrough,
};

export const pluginTools = {
  // UX helpers
  orchestrator_start: orchestratorStart,
  orchestrator_demo: orchestratorDemo,
  orchestrator_dashboard: orchestratorDashboard,
  orchestrator_results: orchestratorResults,
  orchestrator_device_registry: orchestratorDeviceRegistry,
  orchestrator_diagnostics: orchestratorDiagnostics,
  worker_trace: workerTrace,
  orchestrator_todo: orchestratorTodoView,
  orchestrator_keybinds_macos: macosKeybindsFix,
  orchestrator_help: orchestratorHelp,
  enable_docs_passthrough: enableDocsPassthrough,

  // Config tools (manual by design)
  set_profile_model: setProfileModel,
  reset_profile_models: resetProfileModels,
  set_autospawn: setAutoSpawn,
  set_orchestrator_agent: setOrchestratorAgent,

  // Memory tools
  memory_put: memoryPut,
  memory_link: memoryLink,
  memory_search: memorySearchTool,
  memory_recent: memoryRecentTool,

  // Extra
  get_worker_info: getWorkerInfo,
  ensure_workers: ensureWorkers,
  find_worker: findWorker,
  autofill_profile_models: autofillProfileModels,
  
};

export const orchestratorTools = {
  ...coreOrchestratorTools,
  ...pluginTools,
};

/**
 * Advanced/internal tools (not exported to LLM by default, but available for power users)
 * These can be accessed programmatically if needed.
 */
export const advancedTools = {
  // Back-compat alias; everything is now exported in `orchestratorTools`.
  ...orchestratorTools,
};
