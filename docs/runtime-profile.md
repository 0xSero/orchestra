# Runtime Build/Test Profiling Report (2025-12-26 05:38 EST)

## Environment
- Host: macbookpro.home
- OS: macOS 26.0 (Build 25A5338b), Darwin 25.0.0 arm64
- CPU: Apple M1 Max
- Memory: 32 GB (34359738368 bytes)
- Toolchain: bun 1.3.4, node v23.6.0
- Workspace: /Users/sero/opencode-boomerang

## Install + Build Timings

### Root / Orchestra
- `bun install`: 0.07s real (no changes)
- `bun run build`: 0.77s real
  - Bundled 528 modules; dist `index.js` size 1.69 MB
- `bun run typecheck`: 1.50s real (failed; see errors)
- `bun run test`: 16.89s real
  - 30 pass / 2 skip / 8 fail across 40 tests in 28 files

### App
- `bun install`: 0.02s real (no changes)
- `bun run typecheck`: 1.95s real (failed; see errors)
- `bun run test`: 1.91s real
  - 1 test passed (skills context)
- `bun run build`: 1.98s real
  - Output: `dist/index.html` 0.99 kB (gzip 0.50 kB)
  - Output: `dist/assets/index-BKImdcub.css` 28.07 kB (gzip 5.68 kB)
  - Output: `dist/assets/index-0dwIRADe.js` 156.82 kB (gzip 49.73 kB; map 716.82 kB)
  - Warning: Node ExperimentalWarning: Type Stripping

## Orchestrator Workflow Profiling

Manual benchmark run (two-step workflow) using `opencode/gpt-5-nano`:
- Worker spawn: 1182.67 ms
- Workflow total: 5204.51 ms
- Step timings:
  - `step-1` (Ping): 3275 ms
  - `step-2` (Pong): 1929 ms
- End-to-end wall time (including process overhead): 6.55s real

## Typecheck Errors

### Orchestra (`bun run typecheck`)
- `orchestra/src/api/skills-router.ts`: `ResponseLike` declared but never used
- `orchestra/src/core/container.ts`: SDK client type mismatch (`@opencode-ai/sdk` 1.0.164 vs 1.0.201)
- `orchestra/src/core/container.ts`: implicit `any` for `input`, `output`
- `orchestra/src/core/container.ts`: `CommunicationService.emit` signature mismatch with `VisionRoutingDeps`
- `orchestra/src/db/index.ts`: unused `PreferenceRow`, `rowToPreference`
- `orchestra/src/skills/crud.ts`: `description` optional vs required in `SkillFrontmatter`

### App (`bun run typecheck`)
- `app/src/components/skills/fields/permissions-config.tsx`: string literal arguments not assignable to `never`
- `app/src/context/opencode.tsx`: `parts` array not assignable to SDK part inputs (`type` string vs literal)
- `app/src/pages/dashboard.tsx`: unused `useLayout`

## Test Failures

### Orchestra (`bun run test`)
All 8 failures share the same root error:
- `BunInstallFailedError` with `pkg` set to `orchestra/scripts/worker-bridge-plugin.mjs` during worker spawn/session creation

Failing tests:
- `test/e2e-multiagent.test.ts` (multiagent)
- `test/vision-routing.test.ts` (vision worker integration)
- `test/workflows.test.ts` (workflow engine integration)
- `test/integration/worker-spawn-send.test.ts`
- `test/integration/workflow-run.test.ts`
- `test/integration/builtin-workflows.test.ts`
- `test/integration/permissions.test.ts`
- `test/integration/spawn/auto-spawn-limits.test.ts` (delegateTask integration)

Skipped tests:
- `test/integration/linear-real.test.ts` (needs LINEAR_API_KEY + LINEAR_TEAM_ID)
- `test/integration/neo4j-real.test.ts` (needs Neo4j config)

## Notes + Observations
- Integration tests that spawn workers failed due to the worker-bridge plugin install error.
- Manual workflow benchmark succeeded in this environment, suggesting the OpenCode runtime is functional but test setup is hitting a plugin install path issue.
- App build completed successfully despite app typecheck errors.

