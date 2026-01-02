/**
 * Orchestrator tool exports
 *
 * This file is intentionally small: tool implementations live in per-area modules.
 */

import type { ToolDefinition } from "@opencode-ai/plugin";
import type { OrchestratorContext } from "../context/orchestrator-context";
import { getOrchestratorContext } from "./state";
import { createTaskTools } from "./tasks";

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

export { taskAwait, taskCancel, taskList, taskPeek, taskStart } from "./tasks";

function buildToolSets(context: OrchestratorContext) {
  const taskTools = createTaskTools(context);

  const core: Record<string, ToolDefinition> = {
    // Async Task API (only registered tools)
    task_start: taskTools.taskStart,
    task_await: taskTools.taskAwait,
    task_peek: taskTools.taskPeek,
    task_list: taskTools.taskList,
    task_cancel: taskTools.taskCancel,
  };

  const plugin: Record<string, ToolDefinition> = {};

  return { core, plugin };
}

export function createCoreOrchestratorTools(
  context: OrchestratorContext,
): Record<string, ToolDefinition> {
  return buildToolSets(context).core;
}

export function createPluginTools(
  context: OrchestratorContext,
): Record<string, ToolDefinition> {
  return buildToolSets(context).plugin;
}

export function createOrchestratorTools(
  context: OrchestratorContext,
): Record<string, ToolDefinition> {
  const { core, plugin } = buildToolSets(context);
  return { ...core, ...plugin };
}

export function createAdvancedTools(
  context: OrchestratorContext,
): Record<string, ToolDefinition> {
  return createOrchestratorTools(context);
}

const defaultSets = buildToolSets(getOrchestratorContext());

/**
 * Core tools exported for the plugin (Task API only)
 */
export const coreOrchestratorTools: Record<string, ToolDefinition> =
  defaultSets.core;

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
