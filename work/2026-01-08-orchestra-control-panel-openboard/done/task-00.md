# Task 00 — Baseline: Lock Current Contracts + Coverage Harness

## References

- `work/2026-01-08-orchestra-control-panel-openboard/research.md` → “Test Landscape”, “Relevant Subsystem Map”
- `work/2026-01-08-orchestra-control-panel-openboard/plan.md` → Milestone **task-00**, Acceptance Criteria (tests realistic, coverage 100%)
- Key files:
  - `packages/orchestrator/src/core/bridge-server.ts`
  - `packages/orchestrator/src/core/orchestrator-events.ts`
  - `packages/orchestrator/src/command/tasks.ts`
  - `apps/control-panel/src/context/orchestrator-events.ts`
  - `apps/control-panel/src/context/opencode-actions.ts`

## 1) Intent

Establish a stable baseline for the upcoming control-plane changes by locking existing behavior with tests and standardizing coverage execution so later tasks can add functionality without accidentally breaking contracts.

## 2) Scope

### In scope

- Add/expand tests that lock:
  - orchestrator SSE event envelope behavior (existing types)
  - `task_list` view outputs used by the UI (at least `workflows`, `tasks`, `status`, `output`)
  - control panel orchestrator-event allowlist parsing behavior
- Add a repeatable “coverage run” command/script for:
  - plugin unit+integration
  - control panel unit

### Out of scope

- Any new feature behavior (no new endpoints, no new event types).
- Any OpenBoard import/integration work.
- Any repo rename/rebrand changes.

### Assumptions

- Bun coverage (`bun test --coverage`) is available and sufficient for line coverage in this environment.
- Vitest coverage plugin (`@vitest/coverage-v8`) is already installed (it is), and `vitest run --coverage` is acceptable for coverage gating.

## 3) Files Touched (Expected)

- `packages/orchestrator/test/integration/bridge-server.test.ts` (extend)
- `packages/orchestrator/test/unit/orchestrator-events.test.ts` (extend)
- `packages/orchestrator/test/unit/command/*` (new/extend for `task_list` formatting/shape)
- `apps/control-panel/src/context/__tests__/orchestrator-events.test.ts` (new)
- `apps/control-panel/package.json` (optional: add `test:coverage` script)
- Repo root `package.json` (optional: add `coverage:*` helper scripts)

## 4) Before / After

### Before

- Plugin contracts are tested, but UI-facing “contract points” (event allowlists, task_list views consumed by UI) are not fully locked from the app side.
- Coverage commands exist implicitly but are not standardized as part of the workflow.

### After

- A baseline suite explicitly asserts:
  - orchestrator SSE event framing and parsing contract for the UI
  - the shapes/fields the UI depends on for `task_list` (views used for workflows/status/output)
- A single, repeatable coverage invocation exists for plugin + control panel, with thresholds configured to enforce **100%** for the new/changed surface.

## 5) Tests-First Plan (Red → Green → Refactor)

### Unit tests

- Plugin: verify `createOrchestratorEvent()` and `publishOrchestratorEvent()` envelope invariants.
- Control panel: verify `subscribeToOrchestratorEvents()` ignores malformed events and only forwards recognized events.

### Integration tests

- Bridge server: verify `GET /v1/events` streams existing event types and keeps connection alive.
- `task_list` parsing: assert view outputs are parseable JSON where requested and contain stable keys.

### E2E tests

- Run existing E2E suite unchanged to ensure baseline remains green.

Mocking policy:

- Inject fakes for `fetch`, `EventSource`, and time. Do not use module-level mocks (`vi.mock`).

## 6) Implementation Steps (Small, Reviewable)

1. Add failing tests for UI orchestrator event subscription allowlist + parsing.
2. Add failing tests for `task_list` view JSON shape and required fields.
3. Implement minimal production changes only if a test exposes a genuine bug (otherwise keep code unchanged).
4. Add scripts for coverage runs (plugin + control panel) and ensure they’re used consistently.
5. Refactor tests/helpers for readability (no behavior change).

## 7) Verification (Must Run Every Task)

- `bun run format:check`
- `bun run lint`
- `bun run typecheck`
- `bun run test:unit`
- `bun run test:integration`
- `bun run test:control-panel`
- `bun run test:e2e`
- `bun run build`
- Coverage:
  - `cd packages/orchestrator && bun test --coverage ./test/unit ./test/integration`
  - `cd apps/control-panel && bun run test -- --coverage`

Expected: all pass; coverage thresholds report 100% for included targets.

## 8) Definition of Done

- [ ] Baseline tests cover the UI-facing contracts listed above
- [ ] Coverage run is standardized and green
- [ ] No product behavior changes introduced
- [ ] Suggested commit message included

Suggested commit message: `test(control-plane): lock baseline contracts + coverage harness`

## 9) Deliverables

- PR-ready test additions + coverage scripts
- Notes on any discovered contract ambiguity or instability (documented inline in the task file or follow-up TODO in the plan)

