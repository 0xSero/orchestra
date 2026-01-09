# Task 01 — Orchestrator: Publish Job Lifecycle Events

## References

- `work/2026-01-08-orchestra-control-panel-openboard/research.md` → “Relevant Subsystem Map”, “Data / State / IO”
- `work/2026-01-08-orchestra-control-panel-openboard/plan.md` → Milestone **task-01**, Acceptance Criteria (observability + 100% coverage)
- Key files:
  - `packages/orchestrator/src/core/jobs.ts`
  - `packages/orchestrator/src/core/orchestrator-events.ts`
  - `packages/orchestrator/src/command/tasks.ts`
  - `docs/events.md`

## 1) Intent

Improve observability by emitting first-class orchestrator events for async job/task lifecycle changes (created/progress/completed/failed/canceled), enabling the control panel (and OpenBoard) to render task queues and task status without polling or scraping logs.

## 2) Scope

### In scope

- Define new event types in `packages/orchestrator/src/core/orchestrator-events.ts` for job lifecycle.
- Wire `workerJobs.onJobEvent(...)` from `packages/orchestrator/src/core/jobs.ts` to `publishOrchestratorEvent(...)`.
- Ensure event payloads include enough data to:
  - correlate to worker (`workerId`) and originating OpenCode session (`sessionId` when present)
  - render progress and final state (status, response/error, report summary)
- Update `docs/events.md` with the new event types.

### Out of scope

- New bridge server endpoints (that’s task-02).
- UI changes (that’s task-03+).
- Changing job persistence behavior.

### Assumptions

- Existing `WorkerJobRegistry` callbacks are stable and can be treated as the single source of truth for job state.

## 3) Files Touched (Expected)

- `packages/orchestrator/src/core/orchestrator-events.ts`
- `packages/orchestrator/src/core/jobs.ts` (if a small hook point is needed)
- `packages/orchestrator/src/command/tasks.ts` (only if extra context must be attached to jobs)
- `docs/events.md`
- Tests:
  - `packages/orchestrator/test/unit/orchestrator-events.test.ts` (extend)
  - `packages/orchestrator/test/integration/bridge-server.test.ts` (extend to validate SSE emission)

## 4) Before / After

### Before

- Orchestrator emits worker/workflow/skill/memory/error events but does **not** emit events for async job registry state.
- UI can’t reliably show task queues and progress without polling `task_list` or inferring from other events.

### After

- Orchestrator emits job lifecycle events with a stable envelope and payload.
- Consumers can:
  - show a task list in real time
  - correlate task/job events to worker streams and workflow runs

## 5) Tests-First Plan (Red → Green → Refactor)

### Unit tests

- Add a unit test that:
  - creates a job via `workerJobs.create(...)`
  - updates progress via `workerJobs.updateProgress(...)`
  - completes/fails/cancels
  - asserts the corresponding orchestrator events are emitted with expected fields.

### Integration tests

- Extend bridge server integration tests to:
  - subscribe to `GET /v1/events`
  - trigger job state changes
  - assert SSE frames include the new event types and JSON payloads.

### E2E tests

- No new E2E required in this task, but existing E2E must remain green.

Mocking policy:

- Use injected event handlers and deterministic time (fake clock) where necessary; no module mocks.

## 6) Implementation Steps (Small, Reviewable)

1. Add failing unit test for job lifecycle events (event type + payload shape).
2. Extend `OrchestratorEventType` + `OrchestratorEventDataMap` with new job event(s).
3. Wire `workerJobs.onJobEvent` to publish events.
4. Update `docs/events.md` with the new event definitions.
5. Add/extend bridge-server integration test for SSE frames.
6. Refactor for clarity (keep event payload minimal but sufficient).

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

- [ ] Job lifecycle events are emitted for created/progress/completed/failed/canceled
- [ ] Events are documented in `docs/events.md`
- [ ] Unit + integration tests cover all branches for the new event wiring
- [ ] Coverage is 100% for the added event code
- [ ] Suggested commit message included

Suggested commit message: `feat(events): publish job lifecycle events`

## 9) Deliverables

- New orchestrator event types and emission wiring
- Updated `docs/events.md`
- Tests proving SSE emission and payload correctness

