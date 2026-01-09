# Task 03 — Control Panel: DI-First Orchestrator Bridge Client + Store

## References

- `work/2026-01-08-orchestra-control-panel-openboard/research.md` → “Control panel app”, “Bridge server endpoints”
- `work/2026-01-08-orchestra-control-panel-openboard/plan.md` → Milestone **task-03**
- Key files:
  - `apps/control-panel/src/context/opencode.tsx`
  - `apps/control-panel/src/context/opencode-actions.ts`
  - `apps/control-panel/src/context/orchestrator-events.ts`
  - `apps/control-panel/src/lib/opencode-base.ts`

## 1) Intent

Create a small, testable control-plane client in the UI that can fetch orchestrator status/output and subscribe to orchestrator SSE, all via dependency injection so tests can be realistic without module mocks.

## 2) Scope

### In scope

- Add a new orchestrator bridge client module (example path):
  - `apps/control-panel/src/lib/orchestrator-bridge.ts`
  - functions: `fetchStatus`, `fetchOutput`, `subscribeEvents`
  - dependencies injected: `fetch`, `EventSource`, clock (`Date.now`) where needed
- Update `OpenCodeProvider` and/or a new context to:
  - bootstrap state via `GET /v1/status`
  - periodically pull `GET /v1/output` (or on-demand)
  - merge real-time job lifecycle events into store

### Out of scope

- Full Tasks UI (task-04/05).
- OpenBoard integration (task-07/08).

### Assumptions

- `resolveOrchestratorEventsUrl()` already returns a base that can be used for `/v1/status` and `/v1/output` as well (same origin/port).

## 3) Files Touched (Expected)

- `apps/control-panel/src/lib/orchestrator-bridge.ts` (new)
- `apps/control-panel/src/context/opencode.tsx` (wire-in)
- `apps/control-panel/src/context/opencode-actions.ts` (store updates for new state)
- `apps/control-panel/src/context/orchestrator-events.ts` (expand event allowlist)
- Tests:
  - `apps/control-panel/src/lib/__tests__/orchestrator-bridge.test.ts`
  - `apps/control-panel/src/context/__tests__/opencode-orchestrator-store.test.tsx` (or similar)

## 4) Before / After

### Before

- Orchestrator state in the UI is primarily event-driven and partial (workers/workflows/skills/memory).
- There’s no explicit “status snapshot” load for workers/jobs/logs from the bridge server.
- Task/job rendering relies on indirect signals (and is incomplete).

### After

- UI has a single orchestrator bridge client module with a stable contract.
- UI can reliably:
  - bootstrap current workers/jobs/logs on page load
  - apply incremental updates from SSE

## 5) Tests-First Plan (Red → Green → Refactor)

### Unit tests

- Client module:
  - validates URL building and query param handling (`limit`, `after`)
  - handles invalid JSON and network errors gracefully
- Store update logic:
  - pure reducers that merge status snapshots + incremental events deterministically

### Integration tests

- Optional: run a tiny in-process HTTP server in tests that serves `/v1/status` and `/v1/output` and emits SSE events, and assert the client integrates correctly.

### E2E tests

- Not added here; existing E2E must remain green.

Mocking policy:

- Inject a fake `fetch` implementation and a fake `EventSource` (a small test harness class) instead of `vi.mock`.

## 6) Implementation Steps (Small, Reviewable)

1. Add failing tests for `orchestrator-bridge` client behavior.
2. Implement `fetchStatus`/`fetchOutput` with robust parsing and typed return values.
3. Expand `subscribeToOrchestratorEvents` allowlist to include job lifecycle events added in task-01.
4. Wire bootstrap + polling into `OpenCodeProvider` (or a new context) behind a single function call.
5. Refactor `opencode-actions` to keep orchestrator-specific state updates isolated and testable.

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

- [ ] Orchestrator bridge client exists and is fully covered by unit tests
- [ ] UI store can bootstrap workers/jobs/logs and update from SSE
- [ ] No module mocks introduced; all tests use DI fakes
- [ ] Suggested commit message included

Suggested commit message: `feat(app): add orchestrator bridge client + bootstrap state`

## 9) Deliverables

- New client module + store wiring
- Tests proving deterministic behavior and error handling

