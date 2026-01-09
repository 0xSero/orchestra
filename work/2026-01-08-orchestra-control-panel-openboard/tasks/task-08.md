# Task 08 — Transplant OpenBoard into the Primary Orchestra UI

## References

- `work/2026-01-08-orchestra-control-panel-openboard/research.md` → “Control panel app (web UI used by desktop)”
- `work/2026-01-08-orchestra-control-panel-openboard/plan.md` → Milestone **task-08**
- Key files:
  - `apps/control-panel/src/app.tsx`
  - `apps/desktop/src/index.tsx`
  - `apps/openboard/**` (imported in task-07)

## 1) Intent

Integrate OpenBoard’s UI as the primary “control panel” experience for Orchestra, without a big-bang rewrite: keep changes reversible, preserve existing working features, and ensure tests/coverage remain strict.

## 2) Scope

### In scope

- Add a reversible integration seam:
  - feature flag / route switch / build-time config
  - ability to run either the legacy control panel pages or OpenBoard pages
- Gradually replace high-value surfaces first:
  - tasks/jobs view
  - observability timeline
  - workflow control
- Consolidate shared API clients:
  - OpenCode client wrapper
  - orchestrator bridge client

### Out of scope

- Full redesign of every page. Focus on parity + incremental migration.

### Assumptions

- OpenBoard can be adapted to consume the same control-plane APIs (status/output/events + task_* commands).

## 3) Files Touched (Expected)

- `apps/control-panel/src/*` (routing + shared providers)
- `apps/openboard/src/*` (adapter wiring)
- `apps/desktop/src/index.tsx` (if switching the primary app export is needed)
- Tests:
  - `apps/control-panel/src/__tests__/integration-openboard.test.tsx`
  - `apps/openboard/src/__tests__/integration-orchestra.test.tsx`

## 4) Before / After

### Before

- OpenBoard runs separately (or not at all in this repo).
- Control panel is the only UI in `@opencode-ai/app`.

### After

- OpenBoard features/pages are integrated behind a clear seam.
- Desktop can render the unified Orchestra UI, with a fallback to the legacy UI until parity is proven.

## 5) Tests-First Plan (Red → Green → Refactor)

### Unit tests

- Adapter layer:
  - ensure the same data models are presented to both UI surfaces
  - ensure DI seams exist for network/time

### Integration tests

- Render the integrated app in jsdom and assert:
  - core navigation works
  - tasks list renders from injected store
  - no crashes when orchestrator endpoints are unavailable (graceful offline mode)

### E2E tests

- Add/extend UI smoke E2E (Playwright) validating the “primary surfaces” load.
- Ensure backend E2E continues to validate task creation and event emission.

Mocking policy:

- Use DI fakes and real local servers where necessary; avoid module mocks.

## 6) Implementation Steps (Small, Reviewable)

1. Add failing tests asserting that the integrated seam can switch between UIs.
2. Implement a minimal adapter that mounts OpenBoard under a route (e.g. `/openboard/*`).
3. Share the same providers (OpenCode + orchestrator bridge + preferences).
4. Migrate one surface at a time (start with Tasks, then Observability).
5. Remove duplication and refactor to a single shared client layer.

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
  - `cd apps/openboard && bun run test -- --coverage`

## 8) Definition of Done

- [ ] OpenBoard is integrated behind a reversible seam
- [ ] At least one high-value surface is transplanted with full tests/coverage
- [ ] Desktop continues to build and run the UI app
- [ ] Suggested commit message included

Suggested commit message: `feat(app): integrate openboard behind a reversible seam`

## 9) Deliverables

- Integrated UI seam + first transplanted feature(s)
- Tests ensuring integration stability and offline handling

