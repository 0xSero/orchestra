import { workerJobs } from "./jobs";

const DEFAULT_PENDING_TASK_LIMIT = 5;

export function buildPendingTaskReminder(
  sessionId: string | undefined,
  options?: { limit?: number },
): string | undefined {
  if (!sessionId) return undefined;
  const pending = workerJobs.list({
    sessionId,
    status: "running",
    limit: options?.limit ?? DEFAULT_PENDING_TASK_LIMIT,
  });
  if (pending.length === 0) return undefined;

  const ids = pending.map((job) => job.id);
  const awaitLine =
    ids.length === 1
      ? `task_await({ taskId: "${ids[0]}" })`
      : `task_await({ taskIds: [${ids.map((id) => `"${id}"`).join(", ")}] })`;

  const summary = pending
    .map((job) => `- ${job.id} (${job.workerId})`)
    .join("\n");

  return [
    "**[ORCHESTRATOR GUARDRAIL]** Pending tasks are still running for this session.",
    "Await them before answering:",
    "```",
    awaitLine,
    "```",
    "Pending tasks:",
    summary,
  ].join("\n");
}

const legacyToolPattern =
  /\b(run_workflow|list_workflows|continue_workflow|ask_worker_async|ask_worker|await_worker_job|get_worker_job|list_worker_jobs|spawn_worker|delegate_task|list_workers|list_profiles|list_models|orchestrator_output|orchestrator_results|orchestrator_status)\s*\(/i;
const legacyToolMentionPattern =
  /\b(run_workflow|list_workflows|continue_workflow|ask_worker_async|ask_worker|await_worker_job|get_worker_job|list_worker_jobs|spawn_worker|delegate_task|list_workers|list_profiles|list_models|orchestrator_output|orchestrator_results|orchestrator_status)\b/i;
const deniedToolPattern =
  /\b(unknown tool|tool not found|not allowed|permission denied|access denied)\b/i;

export function needsLegacyToolCorrection(text: string | undefined): boolean {
  if (!text) return false;
  if (text.includes("[ORCHESTRATOR GUARDRAIL]")) return false;
  return (
    legacyToolPattern.test(text) ||
    legacyToolMentionPattern.test(text) ||
    deniedToolPattern.test(text)
  );
}

export function buildLegacyToolCorrectionHint(): string {
  return [
    "**[ORCHESTRATOR GUARDRAIL]** A non-default tool path was detected.",
    "Use the Task API instead:",
    "```",
    'task_start({ kind: "worker" | "workflow" | "auto", task: "..." })',
    'task_await({ taskId: "<taskId>" })',
    "```",
    "Use task_list if you need to recover a task id.",
  ].join("\n");
}
