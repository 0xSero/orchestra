# task-09 — Docs + polish: make boomerang workflows operable

## Goal

Make the boomerang workflow system easy to run and debug for maintainers:

- Clear docs
- Clear commands
- Clear artifact locations

## Before (current state)

- `docs/testing.md` describes E2E tiers but not boomerang-specific workflows or `test-runs/`.
- There is no single place describing how to run boomerang-plan/boomerang-run and interpret outputs.

## After (desired state)

- Docs updates cover:
  - How to configure planner/implementer models using OpenCode provider/model ids
  - How to run `boomerang-plan` and `boomerang-run` via `task_start`/`task_await`
  - How to find and interpret `test-runs/run-*/` bundles
  - How to troubleshoot missing models/providers (point to `task_list({ view: "models" })`)

## Scope (what to do in this task)

1. Update docs:
   - `docs/testing.md`
   - `docs/reference.md` (if needed)
2. Ensure `.gitignore` includes `test-runs/` (if not already).
3. Ensure CI guidance mentions the new E2E tests and model requirements.

## Acceptance criteria

- A new contributor can run the boomerang E2E test and inspect the run bundle without tribal knowledge.

## Test plan

- `bun run check`

