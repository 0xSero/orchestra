# Testing

## Quick start

From repo root:

```bash
bun install

bun run check
```

Note: E2E tests require the OpenCode CLI (`opencode`) on `PATH` and a model configured via `OPENCODE_ORCH_E2E_MODEL`.
Boomerang workflow E2E runs write run bundles under `packages/orchestrator/test-runs/run-*/` (gitignored).

## CI behavior

- PR CI runs `bun run check` (lint, typecheck, unit + integration tests, build).
- Nightly E2E workflow runs `bun run test:e2e` (including boomerang-plan + boomerang-run) with `OPENCODE_ORCH_E2E_MODEL` or the default `opencode/gpt-5-nano`, and installs the OpenCode CLI.

## Test tiers

### Tier 1: Default gate (local + CI)

- `bun run test` (unit + integration)
- `bun run test:unit` (orchestrator unit tests + control-panel tests)
- `bun run test:integration` (orchestrator integration tests)

### Tier 2: E2E (model required)

- `bun run test:e2e`
  - Requires `opencode` on `PATH`.
  - Set `OPENCODE_ORCH_E2E_MODEL` (example: `opencode/gpt-5-nano`).
  - Boomerang workflows emit run bundles to `packages/orchestrator/test-runs/run-*/` with `meta.json`, `events.jsonl`, `orchestrator.log.jsonl`, `workers/*/messages.json`, and `summary.json`.

### Tier 3: Optional (environment-dependent)

- `bun run test:optional` (Docker/Neo4j; auto-skips when unavailable)

### Tier 4: Non-gating

- `bun run test:stress`
- `bun run bench`

## Current test inventory (audit)

### Plugin tests (`packages/orchestrator/test/`)

- `unit/workflows-engine.test.ts`
  - Pure unit coverage for workflow carry/limits without spawning workers.
  - Risk: low (deterministic).

- `unit/prompt-extract.test.ts`
  - Validates prompt response parsing across message shapes.
  - Risk: low (deterministic).

- `unit/orchestrator-config.test.ts`
  - Validates config parsing + built-in profile overrides.
  - Risk: low (deterministic).

- `integration/bridge-server.test.ts`
  - Verifies `src/core/bridge-server.ts` SSE and auth behavior.
  - Risk: low (deterministic).

- `e2e/e2e.test.ts`
  - Spawns a real OpenCode server and prompts a model.
  - Exercises OpenCode config merge and prompt response parsing.
  - Risk: medium (model availability + server startup).

- `e2e/e2e-multiagent.test.ts`
  - Spawns multiple worker processes and exercises the worker pool, runtime shutdown, async jobs, and attachments.
  - Risk: high (slow, model dependent, multi-process orchestration).

- `e2e/vision-routing.test.ts`
  - Sends real image and base64 image parts through the vision router.
  - Risk: high (vision model/tooling variance).

- `e2e/auto-spawn-limits.test.ts`
  - Verifies worker auto-spawn under delegateTask.
  - Risk: medium (model dependent).

- `e2e/boomerang-plan.test.ts`
  - Generates `scope.md`, `rules.md`, and a full `tasks/` queue for a fixture.
  - Risk: high (model dependent, filesystem writes).

- `e2e/boomerang-run.test.ts`
  - Drains the boomerang queue and builds the fixture `dist/` output.
  - Risk: high (model dependent, longer runtime).

- `optional/memory-auto.test.ts`
  - Optional Docker/Neo4j-backed memory recording test.
  - Risk: high and environment dependent (auto-skips when unavailable).

- `perf/*.bench.ts`
  - Benchmarks for device registry and memory text pipelines.

- `stress/*.stress.ts`
  - Stress tests for worker concurrency and queue accumulation.

### App tests (`apps/control-panel/`)

- `apps/control-panel/src/context/__tests__/skills-context.test.tsx`
  - Validates CRUD for the UI "skills" client layer.
  - Risk: low (unit-ish).
