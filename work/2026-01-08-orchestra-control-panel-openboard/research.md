# Research — Orchestra Control Panel + OpenBoard Integration

## 1) Repo Overview

- **Languages**: TypeScript (plugin + web app), Rust (Tauri desktop shell), a small amount of JS/TS scripts.
- **Runtime / tooling**:
  - **Bun** workspace + test runner (`bun.lock`, `package.json` workspaces).
  - **Biome** for lint/format (`biome.json`).
  - **Vite + SolidJS** for the control panel (`apps/control-panel`).
  - **Tauri** for the desktop wrapper (`apps/desktop`).
- **Key commands (repo root)**:
  - `bun run check` (audit + format:check + lint + typecheck + test + build)
  - `bun run test:unit` / `bun run test:integration` / `bun run test:e2e`
  - `bun run test:control-panel`
  - `bun run build`

## 2) Relevant Subsystem Map

### Primary directories/files (what matters for this work)

- **Orchestrator plugin (core)**
  - `packages/orchestrator/src/index.ts`: plugin entrypoint; loads config; installs hooks; registers Task API tools; bootstraps runtime and event publishing.
  - `packages/orchestrator/src/command/tasks.ts`: Task API (`task_start`, `task_await`, `task_peek`, `task_list`, `task_cancel`) and all task/workflow execution routing.
  - `packages/orchestrator/src/core/runtime.ts`: singleton runtime; starts bridge server; installs cleanup; job persistence; orphan cleanup.
  - `packages/orchestrator/src/core/bridge-server.ts`: HTTP bridge with SSE event streams:
    - `GET /v1/events` (orchestrator events stream; read is unauthenticated)
    - `POST /v1/events` (publish events; write is token-protected)
    - `GET /v1/stream` + `POST /v1/stream/chunk` (worker streaming)
  - `packages/orchestrator/src/core/orchestrator-events.ts`: typed event envelope and in-process emitter (`publishOrchestratorEvent`, `onOrchestratorEvent`).
  - `packages/orchestrator/src/core/jobs.ts`: in-memory async job registry (`workerJobs`) used by `task_*`.
  - `packages/orchestrator/src/core/logger.ts`: in-memory log buffer queried by `task_list --view output`.
  - `packages/orchestrator/src/core/worker-pool.ts`: worker lifecycle; file-based “device registry” for cross-session persistence; emits `orchestra.worker.status` events.
  - `packages/orchestrator/src/workflows/*`: workflow registry/engine/runner; emits `orchestra.workflow.*` events.

- **Control panel app (web UI used by desktop)**
  - `apps/control-panel/src/app.tsx`: app shell + routes.
  - `apps/control-panel/src/context/opencode.tsx`: connects to OpenCode server via `@opencode-ai/sdk/client` and subscribes to OpenCode events; also subscribes to orchestrator bridge SSE (`/v1/events`).
  - `apps/control-panel/src/context/opencode-actions.ts`: client-side “store reducer” style actions; merges orchestrator events into UI state.
  - `apps/control-panel/src/context/orchestrator-events.ts`: orchestrator SSE subscription with an explicit allowlist of event types.
  - `apps/control-panel/src/pages/*`: dashboard/workflows/memory/config/chat/skills/settings.

- **Desktop wrapper (Tauri)**
  - `apps/desktop/src/index.tsx`: renders `@opencode-ai/app` (the control panel) in Tauri.
  - `apps/desktop/src-tauri/src/lib.rs`: spawns an OpenCode sidecar and injects `window.__OPENCODE__.*` including:
    - `baseUrl` (OpenCode server)
    - `skillsBase` (skills/agents/db API)
    - `orchestratorEventsUrl` (bridge server base; UI appends `/v1/events`)

### Call-flow (today)

- **Control panel → OpenCode data**
  - `apps/control-panel` → `createOpencodeClient()` → OpenCode server (`/v1/*`) → `client.event.subscribe()` stream → `actions.pushEvent()`.

- **Control panel → Orchestrator events**
  - `apps/control-panel` → `EventSource(orchestratorEventsUrl + "/v1/events")` → SSE frames → `parseOrchestratorEvent()` → `actions.handleOrchestratorEvent()` updates workers/workflowRuns/skillEvents/streams.

- **Creating orchestrator tasks (today)**
  - Control panel uses `client.session.command({ command: "task_start", arguments: ... })` (see `apps/control-panel/src/pages/workflows.tsx`).
  - The orchestrator tool implementation in `packages/orchestrator/src/command/tasks.ts`:
    - creates a job in `workerJobs` (async task registry)
    - runs either:
      - **workflow** (`runWorkflowWithContext` / `continueWorkflowWithContext`)
      - **worker** (`sendToWorker` after ensuring worker exists/spawned)
      - **op** (memory + model ops)
    - emits orchestrator events (`orchestra.workflow.*`, `orchestra.worker.stream`, etc)

### Dependency edges (relevant)

