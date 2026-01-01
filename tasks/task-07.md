# Task 07 — Task API: Per-Task Model Overrides (No New Tool IDs)

## Goal

Allow users to select a model per worker task using the existing `task_start` tool, without adding any new registered tool IDs.

## Why this task exists

The Task API is the orchestrator’s only exposed tool surface. To make model selection usable (including from TUI commands), `task_start` must support a model override.

## Before (current state)

- `task_start` has no `model` argument:
  - `packages/orchestrator/src/command/tasks.ts:221` (args schema)
  - `packages/orchestrator/src/command/tasks.ts:274` (execute)
- Worker send path does not accept a model override from `task_start`:
  - `packages/orchestrator/src/command/tasks.ts:420` (sendToWorker call)
  - `packages/orchestrator/src/workers/spawner.ts:37` (sendToWorker)

## After (expected state)

- `task_start({ kind: "worker", workerId, task, model })` works where:
  - `model` can be a tag (`node:fast`, `node:vision`, …) or a concrete `provider/model`
- The orchestrator resolves that model and passes it to the worker prompt (Task 06 plumbing).
- `task_list({ view: "workers" })` shows the effective model and a reason string.

## Implementation steps

1. Extend `task_start` args schema:
   - Add `model?: string` and `modelPolicy?: "dynamic" | "sticky"` (exact policy names TBD)
   - `packages/orchestrator/src/command/tasks.ts:221`
2. Resolve the model using the centralized resolver (Task 05) inside the `task_start` execution path:
   - Ensure resolution has access to `context.client` + `context.directory` (for provider/config fetching)
3. Pass the resolved model to `sendToWorker(...)` (extend SendToWorkerOptions as needed).
4. Update `task_list` workers view to include:
   - configured model ref vs resolved model
   - model policy
   - resolution reason

## Verification (must pass before proceeding)

```bash
bun run lint
bun run typecheck
bun run test:e2e
bun run build
```

Do not proceed until all commands pass and any task-introduced warnings/errors are eliminated.

## Git (must do before proceeding)

```bash
git add packages/orchestrator/src/command/tasks.ts packages/orchestrator/src/workers/ packages/orchestrator/test/unit/
git commit -m "feat(orchestrator): allow task_start worker model overrides"
git push origin main
```

## Completion record (fill in when done)

- Commit: `HEAD`
- After references (update with final line numbers):
  - `packages/orchestrator/src/command/tasks.ts:430`
  - `packages/orchestrator/src/workers/send.ts:55`
  - `packages/orchestrator/src/core/worker-pool.ts:618`
