# task-04 — Implement `boomerang-plan` workflow (generate `scope.md` + `rules.md` + full `tasks/` queue)

## Goal

Add a workflow that takes a target directory + a high-level goal prompt and produces, in the repo:

- `scope.md` (big picture + code map for that directory)
- `rules.md` (operational rules for the task queue)
- `tasks/task-00.md` … `tasks/task-NN.md` (full queue upfront)

## Before (current state)

- Workflow engine exists (`packages/orchestrator/src/workflows/*`) but has no boomerang workflow.
- Only built-in workflows are registered:
  - `vision`
  - `memory`
  - `roocode-boomerang`
- Task queue documents currently exist only because we manually authored them.

## After (desired state)

- `task_list({ view: "workflows" })` includes a new workflow id `boomerang-plan`.
- Running it from OpenCode via `task_start({ kind: "workflow", workflowId: "boomerang-plan", task: ... })` creates/overwrites `scope.md`, `rules.md`, and `tasks/*` in the working directory.
- Output is polished and structured (handoff schema).

## Scope (what to do in this task)

1. Add a new workflow definition (mirroring `roocode-boomerang.ts` patterns):
   - New file under `packages/orchestrator/src/workflows/`
   - Register it from `packages/orchestrator/src/workflows/index.ts`
2. Define inputs clearly in the workflow prompt:
   - Target directory
   - Big goal
   - Required output files and format
   - “Generate the full queue upfront”
3. Ensure model selection matches task-03 (planner model is an OpenCode provider/model id).
4. Add deterministic unit coverage for:
   - Workflow registration
   - Basic run execution using dependency injection (`runWorkflow` with fake send/resolve)

## Non-goals

- Executing the task queue (next task).
- E2E test of boomerang-plan (later task).

## Acceptance criteria

- `task_list({ view: "workflows", format: "json" })` includes `boomerang-plan`.
- Unit tests cover `boomerang-plan` registration and that it can run without spawning real workers (DI-only).

## Test plan

- `bun run lint`
- `bun run typecheck`
- `bun run test`

