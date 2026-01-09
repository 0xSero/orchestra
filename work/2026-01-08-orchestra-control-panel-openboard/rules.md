# Rules (Attach to Every Task)

## Non-negotiables

- **No questions to the user.** If something is ambiguous, state assumptions in the task and proceed.
- **Red → Green → Refactor** every change.
- **Dependency Injection first**: design seams so tests can use injected fakes instead of mocks.
- **No mocks allowed** for internal modules. Mock only true IO boundaries (network, filesystem, time) and prefer fakes via DI over `vi.mock` / `bun:test` module mocking.
- **Never delete tests.** Fix implementation or adjust expectations only when behavior is intentionally changed.
- **Coverage must be 100%** (line + branch where tooling supports) for the new/modified surface area introduced by these tasks.

## Required checks at end of every task

Run these commands (or stricter equivalents introduced during the workflow):

- Format (check): `bun run format:check`
- Lint: `bun run lint`
- Typecheck: `bun run typecheck`
- Build: `bun run build`
- Unit tests (plugin): `bun run test:unit`
- Integration tests (plugin): `bun run test:integration`
- Unit tests (control panel): `bun run test:control-panel`
- E2E tests (plugin): `bun run test:e2e` (requires `opencode` on `PATH` and `OPENCODE_ORCH_E2E_MODEL`)
- Coverage reports (expected to be added/standardized in task-00):
  - Plugin coverage (unit+integration): `cd packages/orchestrator && bun test --coverage ./test/unit ./test/integration`
  - Control panel coverage: `cd apps/control-panel && bun run test -- --coverage`

Expected outcomes:

- All commands succeed.
- No flakes introduced.
- Coverage thresholds report **100%** for the included/changed modules.

## Git hygiene

- Each task is a coherent, reviewable commit-sized change set.
- Use meaningful commit messages (imperative, scoped). No “WIP”.
- Keep diffs minimal and focused; avoid drive-by refactors.

