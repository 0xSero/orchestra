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
  "- Use orchestrator_memory_put to store entries (use the payload scope/projectId).",
  "- Link related entries with orchestrator_memory_link when helpful.",
  "- Avoid secrets, tokens, or raw .env content.",
  "- When finished, call orchestrator_memory_done({ taskId, summary, storedKeys, linkedKeys, notes }).",
  "- If nothing should be stored, call orchestrator_memory_done with summary: \"no-op\".",
].join("\n");

export function buildMemoryWorkflow(): WorkflowDefinition {
  return {
    id: MEMORY_WORKFLOW_ID,
    name: "Memory Capture",
    description: "Summarize a turn and persist durable knowledge via the memory tools.",
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
