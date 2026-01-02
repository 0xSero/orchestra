# task-00 — Make workflow E2E runs visible (`test-runs/`)

## Goal

Workflow E2E tests must produce a gitignored, timestamped run directory with a complete audit trail:

- Every message
- Every tool call/tool part (from OpenCode session messages)
- Every orchestrator event (workflow steps, worker stream, skill events, errors)
- Every warning/error
- Timings and basic counts (quantified visibility)

This is the foundation for the later “real process” workflow test where the workflow generates `scope.md`, `rules.md`, `tasks/`, and non-trivial artifacts (e.g., a buildable mini site).

## Before (current state)

- E2E tests exist but leave very little durable evidence after a failure:
  - `packages/orchestrator/test/e2e/e2e-multiagent.test.ts` runs multiple workers and async jobs but does not persist transcripts/events/logs.
  - `packages/orchestrator/test/e2e/e2e.test.ts` proves a headless OpenCode server can answer, but does not persist a run bundle.
- Orchestrator observability exists but is not persisted by tests:
  - Event bus: `packages/orchestrator/src/core/orchestrator-events.ts` (`onOrchestratorEvent`)
  - Log buffer: `packages/orchestrator/src/core/logger.ts` (`getLogBuffer`)
  - Worker session messages include tool parts (see parsing in `packages/orchestrator/src/workers/prompt/extract.ts`)
- Repo does not gitignore `test-runs/` yet (see `.gitignore`).

## After (desired state)

### Functional outcomes

- A reusable test helper creates `test-runs/run-{workflow}-{timestamp}/` and writes a structured “run bundle”.
- At least one E2E test writes a run bundle on every run (success or failure).
- Bundles are human-debuggable and diffable:
  - JSON or JSONL, stable keys, minimal noise.

### Files/paths

- `test-runs/` is gitignored.
- Run directory format: `test-runs/run-{workflow}-{timestamp}/`
  - Timestamp should be filesystem-safe (no `:`).

### Minimum bundle contents

- `meta.json`: test name, workflow id, timestamps, cwd, git SHA/branch (best-effort), model (`OPENCODE_ORCH_E2E_MODEL`), and any relevant env toggles.
- `events.jsonl`: one orchestrator event per line (from `onOrchestratorEvent`).
- `orchestrator.log.jsonl`: log buffer dump (from `getLogBuffer()`).
- `workers/<workerId>/messages.json`: full session messages for each worker involved (includes tool parts/tool calls).
- `summary.json`: counts + durations (messages, tool parts, warnings/errors, workflow steps).

## Scope (what to do in this task)

1. Add `test-runs/` to `.gitignore`.
2. Add a new helper under `packages/orchestrator/test/helpers/` to:
   - Create the run directory.
   - Subscribe to orchestrator events and write JSONL.
   - Persist the orchestrator log buffer at the end of the test (even on failure).
   - Optionally persist worker session messages when a worker client/session id is available.
3. Add unit coverage for the helper (no mocks; use temp dirs).
4. Wire the helper into one existing E2E test (start with `packages/orchestrator/test/e2e/e2e-multiagent.test.ts`).

## Non-goals (explicitly out of scope for task-00)

- Implementing the new “your process” workflow definition itself.
- Building the full “real artifact” workflow E2E scenario.
- Any UI work in `apps/` or `examples/`.

## Acceptance criteria

- `test-runs/` is gitignored.
- Running `bun test packages/orchestrator/test/e2e/e2e-multiagent.test.ts` produces a new `test-runs/run-*-*/` directory.
- The directory contains `meta.json`, `events.jsonl`, `orchestrator.log.jsonl`, and `summary.json` at minimum.
- If workers were spawned, the run includes `workers/<id>/messages.json` for each spawned worker (or a clear note in `meta.json` why not).
- No tests are deleted.
- No mocks are introduced.

## Suggested implementation notes (keep it small)

- Prefer adding one new helper file (plus one unit test) over spreading logic.
- Keep the writer API simple: `startRunRecorder(...)` returns `{ runDir, recorders..., finalize() }`.
- Use `packages/orchestrator/src/core/orchestrator-events.ts` (`onOrchestratorEvent`) for event capture.
- Use `packages/orchestrator/src/core/logger.ts` (`getLogBuffer`) for log capture.
- For worker transcripts, use existing worker instances from `packages/orchestrator/src/core/worker-pool.ts` (`workerPool.get(id)`), then call `client.session.messages(...)` using the instance’s `sessionId` when available.

## Test plan

- `bun run lint`
- `bun run typecheck`
- `bun run test`
- Validate a run bundle exists under `test-runs/` and contains the expected files.
