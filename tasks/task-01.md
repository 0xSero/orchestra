# task-01 — Make `test-runs/` bundles quantified and stable

## Goal

Extend the `test-runs/run-{workflow}-{timestamp}/` bundle from task-00 so it is:

- Quantified (counts, timings, warnings/errors)
- Stable (same schema across tests; JSONL lines are valid JSON)
- Reviewable (a human can quickly answer “what happened and where?”)

## Before (current state)

- task-00 introduces a run bundle concept but does not yet guarantee:
  - A consistent `summary.json` schema across all E2E tests
  - Useful counts (tool parts per worker, event type counts, error/warn counts)
  - Stable timestamps and deterministic file naming

## After (desired state)

### Bundle schema (minimum)

`test-runs/run-{workflow}-{timestamp}/summary.json` must include:

- `workflowId` / `testName`
- `startedAt` / `finishedAt` / `durationMs`
- Counts:
  - `events.byType`
  - `workers.byId.<id>.messages.total`
  - `workers.byId.<id>.parts.byType`
  - `workers.byId.<id>.tools.byToolId` (counts tool parts / tool calls surfaced in message parts)
  - `errors.total`, `warnings.total`

### Stability requirements

- Every file written by the recorder is valid JSON/JSONL.
- Filenames are deterministic within the run directory.
- Timestamps are filesystem-safe (no `:`).

## Scope (what to do in this task)

1. Define and document a stable JSON schema for `summary.json` in the recorder helper introduced in task-00.
2. Implement summary computation by parsing:
   - Orchestrator events (`events.jsonl`)
   - Worker messages (`workers/<id>/messages.json`)
   - Orchestrator log buffer (`orchestrator.log.jsonl`)
3. Add unit coverage for summary computation (no mocks; use temp dirs + small fixture JSON).
4. Update the E2E test you wired in task-00 to assert that summary fields exist and have non-zero counts when applicable.

## Non-goals

- Adding new workflows yet.
- Changing existing orchestrator event schemas.

## Acceptance criteria

- Running `bun test packages/orchestrator/test/e2e/e2e-multiagent.test.ts` produces a run bundle whose `summary.json` has the required keys.
- `summary.json` includes tool part counts (even if some are zero).
- Unit tests cover summary generation (no mocks).

## Test plan

- `bun run lint`
- `bun run typecheck`
- `bun run test`
- Inspect a sample `test-runs/run-*/summary.json` for readability.

