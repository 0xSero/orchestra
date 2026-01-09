# Task 02 — Bridge Server: Add Read APIs for Status + Output

## References

- `work/2026-01-08-orchestra-control-panel-openboard/research.md` → “Data / State / IO” (bridge server), “Relevant Subsystem Map”
- `work/2026-01-08-orchestra-control-panel-openboard/plan.md` → Milestone **task-02**
- Key files:
  - `packages/orchestrator/src/core/bridge-server.ts`
  - `packages/orchestrator/src/core/worker-pool.ts`
  - `packages/orchestrator/src/core/jobs.ts`
  - `packages/orchestrator/src/core/logger.ts`

## 1) Intent

Give the UI a simple, unauthenticated read-only “control-plane snapshot” API on the existing bridge server so it can render current workers/jobs/logs without depending on an OpenCode session context or parsing markdown tool output.

## 2) Scope

### In scope

- Add read-only endpoints to `packages/orchestrator/src/core/bridge-server.ts`:
  - `GET /v1/status` → `{ workers, jobs }` (or `{ workers, tasks }`)
  - `GET /v1/output` → `{ jobs, logs }` with query params `limit` and `after` (unix-ms), matching `task_list --view output` semantics
- Ensure endpoints are:
  - CORS permissive (same as SSE endpoints)
  - stable JSON shapes (versioned if needed)
  - safe to expose without auth (read-only; local machine usage)

### Out of scope

- Write endpoints for starting/canceling tasks (keep writes on OpenCode command path for now).
- UI changes (task-03+).

### Assumptions

- The bridge server is already bound to localhost by default, and desktop can expose the base URL via `window.__OPENCODE__.orchestratorEventsUrl`.

## 3) Files Touched (Expected)

- `packages/orchestrator/src/core/bridge-server.ts`
- (Possibly) `packages/orchestrator/src/core/worker-pool.ts` (export small helper for JSON snapshots if needed)
- Tests:
  - `packages/orchestrator/test/integration/bridge-server.test.ts`

## 4) Before / After

### Before

- UI can subscribe to `GET /v1/events` but must rely on:
  - in-memory event history in the UI, or
  - OpenCode `session.command` to query `task_list` views.
- There is no simple JSON “current status” endpoint.

### After

- UI can:
  - call `GET /v1/status` to render workers + jobs immediately on load
  - call `GET /v1/output` to render recent jobs + log buffer with incremental polling (`after`)

## 5) Tests-First Plan (Red → Green → Refactor)

### Unit tests

- Not required if integration tests cover the branch logic, but any helper functions should be unit-tested to 100%.

### Integration tests

- Extend `packages/orchestrator/test/integration/bridge-server.test.ts` with:
  - `GET /v1/status` returns JSON with expected keys/types
  - `GET /v1/output?limit=...&after=...` respects filters
  - ensures 404 for unknown routes remains unchanged

### E2E tests

- Existing E2E remains green; no new E2E in this task.

Mocking policy:

- Use real HTTP requests against a real in-process bridge server instance (no network mocks).

## 6) Implementation Steps (Small, Reviewable)

1. Add failing integration tests for `GET /v1/status` and `GET /v1/output`.
2. Implement handlers in `bridge-server.ts` using existing in-memory sources:
   - `workerPool.toJSON()`
   - `workerJobs.list(...)`
   - `getLogBuffer(...)`
3. Add query param parsing + validation (`limit`, `after`) with safe defaults.
4. Refactor handler code into small pure helpers and unit test helpers if meaningful branches exist.

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

- [ ] `GET /v1/status` and `GET /v1/output` exist, documented (inline in code or docs if required)
- [ ] Integration tests cover success + error branches
- [ ] Coverage 100% for added/modified server handler code
- [ ] Suggested commit message included

Suggested commit message: `feat(bridge): add status/output read APIs`

## 9) Deliverables

- New bridge server read endpoints
- Integration tests verifying behavior and stability

