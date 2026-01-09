# Task 09 — Rename References: opencode-boomerang → orchestra

## References

- `work/2026-01-08-orchestra-control-panel-openboard/research.md` → Assumption “Directory rename”
- `work/2026-01-08-orchestra-control-panel-openboard/plan.md` → Milestone **task-09**
- Known in-repo references:
  - `docs/docker.md`
  - `docs/worktrees.md`
  - `packages/orchestrator/test/unit/orchestrator-config.test.ts`

## 1) Intent

Prepare the repository to be renamed on disk from `opencode-boomerang` to `orchestra` by removing/adjusting hard-coded path references in docs/tests/examples, and by documenting a safe rename procedure.

## 2) Scope

### In scope

- Update docs that reference `opencode-boomerang` paths or docker compose names:
  - `docs/docker.md`
  - `docs/worktrees.md`
- Update tests that embed the old directory name:
  - `packages/orchestrator/test/unit/orchestrator-config.test.ts`
- Add a short rename/migration note (either in an existing doc or a new `docs/rename.md`).

### Out of scope

- Renaming published package names (only do if explicitly required by the existing release process).
- Changing workflow IDs like “boomerang” (not the same as repo directory name).

### Assumptions

- The on-disk folder rename is performed outside of git as a user operation; code changes only need to ensure docs/tests don’t encode the old folder name.

## 3) Files Touched (Expected)

- `docs/docker.md`
- `docs/worktrees.md`
- `packages/orchestrator/test/unit/orchestrator-config.test.ts`
- (Optional) `docs/rename.md`

## 4) Before / After

### Before

- Docs and at least one unit test assume `opencode-boomerang` in filesystem paths.

### After

- Docs and tests use neutral examples (`../orchestra-...` or placeholders) and do not break when the repo directory name changes.
- Migration instructions exist.

## 5) Tests-First Plan (Red → Green → Refactor)

### Unit tests

- Update the unit test expectations to match the new neutral naming.

### Integration tests

- None required beyond ensuring the test suite remains green.

### E2E tests

- Existing E2E must remain green.

Mocking policy:

- N/A.

## 6) Implementation Steps (Small, Reviewable)

1. Update docs to remove hard-coded `opencode-boomerang` paths.
2. Update unit tests that assert those paths.
3. Add migration doc with a safe rename checklist:
   - rename folder
   - re-run `bun install` if needed
   - run `bun run check`

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

- [ ] No in-repo docs/tests depend on `opencode-boomerang` path naming
- [ ] Migration instructions exist
- [ ] Suggested commit message included

Suggested commit message: `docs: remove opencode-boomerang path assumptions`

## 9) Deliverables

- Updated docs/tests ready for directory rename
- Rename procedure documented

