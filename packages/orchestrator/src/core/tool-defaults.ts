export const DEFAULT_ORCHESTRATOR_TOOL_ALLOWLIST = [
  "task_start",
  "task_await",
  "task_peek",
  "task_list",
  "task_cancel",
] as const;

export const DEFAULT_ORCHESTRATOR_AGENT_TOOL_FLAGS = {
  bash: false,
  edit: false,
  skill: false,
  webfetch: false,
} as const;

export function buildDefaultOrchestratorPluginToolOverrides(
  toolIds: Iterable<string>,
): Record<string, boolean> {
  const allowlist = new Set<string>(DEFAULT_ORCHESTRATOR_TOOL_ALLOWLIST);
  const overrides: Record<string, boolean> = {};
  for (const id of toolIds) {
    overrides[id] = allowlist.has(id);
  }
  return overrides;
}
