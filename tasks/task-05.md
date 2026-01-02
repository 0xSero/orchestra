# task-05 — Implement queue-drained execution for boomerang tasks (open-queue semantics)

## Goal

Add a workflow/runner path that executes the pre-generated `tasks/task-XX.md` queue strictly FIFO, one task per model turn, without interrupting active runs.

This should match the behavior of Open Queue (reference): https://github.com/0xSero/open-queue

## Before (current state)

- The workflow engine executes a fixed list of steps (`WorkflowDefinition.steps`).
- There is no first-class “task queue” concept in the orchestrator workflow system.
- Open Queue exists as a separate OpenCode plugin, not integrated here.

## After (desired state)

- There is a supported way to execute the boomerang queue:
  - Either a new workflow id (e.g. `boomerang-run`) that reads `tasks/` and iterates, or
  - A small orchestrator-internal queue runner that sequentially triggers per-task workflow runs.
- Execution guarantees:
  - Strict FIFO
  - No concurrent sends to the same worker session
  - Each task is isolated to one “turn” (no multi-task prompts)

## Scope (what to do in this task)

1. Choose an implementation strategy (minimal, consistent with existing code):
   - Option A: “queue workflow” that enumerates tasks at runtime and produces one `WorkflowStepResult` per task.
   - Option B: “queue runner” that runs `boomerang-task` workflow N times (one per task file).
2. Implement idle/busy gating using the same idea as Open Queue:
   - Never send a new prompt while a session is busy
   - Drain only when idle
3. Ensure model selection matches task-03 (implementer model is an OpenCode provider/model id).
4. Add unit/integration tests with dependency injection (no mocks).

## Non-goals

- The final “hard visual artifact” scenario (later task).

## Acceptance criteria

- Given `tasks/task-00.md` … `tasks/task-02.md`, the runner executes them in order and records per-task results.
- Tests prove FIFO ordering and “no overlap” semantics.

## Test plan

- `bun run lint`
- `bun run typecheck`
- `bun run test`

