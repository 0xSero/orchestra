# task-06 — Create a “visual validation” fixture project for boomerang E2E

## Goal

Create a small, self-contained fixture project that the boomerang workflow can modify and “build”, producing artifacts that are easy to validate visually.

## Before (current state)

- Orchestrator E2E tests run against the repo root and focus on worker/process orchestration.
- There is no dedicated fixture that represents “real work” (like building a site) while remaining safe for tests.

## After (desired state)

- A fixture project exists under `packages/orchestrator/test/fixtures/` that:
  - Has a tiny build command (Bun-based, no network installs during tests)
  - Produces a deterministic output directory (e.g. `dist/`)
  - Is non-trivial enough for visual inspection (HTML + CSS + generated content)
- The boomerang workflow will target this fixture in E2E tests.

## Scope (what to do in this task)

1. Add a new fixture directory (choose a name like `boomerang-site/`).
2. Include:
   - `package.json` with `build` and `test` scripts that work offline
   - A minimal generator (TypeScript or JS) that emits `dist/index.html` + assets
3. Add a tiny verification script or test that asserts the build output exists and is stable.

## Non-goals

- Running boomerang workflows yet.

## Acceptance criteria

- `bun run <fixture build>` succeeds without network access.
- Fixture output is visually inspectable (`dist/index.html` with CSS/JS).

## Test plan

- `bun run lint`
- `bun run typecheck`
- `bun run test`
- Manually open the generated `dist/index.html` for a sanity check.

