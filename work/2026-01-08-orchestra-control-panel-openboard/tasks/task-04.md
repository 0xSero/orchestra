# Task 04 — Control Panel: Tasks Page (List + Detail)

## References

- `work/2026-01-08-orchestra-control-panel-openboard/research.md` → “Control panel app”, “Creating orchestrator tasks (today)”
- `work/2026-01-08-orchestra-control-panel-openboard/plan.md` → Milestone **task-04**
- Key files:
  - `apps/control-panel/src/app.tsx`
  - `apps/control-panel/src/components/layout/app-layout-nav.tsx`
  - `apps/control-panel/src/pages/*`
  - `apps/control-panel/src/context/opencode-types.ts`

## 1) Intent

Add a dedicated UI page for tasks/jobs that makes async activity visible: current running tasks, recent completions/failures, progress messages, and correlation to workers/workflows/streams.

## 2) Scope

### In scope

- Add a new route `/tasks` with navigation entry and command palette support.
- Render a task list sourced from:
  - bridge snapshot (`GET /v1/status` and/or `GET /v1/output`)
  - job lifecycle SSE events
- Add a task detail panel:
  - status, timestamps, duration, progress
  - response/error/report summary
  - correlation links (worker → chat, workflow run → workflows page)

### Out of scope

- Task creation UI (task-05).
- OpenBoard integration (task-07/08).

### Assumptions

- Job lifecycle events include enough data to render a usable list without calling `task_peek` for every item.

## 3) Files Touched (Expected)

- `apps/control-panel/src/app.tsx` (route)
- `apps/control-panel/src/components/layout/app-layout-nav.tsx` (nav item)
- `apps/control-panel/src/pages/tasks.tsx` (new)
- `apps/control-panel/src/pages/index.tsx` (export, if used)
- `apps/control-panel/src/context/opencode-types.ts` (types for jobs/tasks in UI state)
- `apps/control-panel/src/context/opencode-actions.ts` (merge job/task state)
- Tests:
  - `apps/control-panel/src/pages/__tests__/tasks-page.test.tsx`
  - `apps/control-panel/src/context/__tests__/tasks-store.test.ts`

## 4) Before / After

### Before

- No first-class Tasks page; job/task visibility is scattered across dashboard and event logs.
- Users can’t easily inspect a task/job record end-to-end.

### After

- `/tasks` page shows a reliable list of jobs/tasks and a detail view.
- Users can quickly navigate from a task to the worker/session/workflow context.

## 5) Tests-First Plan (Red → Green → Refactor)

### Unit tests

- Store/reducer tests for:
  - bootstrap snapshot merging
  - SSE incremental updates and ordering
  - edge cases (unknown job IDs, missing fields)

### Integration tests

- Component tests with Solid Testing Library that:
  - render list + detail
  - assert navigation/correlation links are correct
  - use injected provider state (no network)

### E2E tests

- Add or extend E2E to include a backend flow that emits job events (can be in plugin E2E; UI E2E added later).

Mocking policy:

- Use DI state providers and deterministic time; avoid module mocks.

## 6) Implementation Steps (Small, Reviewable)

1. Write failing component tests for `/tasks` list + detail.
2. Add route + nav item (initially hidden behind a feature flag if needed).
3. Implement page UI using existing design system components.
4. Wire to store selectors; ensure performance (limit list, virtualization optional later).
5. Refactor store logic to keep UI dumb and selectors pure.

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

- [ ] `/tasks` exists and is reachable via nav + command palette
- [ ] Task list + detail are fully covered by tests
- [ ] Coverage is 100% for the new page + store changes
- [ ] Suggested commit message included

Suggested commit message: `feat(app): add tasks page`

## 9) Deliverables

- New Tasks page with list + detail
- Tests for UI + store behavior

