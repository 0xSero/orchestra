# Task 10 — Hardening: Docs, Final Verification, Coverage Proof

## References

- `work/2026-01-08-orchestra-control-panel-openboard/research.md` → “Notable risks found in-code”
- `work/2026-01-08-orchestra-control-panel-openboard/plan.md` → Milestone **task-10**, Acceptance Criteria
- Key files (expected touch points):
  - `docs/events.md`
  - `docs/testing.md`
  - `packages/orchestrator/schema/orchestrator.schema.json`

## 1) Intent

Finish the workflow by hardening documentation, resolving known drift/risk where appropriate, ensuring the full quality gate passes, and producing a clear “coverage proof” for the control-plane surface introduced by these tasks.

## 2) Scope

### In scope

- Documentation updates:
  - ensure `docs/events.md` reflects all event types used by the UI
  - ensure `docs/testing.md` includes the new coverage commands and UI E2E instructions (if added)
- Address discovered drift that affects maintainability:
  - update `packages/orchestrator/schema/orchestrator.schema.json` to match actual config parsing (e.g. `tasks.persist`, `tasks.jobs`) if still mismatched
  - resolve the `HEADLESS_TESTING.md` packaging reference (either add the missing doc or remove from `files` list) without breaking consumers
- Final cleanup:
  - remove dead code paths introduced during the migration
  - ensure feature flags/default behavior are documented

### Out of scope

- New features beyond what’s required for stability and documentation completeness.

### Assumptions

- CI expects `bun run check` as the primary gate; we will keep it green and add explicit coverage + E2E gates.

## 3) Files Touched (Expected)

- `docs/events.md`
- `docs/testing.md`
- `packages/orchestrator/schema/orchestrator.schema.json`
- `packages/orchestrator/package.json` (if correcting `files` list)
- Any feature-flag documentation locations introduced in earlier tasks

## 4) Before / After

### Before

- Control-plane features exist but may have:
  - incomplete docs
  - schema drift
  - inconsistent coverage invocation

### After

- Docs match behavior and are actionable.
- Schema matches parser/runtime behavior.
- A single “final verification” sequence is documented and green.
- Coverage proof for the touched modules is available and repeatable.

## 5) Tests-First Plan (Red → Green → Refactor)

### Unit tests

- Add/extend tests for schema-related parser behavior if schema changes introduce or reveal parsing edge cases.

### Integration tests

- Ensure any changes to bridge server endpoints or event types keep integration tests green.

### E2E tests

- Ensure E2E suite runs cleanly with the updated docs/commands.

Mocking policy:

- Keep the same DI approach; do not introduce mocks at the end.

## 6) Implementation Steps (Small, Reviewable)

1. Audit docs vs implementation for events and testing commands; add failing doc-driven tests only if needed.
2. Update schema to reflect real config support.
3. Fix `HEADLESS_TESTING.md` packaging reference safely.
4. Run full verification + coverage; iterate until stable.
5. Refactor/cleanup and ensure no unused flags remain.

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
  - `cd apps/openboard && bun run test -- --coverage` (if OpenBoard is in-scope by then)

## 8) Definition of Done

- [ ] Docs updated and accurate
- [ ] Schema matches runtime parsing
- [ ] Full quality gate passes + E2E passes
- [ ] Coverage proof shows 100% for the new/changed control-plane surface
- [ ] Suggested commit message included

Suggested commit message: `chore: harden docs + finalize coverage proof`

## 9) Deliverables

- Final PR-ready cleanup and documentation
- Repeatable “how to verify” steps for future contributors

