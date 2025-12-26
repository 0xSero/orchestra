# Runtime Build/Test Profiling Report (2025-12-26 12:07 EST)

## Environment
- Host: macbookpro.home
- OS: macOS 26.0 (Build 25A5338b), Darwin 25.0.0 arm64
- CPU: Apple M1 Max
- Memory: 32 GB (34359738368 bytes)
- Toolchain: bun 1.3.4, node v23.6.0
- Workspace: /Users/sero/opencode-boomerang

## Install + Build Timings

### Root / Orchestra
- `bun run build`: 0.163s total
  - Bundled 519 modules; dist `index.js` size 1.70 MB
- `bun run typecheck`: 1.609s total
- `bun test` (with `.env` exported for Neo4j): 96.55s total
  - 46 pass / 0 fail across 28 files
  - 0 skipped

### App (control panel)
- `bun run typecheck`: 1.788s total
- `bun run test`: 1.617s total
  - 1 pass / 0 fail
  - 0 skipped
- `bun run build`: 1.704s total
  - Output: `dist/index.html` 0.99 kB (gzip 0.51 kB)
  - Output: `dist/assets/index-BBGcaKIf.css` 32.58 kB (gzip 6.25 kB)
  - Output: `dist/assets/index-CHolZh4J.js` 178.79 kB (gzip 54.12 kB; map 776.59 kB)

## Runtime Verification Notes
- Worker-bridge plugin now resolves to local paths to avoid `bun` install failures.
- E2E tests cover multiagent spawning, workflows, and vision routing against live workers.
- Neo4j integration verified against local container at `bolt://localhost:7687`.

## Warnings/Errors
- None observed in this run.
