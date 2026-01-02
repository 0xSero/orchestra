# task-02 — Record `test-runs/` bundles for every orchestrator E2E test

## Goal

Make workflow/worker E2E tests always produce a `test-runs/run-{workflow}-{timestamp}/` bundle, so failures are never “invisible”.

## Before (current state)

- `packages/orchestrator/test/e2e/*.test.ts` runs important scenarios, but only the one test modified in task-00 emits a run bundle.
- Debugging failures still requires re-running tests with ad-hoc logging.

## After (desired state)

- Every file under `packages/orchestrator/test/e2e/` produces a run bundle (success or failure).
- Each bundle’s `meta.json` identifies:
  - `testName`
  - `workflowId` (or `workflowId: null` if the test is not running a workflow yet)
  - `model` as an OpenCode model id (`provider/model`) when known (or `OPENCODE_ORCH_E2E_MODEL`)

## Scope (what to do in this task)

1. Introduce a small wrapper helper for E2E tests (e.g. `withRunBundle(...)`) that:
   - Creates the run dir
   - Ensures finalization runs in `finally`/`afterAll` so bundles exist on failure
2. Wire the wrapper into all files under `packages/orchestrator/test/e2e/`:
   - `e2e.test.ts`
   - `e2e-multiagent.test.ts`
   - `vision-routing.test.ts`
   - `skills-load-subagent.test.ts`
   - `auto-spawn-limits.test.ts`
3. Keep output size bounded:
   - Limit message capture to a reasonable `limit` per worker unless configured otherwise
   - Prefer JSONL over huge single JSON blobs for logs/events

## Non-goals

- Changing test logic beyond wiring run recording.
- Adding new workflow tests.

## Acceptance criteria

- Running `bun run test:e2e` produces one new `test-runs/run-*/` directory per E2E file (or per `describe`, depending on implementation).
- Bundles contain `meta.json`, `summary.json`, and the existing artifacts from task-00/task-01.

## Test plan

- `bun run test:e2e`
- Verify multiple `test-runs/run-*/` directories exist and are readable.

