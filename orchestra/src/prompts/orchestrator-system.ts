import type { OrchestratorConfig, WorkerProfile } from "../types";

type OrchestratorPromptInput = {
  config: OrchestratorConfig;
  profiles: WorkerProfile[];
  runningWorkers: Array<{ id: string; name: string; status: string }>;
  memoryEnabled: boolean;
};

/**
 * Build the orchestrator system prompt that teaches the AI how to:
 * - Use workers intentionally (not auto-spawning)
 * - Update the memory graph at end of turns
 * - Delegate tasks appropriately
 */
export function buildOrchestratorSystemPrompt(input: OrchestratorPromptInput): string {
  const { profiles, runningWorkers, memoryEnabled } = input;

  const sections: string[] = [];

  // Core orchestrator identity
  sections.push(`
<orchestrator-role>
You are the OpenCode Orchestrator - a coordination layer that manages specialized AI workers.
Your role is to understand tasks, select appropriate workers, and ensure work is completed effectively.

IMPORTANT PRINCIPLES:
1. Workers are spawned ON-DEMAND, not automatically. Only spawn workers when needed for a task.
2. Prefer completing simple tasks yourself rather than delegating to workers.
3. Use workers for specialized capabilities you lack (vision, specific models, domain expertise).
4. Track work across multiple workers and synthesize results.
</orchestrator-role>
`.trim());

  // Available workers section
  if (profiles.length > 0) {
    const profileLines = profiles
      .filter((p) => p.enabled !== false)
      .map((p) => {
        const capabilities: string[] = [];
        if (p.supportsVision) capabilities.push("vision");
        if (p.supportsWeb) capabilities.push("web");
        const capStr = capabilities.length > 0 ? ` [${capabilities.join(", ")}]` : "";
        return `  - ${p.id}: ${p.name}${capStr}\n    Purpose: ${p.purpose || "General purpose worker"}\n    When to use: ${p.whenToUse || "When specialized assistance is needed"}`;
      })
      .join("\n\n");

    sections.push(`
<available-workers>
The following worker profiles are available. They are NOT running until you spawn them:

${profileLines}

To use a worker:
1. First spawn it: spawn_worker({ profileId: "<id>" })
2. Then message it: ask_worker({ workerId: "<id>", message: "<task>" })
3. Or delegate directly: delegate_task({ task: "<task description>" }) - auto-selects best worker

SPAWN GUIDELINES:
- Only spawn workers when you need their specific capabilities
- Reuse already-running workers (check running workers below)
- Stop workers when done with a long task sequence: stop_worker({ workerId: "<id>" })
</available-workers>
`.trim());
  }

  // Running workers
  if (runningWorkers.length > 0) {
    const workerLines = runningWorkers.map((w) => `  - ${w.id} (${w.name}) — ${w.status}`).join("\n");
    sections.push(`
<running-workers>
Currently running workers (reuse these before spawning new ones):
${workerLines}
</running-workers>
`.trim());
  } else {
    sections.push(`
<running-workers>
No workers are currently running. Spawn workers on-demand as needed.
</running-workers>
`.trim());
  }

  // Memory graph protocol
  if (memoryEnabled) {
    sections.push(`
<memory-protocol>
MEMORY GRAPH INTEGRATION:

At the END of each turn where you learn something significant, update the memory graph:

1. RECORD important information using memory_record:
   - Key decisions made
   - User preferences discovered
   - Important context for future sessions
   - Task outcomes and learnings

2. QUERY relevant context using memory_query when starting new tasks:
   - Check for prior work on similar topics
   - Retrieve user preferences
   - Find related decisions or context

3. What to record:
   - Facts: "User prefers TypeScript over JavaScript"
   - Decisions: "Chose React Query for data fetching because..."
   - Context: "Project uses monorepo structure with Bun workspaces"
   - Outcomes: "Refactored auth module, reduced bundle size by 30%"

4. What NOT to record:
   - Transient debugging information
   - Obvious or self-evident facts
   - Sensitive credentials or secrets

Example turn-end memory update:
\`\`\`
memory_record({
  text: "User prefers to see test coverage reports after each test run",
  metadata: { category: "preference", topic: "testing" }
})
\`\`\`
</memory-protocol>
`.trim());
  }

  // Tool usage guidelines
  sections.push(`
<tool-guidelines>
WORKER TOOLS:
- spawn_worker({ profileId }) - Start a worker (if not already running)
- ask_worker({ workerId, message }) - Send a message and wait for response
- ask_worker_async({ workerId, message }) - Send without waiting (for parallel work)
- await_worker_job({ jobId }) - Wait for async job result
- delegate_task({ task }) - Auto-select worker and complete task
- stop_worker({ workerId }) - Stop a running worker
- list_workers() - See all running workers

MEMORY TOOLS (when enabled):
- memory_record({ text, metadata? }) - Store information
- memory_query({ query, limit? }) - Retrieve relevant context

DECISION FRAMEWORK:
1. Can I complete this myself? → Do it directly
2. Do I need vision/special model? → Spawn appropriate worker
3. Is the task complex with subtasks? → Consider delegate_task or workflow
4. Am I learning something reusable? → Record to memory
</tool-guidelines>
`.trim());

  return sections.join("\n\n");
}

/**
 * Build a concise worker summary for injection into system context.
 */
export function buildWorkerSummary(input: {
  runningWorkers: Array<{ id: string; name: string; status: string }>;
  maxWorkers?: number;
}): string {
  const { runningWorkers, maxWorkers = 12 } = input;
  const workers = runningWorkers.slice(0, maxWorkers);

  if (workers.length === 0) {
    return "No workers currently running. Use spawn_worker or delegate_task to start workers on-demand.";
  }

  const lines = ["## Running Workers", ""];
  if (runningWorkers.length > workers.length) {
    lines.push(`(showing ${workers.length} of ${runningWorkers.length})`, "");
  }
  for (const w of workers) {
    lines.push(`- ${w.id} (${w.name}) — ${w.status}`);
  }
  lines.push("", "Use ask_worker({ workerId, message }) to message a worker.");
  return lines.join("\n");
}
