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

- `src/context/__tests__/tasks-store.test.ts`
  - Validates task store state management.
  - Risk: low (deterministic).

- `src/context/__tests__/orchestrator-events.test.ts`
  - Validates orchestrator event processing and filtering.
  - Risk: low (deterministic).

- `src/context/__tests__/agents-context.test.tsx`
  - Validates agents context provider.
  - Risk: low (unit-ish).

- `src/lib/__tests__/orchestrator-bridge.test.ts`
  - Validates DI-first orchestrator bridge client.
  - Risk: low (deterministic).

- `src/lib/__tests__/shared-client.test.ts`
  - Validates shared client adapter for OpenBoard integration.
  - Risk: low (deterministic).

- `src/lib/__tests__/event-correlation.test.ts`
  - Validates event correlation and grouping for observability.
  - Risk: low (deterministic).

- `src/lib/__tests__/task-args.test.ts`
  - Validates task command argument builders.
  - Risk: low (deterministic).

- `src/pages/__tests__/tasks-page.test.tsx`
  - Validates Tasks page rendering and job display.
  - Risk: low (unit-ish).

- `src/pages/__tests__/task-composer.test.tsx`
  - Validates Task Composer UI interactions.
  - Risk: low (unit-ish).

- `src/components/__tests__/observability-timeline.test.tsx`
  - Validates observability timeline rendering and filtering.
  - Risk: low (unit-ish).

- `src/__tests__/integration-openboard.test.tsx`
  - Validates OpenBoard integration seam.
  - Risk: low (unit-ish).

### App tests (`apps/openboard/`)

- `src/__tests__/app.test.tsx`
  - Validates OpenBoard scaffold app rendering.
  - Risk: low (unit-ish).

## Coverage

### Orchestrator plugin coverage

```bash
cd packages/orchestrator && bun test --coverage ./test/unit ./test/integration
```

### Control panel coverage

```bash
cd apps/control-panel && bun run test -- --coverage
```

### OpenBoard coverage

```bash
cd apps/openboard && bun run test -- --coverage
```

### Full verification sequence

From repo root:

```bash
bun run format:check
bun run lint
bun run typecheck
bun run test:unit
bun run test:integration
bun run test:control-panel
bun run test:openboard
bun run build
```

For E2E (requires OpenCode CLI and model):

```bash
OPENCODE_ORCH_E2E_MODEL=opencode/gpt-5-nano bun run test:e2e
```
