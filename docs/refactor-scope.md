# OpenCode-Aligned Refactor Scope

## Goals

- Standardize factories (`createX`) across core, API, communication, workers, memory, workflows, tools, orchestrator.
- Replace custom transport/streaming with OpenCode SDK events.
- Unify worker lifecycle, job lifecycle, and model selection into one worker manager.
- Delete duplicated or obsolete components as soon as replacements are wired.
- Reduce total code size by ~40% without breaking behavior.

## Non-Negotiables

- No module-level globals for runtime config.
- All IO goes through `src/api/` or `src/communication/`.
- Prefer OpenCode SDK + server endpoints before custom servers.
- Real-data tests only (no mocking).
- Enforce file size limits (split early and often).

## Target Topology (under `src/`)

- `orchestrator/`  - orchestration and session routing
- `memory/`        - memory store, inject, trim
- `workflows/`     - workflow engine + built-ins
- `workers/`       - worker lifecycle + profiles
- `tools/`         - OpenCode tool adapters + hooks
- `communication/` - SDK event subscribe + adapters
- `api/`           - OpenCode SDK client wrapper
- `core/`          - dependency container + lifecycle
- `docs/`          - runbooks and architecture notes (root docs)

## Standard Factory Shape

```
export type Factory<TConfig, TDeps, TService> = (input: {
  config: TConfig;
  deps: TDeps;
}) => TService;
```

All services must expose:
- `start(): Promise<void>`
- `stop(): Promise<void>`
- `health(): Promise<{ ok: boolean; info?: any }>`

## Known Distractions Removed

- Custom bridge server + worker streaming plugin
- Custom supervisor HTTP server
- Legacy worker-pool/spawner/client stack

## Phased Scope (repo-specific)

### Phase 0: Inventory and Guardrails

- Map `src/` modules to target topology.
- Identify oversized files and split plan.
- Define deletion list and ordering.
- Validate OpenCode server connectivity (real data).

### Phase 1: API Layer Standardization

- Add `src/api/` wrapper for `createOpencodeClient` and `createOpencode`.
- Replace direct SDK usage in `src/workers/*`, `src/core/*`.

### Phase 2: Communication and Events

- `src/communication/` wraps `client.event.subscribe()`.
- Custom bridge server + worker streaming plugin removed.

### Phase 3: Worker Manager (single factory)

- `createWorkerManager()` owns spawn/send/stop/health/job.
- Old worker-pool/client/spawner removed.

### Phase 4: Memory Isolation

- Move memory injection/record/search/trim into `src/memory/*` factories.
- Ensure injection uses `client.session.prompt({ noReply: true })`.

### Phase 5: Workflow Engine

- Keep workflows pure; only call worker manager + tools.
- Remove direct SDK calls from workflows.

### Phase 6: Tools and Plugin Wiring

- Move tools into small files under `src/tools/`.
- Implement `tool.execute.before` and compaction hook.
- Tools call API/Workers/Memory only.

### Phase 7: Orchestrator + Core Assembly

- `createCore()` wires all factories and lifecycle.
- Orchestrator is coordination only; no IO.

### Phase 8: Docs + Runbooks

- Split oversized docs to meet limits.
- Add runbooks for real-data testing and server ops.

## Remaining Cleanup

- Split oversized docs to meet limits.
- Finish frontend wiring to OpenCode SDK (remove supervisor client/proxy).
