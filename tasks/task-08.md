# task-08 — E2E: drain the task queue and build the visual fixture (full visibility)

## Goal

Add a headless E2E test that:

1. Runs `boomerang-plan` to generate the full `tasks/` queue for the fixture.
2. Runs the boomerang queue runner to execute tasks in order.
3. Produces a built artifact (fixture `dist/` output) that can be validated visually.
4. Records complete run bundles under `test-runs/`.

## Before (current state)

- No boomerang queue execution exists yet.
- No E2E test validates “real work” artifacts.

## After (desired state)

- A new E2E test proves:
  - FIFO execution (no interruption)
  - Model usage defaults to `opencode/gpt-5-nano`
  - The fixture build output exists (`dist/` or equivalent)
  - The run bundle contains all events/logs/messages/tool parts

## Scope (what to do in this task)

1. Add a new E2E test under `packages/orchestrator/test/e2e/`.
2. Use an isolated temp copy of the fixture project.
3. Run:
   - `boomerang-plan`
   - `boomerang-run` (or whatever runner was implemented in task-05)
4. Verify:
   - Build output exists
   - At least N tasks executed (N >= 3) so we know it’s really draining the queue
5. Persist run bundles for both phases (plan + run), or a combined bundle with clear boundaries.

## Acceptance criteria

- Test produces a build output directory that’s visually inspectable.
- Run bundles show every message/tool/event with a quantified summary.

## Test plan

- `bun run test:e2e`
- Inspect `test-runs/run-*/summary.json` for counts and step durations.

