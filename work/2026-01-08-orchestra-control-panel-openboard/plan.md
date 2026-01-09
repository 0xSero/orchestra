# Plan — Orchestra Control Panel Visibility + OpenBoard Integration

## Goal

Deliver a single “Orchestra” control surface that:

- Shows **real-time visibility** into OpenCode + orchestrator activity (sessions, workers, jobs/tasks, workflows, skills, memory, errors, logs).
- Lets the user **create and manage tasks** (start/await/peek/list/cancel) across `task_start` kinds (worker/auto/workflow/op) from the UI.
- Integrates and “transplants” the separate **OpenBoard** repo into this monorepo in a maintainable way.
- Updates repository references so the workspace can be renamed from `opencode-boomerang` → `orchestra` without breaking docs/tests/examples.

## Non-goals

- Rewriting OpenCode core server APIs or SDK contracts.
- Changing model/provider semantics beyond what’s needed to select models for tasks.
- Redesigning the orchestrator workflow engine (carry/limits/etc) beyond adding observability/control-plane seams.
- Shipping a fully polished desktop release pipeline (we will keep changes incremental and compatible with the current Tauri app).

## User-visible changes

- New/expanded UI surfaces in `apps/control-panel` (and/or OpenBoard UI once imported):
  - **Tasks/Jobs** list + detail view (progress, result, error, reports).
  - **Task Composer** to start/await/cancel tasks with attachments and model overrides.
  - **Event timeline** with filtering, correlation, and deep links (worker/session/workflow/task).
  - Improved visibility into orchestrator logs/output (not just event envelopes).
- Docs/examples updated to avoid `opencode-boomerang` directory assumptions.

## Technical approach

### Control-plane architecture (read vs write paths)

- **Read path (observability)**:
  - Extend orchestrator observability so the UI can fetch **current status** and **recent output** without requiring a special OpenCode session context.
  - Prefer bridge server read endpoints (incremental additions to `packages/orchestrator/src/core/bridge-server.ts`) for:
    - workers snapshot
    - job/task registry snapshot
    - recent log buffer
  - Continue to rely on **SSE** (`GET /v1/events`) for real-time updates.

- **Write path (task creation/control)**:
  - Continue to use OpenCode’s command execution path (`client.session.command`) to invoke `task_start/task_*` safely within OpenCode’s permissions/session model.
  - Add UI logic to reliably identify/select the orchestrator-capable session (because `packages/orchestrator/src/command/tasks.ts` restricts Task API use to the orchestrator or worker tool sessions).

### Event model improvements

- Add explicit orchestrator events for **job lifecycle** (created/progress/completed/failed/canceled) by wiring `packages/orchestrator/src/core/jobs.ts` job events into `packages/orchestrator/src/core/orchestrator-events.ts`.
- Ensure control panel event allowlists and parsers handle new event types.

### OpenBoard integration strategy

- Import OpenBoard into this monorepo as `apps/openboard/` (or a similarly scoped workspace package).
- Provide a minimal adapter layer so it can:
  - consume the same OpenCode + orchestrator control-plane APIs
  - share design tokens/components where feasible
  - run under Vite + be embedded in the existing desktop app
- “Transplant” means migrating OpenBoard’s UI/UX into the primary app experience in small, reversible increments (feature flags / parallel routes).

### Directory rename strategy

- Update in-repo references to `opencode-boomerang` (docs, test fixtures, examples).
- Provide a safe local rename procedure (`mv opencode-boomerang orchestra`) plus any follow-up steps.

## Test strategy (unit + integration + E2E; realistic, DI-first)

- **Unit tests**
  - Pure event parsing/validation and reducers (UI) with injected fakes (no `vi.mock`).
  - Orchestrator event emission wiring (jobs → events) with deterministic clocks.
- **Integration tests**
  - Real in-process bridge server (`packages/orchestrator/src/core/bridge-server.ts`) verifying:
    - new read endpoints return correct snapshots
    - SSE includes new job lifecycle events
  - UI integration tests with a real HTTP server and injected `EventSource` implementation where needed.
- **E2E tests**
  - Extend existing orchestrator E2E tests in `packages/orchestrator/test/e2e/*` to cover:
    - starting tasks via `task_start` and observing job events end-to-end
    - correlating task/job IDs with worker streams/events
  - Add a lightweight browser E2E smoke suite for the control panel/OpenBoard (Playwright or equivalent) to validate critical UI flows against local test servers.

## Milestones (mapped to tasks)

- **task-00**: Baseline + harness; lock current contracts; establish coverage gating for changed modules.
- **task-01**: Add orchestrator job lifecycle events (+ docs/types/tests).
- **task-02**: Add bridge server read APIs for status/output (+ integration tests).
- **task-03**: Add DI-first orchestrator bridge client/store in the control panel (+ tests).
- **task-04**: Add Tasks page (list + detail) consuming new APIs/events (+ tests).
- **task-05**: Add Task Composer UI (start/await/cancel worker/auto/workflow/op) (+ tests).
- **task-06**: Build an observability timeline with correlation across OpenCode + orchestrator events (+ tests).
- **task-07**: Import OpenBoard into the monorepo as a workspace app (+ build/test wiring).
- **task-08**: Transplant OpenBoard UI/features into the primary app experience behind reversible seams (+ tests).
- **task-09**: Update repo references for rename (`opencode-boomerang` → `orchestra`) (+ docs/tests).
- **task-10**: Hardening, docs, final verification, and 100% coverage proof for the touched surface.

## Acceptance Criteria

- UI can:
  - display real-time orchestrator + OpenCode activity with filtering/correlation
  - list tasks/jobs with status/progress/results
  - start/await/cancel tasks for all supported kinds
- Orchestrator publishes job lifecycle events and exposes read snapshots needed by the UI.
- Unit + integration + E2E tests are realistic (DI fakes; mock only true IO boundaries).
- Coverage is **100%** for the new/changed control-plane modules (line + branch where supported).
- `bun run check` and required E2E + coverage commands pass at the end of every task.

