# Task 09 — Model-Aware Worker Reuse + Force-New Spawn

## Goal

Prevent accidental reuse of workers when the requested model (or model policy) differs from the running worker’s configuration, and enable an explicit “force new” path.

## Why this task exists

Today, server worker reuse is keyed only by `workerId` and liveness, not by model identity:

- If a user changes a worker’s model, a previously spawned process can be reused silently.
- This blocks dynamic switching unless the worker is forcibly restarted.

## Before (current state)

- Reuse logic ignores model identity:
  - `packages/orchestrator/src/core/worker-pool.ts:269` (tryReuseFromDeviceRegistry)
  - `packages/orchestrator/src/core/worker-pool.ts:278` (candidate filter)
  - `packages/orchestrator/src/core/worker-pool.ts:350` (modelResolution: "reused existing worker")
- A `forceNew` option exists in server backend typing but is not enforced in the pool:
  - `packages/orchestrator/src/workers/backends/server.ts:23` (SpawnOptionsWithForce)
  - `packages/orchestrator/src/workers/backends/server.ts:33` (getOrSpawn call)

## After (expected state)

- Device registry stores a model fingerprint (at least `resolvedModel` and policy).
- Reuse only happens when:
  - workerId matches
  - process is alive
  - model fingerprint matches the requested/default model
- Callers can bypass reuse via `forceNew: true`.

## Implementation steps

1. Extend device registry worker entry schema to record model identity (and policy if needed).
2. Update `updateDeviceRegistry(...)` to write these fields.
3. Update `tryReuseFromDeviceRegistry(...)` to validate compatibility before reusing.
4. Thread `forceNew` through to `WorkerPool.getOrSpawn(...)` and skip reuse checks when set.
5. Add tests for:
   - reuse allowed when model matches
   - reuse blocked when model differs
   - forceNew bypass works

## Verification (must pass before proceeding)

```bash
bun run lint
bun run typecheck
bun run test:e2e
bun run build
```

Do not proceed until all commands pass and any task-introduced warnings/errors are eliminated.

## Git (must do before proceeding)

```bash
git add packages/orchestrator/src/core/worker-pool.ts packages/orchestrator/src/workers/backends/server.ts packages/orchestrator/test/unit/
git commit -m "fix(orchestrator): make worker reuse model-aware and support forceNew"
git push origin main
```

## Completion record (fill in when done)

- Commit: `HEAD`
- After references (update with final line numbers):
  - `packages/orchestrator/src/core/worker-pool.ts:315`
  - `packages/orchestrator/src/workers/backends/server.ts:149`
