# task-07 — E2E: run `boomerang-plan` and capture full run bundle

## Goal

Add a headless E2E test that runs `boomerang-plan` against the fixture project and records a full `test-runs/` bundle (messages, tool calls, events, logs, summary).

## Before (current state)

- E2E tests spawn servers/workers but do not run boomerang workflows (they don’t exist yet).
- Run bundle recording is introduced in earlier tasks but not applied to boomerang workflows.

## After (desired state)

- A new E2E test:
  - Spawns OpenCode server
  - Runs `task_start({ kind: "workflow", workflowId: "boomerang-plan", ... })`
  - Waits for completion with `task_await`
  - Asserts `scope.md`, `rules.md`, and `tasks/` were generated in the fixture directory
  - Writes a run bundle to `test-runs/run-boomerang-plan-{timestamp}/`
- Uses `opencode/gpt-5-nano` by default (per repo policy).

## Scope (what to do in this task)

1. Add the E2E test under `packages/orchestrator/test/e2e/`.
2. Use the existing E2E environment helpers:
   - `packages/orchestrator/test/helpers/e2e-env.ts`
3. Ensure the test creates an isolated working directory (copy fixture to temp dir) so it doesn’t dirty the repo.
4. Use the run bundle recorder for perfect visibility.

## Acceptance criteria

- The test passes locally when `opencode` and `OPENCODE_ORCH_E2E_MODEL` are configured.
- A run bundle is created and includes worker transcripts with tool parts.
- The fixture temp dir contains `scope.md`, `rules.md`, and `tasks/task-00.md` at minimum (plus more tasks).

## Test plan

- `bun run test:e2e`
- Inspect the produced `test-runs/run-boomerang-plan-*/` directory.

