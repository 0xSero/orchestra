# Task 07 — Import OpenBoard into the Monorepo

## References

- `work/2026-01-08-orchestra-control-panel-openboard/research.md` → Assumption “OpenBoard repo availability”
- `work/2026-01-08-orchestra-control-panel-openboard/plan.md` → Milestone **task-07**
- Existing app integration points:
  - `apps/control-panel/package.json`
  - `apps/desktop/src/index.tsx`
  - `apps/desktop/src-tauri/src/lib.rs`

## 1) Intent

Bring the OpenBoard codebase into this monorepo as a first-class workspace app so it can be built, tested, and integrated incrementally alongside the existing control panel.

## 2) Scope

### In scope

- Create `apps/openboard/` (or a clearly named workspace package) containing OpenBoard source.
- Add workspace wiring (package.json, scripts, tsconfig, vite config as needed) so:
  - `bun run build` includes it (or at least it builds successfully)
  - `bun run typecheck` covers it
  - tests can run for it (Vitest preferred if it’s a web UI)
- Add minimal docs describing how OpenBoard is run in-dev within this monorepo.

### Out of scope

- Full feature transplant into the main UI (task-08).
- Any UI/UX redesign beyond getting it to run and compile.

### Assumptions

- OpenBoard is available locally and can be imported without network access (e.g., via filesystem copy or `git subtree`).

## 3) Files Touched (Expected)

- `apps/openboard/**` (new)
- Root `package.json` (optional: `typecheck:openboard`, `test:openboard`, `build:openboard`)
- Root docs (optional): `docs/openboard.md`
- Desktop (optional, minimal): add a build-time option to point the desktop shell at OpenBoard for dev testing.

## 4) Before / After

### Before

- OpenBoard exists only as an external repo; cannot be built/tested in the same CI gate as this monorepo.

### After

- OpenBoard is a workspace app that:
  - builds
  - typechecks
  - has tests wired into the repo’s quality gates

## 5) Tests-First Plan (Red → Green → Refactor)

### Unit tests

- If OpenBoard has existing tests, wire them into `bun run test`.
- If it has none, add a minimal smoke test for a key component/page without mocks.

### Integration tests

- Ensure the imported app can consume the orchestrator bridge client module (or a compatible adapter) using DI fakes.

### E2E tests

- Add a minimal browser smoke E2E (if the repo adopts Playwright in earlier tasks), verifying the app boots and renders a known heading.

Mocking policy:

- No module mocks; use DI and local test servers if needed.

## 6) Implementation Steps (Small, Reviewable)

1. Import OpenBoard source into `apps/openboard/` preserving its git history where feasible (subtree preferred; otherwise copy).
2. Normalize package tooling to match this monorepo (Bun + Vite + TypeScript + Vitest).
3. Wire scripts into root `package.json` so CI can run typecheck/test/build.
4. Add minimal smoke test(s) and ensure coverage for any newly created adapter modules is 100%.

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
  - (If applicable) `cd apps/openboard && bun run test -- --coverage`

## 8) Definition of Done

- [ ] OpenBoard exists as a workspace app and can build/typecheck/test
- [ ] Minimal tests exist (or existing tests are wired)
- [ ] Suggested commit message included

Suggested commit message: `chore(openboard): import as workspace app`

## 9) Deliverables

- `apps/openboard/` in-repo
- Root scripts updated to include OpenBoard in the quality gate

