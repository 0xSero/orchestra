import type { WorkflowDefinition } from "../types";

export const MEMORY_WORKFLOW_ID = "memory";

const defaultPrompt = [
  "You are the memory subagent. You will receive a JSON payload describing the latest turn.",
  "",
  "Task payload (JSON):",
  "{task}",
  "",
  "Instructions:",
  "- Extract durable facts, decisions, TODOs, and entities worth remembering.",
  '- Use task_start({ kind: "op", op: "memory.put", task: "memory.put", ... }) to store entries (use the payload scope/projectId), then task_await.',
  '- Use task_start({ kind: "op", op: "memory.link", task: "memory.link", ... }) to link related entries, then task_await.',
  "- Avoid secrets, tokens, or raw .env content.",
  '- When finished, call task_start({ kind: "op", op: "memory.done", task: "memory.done", ... }) with { taskId, summary, storedKeys, linkedKeys, notes }, then task_await.',
  '- If nothing should be stored, call memory.done with summary: "no-op".',
].join("\n");

export function buildMemoryWorkflow(): WorkflowDefinition {
  return {
    id: MEMORY_WORKFLOW_ID,
    name: "Memory Capture",
    description:
      "Summarize a turn and persist durable knowledge via task_start memory ops.",
    steps: [
      {
        id: "record",
        title: "Record Memory",
        workerId: "memory",
        prompt: defaultPrompt,
        carry: false,
      },
    ],
  };
}
