# Migration Map (Phase 0)

## High-Level Moves (completed)

- `src/config/orchestrator.ts` -> `src/config/orchestrator/*` (split)
- `src/workers/spawner.ts` -> `src/workers/spawn.ts` + `src/workers/manager.ts`
- `src/core/worker-pool.ts` -> `src/workers/registry.ts`
- `src/core/jobs.ts` -> `src/workers/jobs.ts`
- `src/ux/vision-router.ts` -> `src/vision/*`
- `src/supervisor/server.ts` -> removed (SDK events first)
- `src/core/bridge-server.ts` + `src/worker-bridge-plugin.mjs` -> removed

## Deletions (completed)

- `src/worker-bridge-plugin.mjs` (custom streaming plugin)
- `src/core/bridge-server.ts` (custom SSE server)
- `src/core/stream-events.ts` (custom stream store)
- `src/supervisor/server.ts` (custom worker supervisor API)
- Any direct `createOpencodeClient` usage outside `src/api/*`

## Directory Additions (target)

- `src/api/`
- `src/communication/`
- `src/orchestrator/`

## Notes

- All moves must keep file size limits: core/runtime <= 350 LOC, feature <= 300 LOC, docs <= 250 LOC.
- Delete old files immediately after a replacement is wired and tested.
- Keep tests real-data only; run against live `opencode serve`.
