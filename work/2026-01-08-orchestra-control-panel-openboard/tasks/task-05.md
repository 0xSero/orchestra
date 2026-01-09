# Task 05 — Control Panel: Task Composer (Start/Await/Cancel)

## References

- `work/2026-01-08-orchestra-control-panel-openboard/research.md` → “Creating orchestrator tasks (today)”
- `work/2026-01-08-orchestra-control-panel-openboard/plan.md` → Milestone **task-05**
- Key files:
  - `packages/orchestrator/src/command/tasks.ts` (supported kinds/args)
  - `apps/control-panel/src/pages/workflows.tsx` (existing `task_start` usage)
  - `apps/control-panel/src/context/opencode.tsx` (OpenCode client)

## 1) Intent

Enable creating and managing orchestrator tasks directly from the UI for all supported Task API kinds, including awaiting completion and canceling when needed.

## 2) Scope

### In scope

- Add a “Task Composer” surface (either:
  - a new `/compose` page, or
  - embedded in `/tasks`)
- Support `task_start` kinds:
  - `--kind worker --workerId ... --task ...`
  - `--kind auto --task ...`
  - `--kind workflow --workflowId ... --task ...`
  - `--kind op --op memory.put|memory.link|memory.done|worker.model.set|worker.model.reset ...`
- Support:
  - `task_await`
  - `task_peek`
  - `task_cancel`
- Handle orchestrator tool access restrictions by reliably choosing an orchestrator-capable session for `client.session.command`.

### Out of scope

- Bridge server write endpoints for task creation (keep writes via OpenCode command path).
- OpenBoard integration.

### Assumptions

- Control panel can identify an orchestrator-capable session via existing OpenCode agent/session metadata or by creating a session with the orchestrator agent configured.

## 3) Files Touched (Expected)

- `apps/control-panel/src/pages/tasks.tsx` (extend) or new page/module
- `apps/control-panel/src/context/opencode-actions.ts` (add command helpers)
- `apps/control-panel/src/lib/*` (new `task-command-builder` helpers)
- `apps/control-panel/src/components/*` (form controls)
- Tests:
  - `apps/control-panel/src/lib/__tests__/task-args.test.ts`
  - `apps/control-panel/src/pages/__tests__/task-composer.test.tsx`

## 4) Before / After

### Before

- UI can run workflows via `task_start` in `apps/control-panel/src/pages/workflows.tsx`, but can’t:
  - start arbitrary worker/auto/op tasks
  - await/peek/cancel from a unified UI
  - manage task lifecycle from a single place

### After

- UI can create any supported task kind with validation and good defaults.
- UI can await/peek/cancel tasks and display results/errors.

## 5) Tests-First Plan (Red → Green → Refactor)

### Unit tests

- Build/parse of `task_start` argument strings (escape handling, required fields).
- “Orchestrator session selection” logic for running `session.command`.

### Integration tests

- UI component tests using injected fake OpenCode client:
  - verify correct `session.command` calls for each kind
  - verify error states when tool access fails

### E2E tests

- Extend plugin E2E to start a worker task and observe:
  - job lifecycle events
  - worker stream chunks
  - final completion reflected in snapshots

Mocking policy:

- Inject fake OpenCode client interface into actions; avoid `vi.mock`.

## 6) Implementation Steps (Small, Reviewable)

1. Add failing unit tests for argument builder and session selection.
2. Add a small command builder module that produces safe argument strings.
3. Implement UI form with strict validation per task kind.
4. Implement await/peek/cancel controls and wire results into existing state.
5. Refactor workflow page to reuse the same command builder (remove duplication).

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

- [ ] UI supports start/await/peek/cancel for all supported kinds
- [ ] Tool access restrictions handled predictably
- [ ] Tests cover validation and error branches; coverage 100% for new modules
- [ ] Suggested commit message included

Suggested commit message: `feat(app): add task composer for task_start/task_*`

## 9) Deliverables

- Task composer UI + shared command builder
- Tests proving correctness and safety