- `apps/control-panel` → `@opencode-ai/sdk/client` (browser client), `solid-js`, `@solidjs/router`, `tailwindcss`, `vitest`.
- `apps/desktop` → `@opencode-ai/app` (workspace:*), Tauri plugins.
- `packages/orchestrator` → `@opencode-ai/plugin`, `@opencode-ai/sdk`, `neo4j-driver`, `posthog-node`.

## 3) Data / State / IO

### Network / endpoints

- **OpenCode server**: default `http://localhost:4096` (control panel overrides via `window.__OPENCODE__.baseUrl` or query params).
- **Skills/agents/db API**: default `http://localhost:4097` (control panel uses `skillsBase`).
- **Orchestrator bridge server** (started by `packages/orchestrator/src/core/runtime.ts`):
  - `GET /v1/events` (SSE; unauthenticated read)
  - `POST /v1/events` (token-protected write; used for cross-process event publishing)
  - `GET /v1/stream` (SSE for worker stream chunks)
  - `POST /v1/stream/chunk` (token-protected; workers push stream chunks)
  - `GET /health` (health check)

### Persistent state / files

- **Device registry (workers + sessions)**: `~/.config/opencode/orchestrator-device-registry.json`
  - Implemented in `packages/orchestrator/src/core/worker-pool.ts` (`getDeviceRegistryPath`, `upsertWorkerEntry`, `upsertSessionEntry`).
  - Used for cross-session reuse and orphan cleanup.
- **Jobs persistence**: `.opencode/orchestra/jobs.json`
  - Implemented in `packages/orchestrator/src/core/jobs-persistence.ts`.
  - Restores “running” jobs as failed after crash (`restoreRunningJobs`).
- **Boomerang workflow run bundles**: `packages/orchestrator/test-runs/run-*/` (E2E outputs; gitignored).

### External IO / integrations

- **Neo4j (optional memory graph)**:
  - Env: `OPENCODE_NEO4J_URI`, `OPENCODE_NEO4J_USERNAME`, `OPENCODE_NEO4J_PASSWORD`, optional `OPENCODE_NEO4J_DATABASE`.
  - Used by `packages/orchestrator/src/memory/*` and Task API memory ops in `packages/orchestrator/src/command/tasks.ts`.
- **Telemetry (PostHog)**:
  - Initialized in `packages/orchestrator/src/index.ts` via `initTelemetry(...)`.

### Configuration

- **Orchestrator config discovery**: `packages/orchestrator/src/config/orchestrator.ts`
  - Prefers `.opencode/orchestrator.json` + `.opencode/orchestrator.local.json`.
  - Supports legacy `orchestrator.json` + `orchestrator.local.json`.
- **Bridge server env**: `OPENCODE_ORCH_BRIDGE_PORT`, `OPENCODE_ORCH_BRIDGE_HOST` (see `packages/orchestrator/src/core/bridge-server.ts`).
- **Desktop env**: `OPENCODE_DESKTOP_PLUGIN_PATH` (see `apps/desktop/src-tauri/src/lib.rs`).
- **E2E env**: `OPENCODE_ORCH_E2E_MODEL` (see `docs/testing.md`).

### Notable risks found in-code

- **Schema drift**: `packages/orchestrator/schema/orchestrator.schema.json` does not describe `tasks.persist` and `tasks.jobs`, but the loader (`packages/orchestrator/src/config/orchestrator.ts`) and runtime (`packages/orchestrator/src/core/runtime.ts`) support them.
- **Missing referenced doc**: `packages/orchestrator/package.json` lists `HEADLESS_TESTING.md` in `files`, but the file is not present in this workspace.

## 4) Test Landscape

- **Plugin tests (Bun)**: `packages/orchestrator/test/`
  - Unit: `packages/orchestrator/test/unit/*`
  - Integration: `packages/orchestrator/test/integration/*` (includes bridge server tests)
  - E2E: `packages/orchestrator/test/e2e/*` (requires `opencode` CLI + model)
- **Control panel tests (Vitest + jsdom)**:
  - Currently minimal: `apps/control-panel/src/context/__tests__/agents-context.test.tsx`.

### Coverage & realism gaps (for this work)

- Orchestrator core is well-tested; however, **UI-side correctness** (event parsing, subscription, task creation flows) is under-tested.
- Existing UI tests rely on local fakes; expansion should continue via **dependency injection** (no module mocks) using:
  - injected `fetch`/`EventSource`/clock
  - real in-process HTTP servers for integration tests where needed
- There is **no browser-level E2E** for the control panel today.

## 5) Assumptions

- **OpenBoard repo availability**: a local git repo named `openboard` exists on this device; its location is unknown from inside this workspace. Integration will be done by importing/copying its contents into this monorepo without network access.
- **Workflow bundle output path**: the instruction requests `/work/...`, but this environment does not have an absolute `/work` mount; the bundle is created under `work/...` at repo root.
- **Directory rename (“opencode-boomerang” → “orchestra”)**: the actual folder rename is outside git scope; the work here updates in-repo references (docs/tests/examples) and provides a safe rename procedure.

