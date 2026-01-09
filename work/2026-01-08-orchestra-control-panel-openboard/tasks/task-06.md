# Task 06 — Observability Timeline: Correlate OpenCode + Orchestrator Activity

## References

- `work/2026-01-08-orchestra-control-panel-openboard/research.md` → “Call-flow (today)”
- `work/2026-01-08-orchestra-control-panel-openboard/plan.md` → Milestone **task-06**
- Key files:
  - `apps/control-panel/src/components/log-stream.tsx`
  - `apps/control-panel/src/context/opencode-actions.ts`
  - `packages/orchestrator/src/core/orchestrator-events.ts`

## 1) Intent

Make “everything that’s happening” navigable by building a timeline view that correlates OpenCode events and orchestrator events into coherent threads (by sessionId/workerId/taskId/runId), so debugging and monitoring becomes fast and reliable.

## 2) Scope

### In scope

- Add an “Observability” page or enhance the existing logs panel to:
  - filter by event type family (`session.*`, `message.*`, `orchestra.*`)
  - group/correlate by IDs (sessionId, workerId, runId, taskId)
  - deep-link to related views (worker chat, workflow run, task detail)
- Normalize event rendering into a single `describeEvent()` pipeline with typed guards.
- Persist user filters in local preferences (via existing DB preferences API where available).

### Out of scope

- OpenBoard import/transplant work.
- Adding new orchestrator event types beyond what’s needed to correlate (job events were added earlier).

### Assumptions

- Orchestrator job lifecycle events include job IDs; workflows already include runId/stepId.

## 3) Files Touched (Expected)

- `apps/control-panel/src/components/log-stream.tsx` (refactor/extend)
- `apps/control-panel/src/pages/observability.tsx` (new) + routing/nav updates
- `apps/control-panel/src/context/opencode-types.ts` (typed event union improvements)
- Tests:
  - `apps/control-panel/src/components/__tests__/observability-timeline.test.tsx`
  - `apps/control-panel/src/lib/__tests__/event-correlation.test.ts`

## 4) Before / After

### Before

- Event visibility exists but is flat, lightly described, and hard to correlate across subsystems.

### After

- A dedicated timeline provides:
  - filters
  - correlation/grouping
  - deep links to the exact task/worker/workflow context

## 5) Tests-First Plan (Red → Green → Refactor)

### Unit tests

- Correlation logic:
  - group by sessionId/workerId/runId/taskId
  - stable ordering
  - unknown/malformed events handled safely

### Integration tests

- Component test that renders a mixed event stream and asserts:
  - filter toggles work
  - grouped sections render expected titles and counts

### E2E tests

- Extend backend E2E to generate a mixed set of orchestrator events that the UI can render (UI E2E can come later once Playwright is in place).

Mocking policy:

- Inject deterministic event arrays; no module mocks.

## 6) Implementation Steps (Small, Reviewable)

1. Add failing tests for correlation/grouping and filter behavior.
2. Extract event normalization/correlation into a small pure module.
3. Refactor `log-stream.tsx` to consume the new module.
4. Add UI for filters + deep links; persist filter state via preferences when available.
5. Refactor for accessibility and performance (keep it simple; add virtualization only if needed).

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

## 8) Definition of Done

- [ ] Timeline view exists with filters + correlation
- [ ] Tests cover grouping + filter edge cases; coverage 100% for new modules
- [ ] Suggested commit message included

Suggested commit message: `feat(app): add observability timeline with correlation`

## 9) Deliverables

- New observability UI and correlation module
- Tests proving correctness and safety

