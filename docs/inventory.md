# Refactor Inventory (Phase 0)

## Current Topology (key sources)

- `src/index.ts` - plugin entrypoint
- `src/config/` - orchestrator + OpenCode config parsing/merging
- `src/core/` - dependency container + spawn policy + jobs
- `src/workers/` - worker manager, registry, spawn, attachments, prompt shaping
- `src/tools/` - tool definitions + orchestration adapters
- `src/workflows/` - workflow engine + built-ins
- `src/memory/` - memory store + injection + backends
- `src/ux/` - repo context helpers
- `src/vision/` - vision analyzer + extraction + formatting + progress
- `src/models/` - model selection + catalog
- `src/profiles/` - built-in profiles + discovery
- `src/permissions/` - tool permission rules

## Mapping to Target Topology (under `src/`)

- `api/`
  - From: `src/models/*`, `src/config/opencode.ts`
  - Goal: central SDK client + server wrapper + model/provider access
- `communication/`
  - Goal: SDK `client.event.subscribe()` first; retire custom bridge/SSE
- `workers/`
  - From: `src/workers/*`
  - Goal: single worker factory + registry + job lifecycle
- `orchestrator/`
  - From: `src/index.ts`, parts of `src/tools/*`
  - Goal: orchestration only (no IO), routing/policy
- `memory/`
  - From: `src/memory/*`, `src/integrations/*`
  - Goal: record/search/inject/trim behind interface
- `workflows/`
  - From: `src/workflows/*`
  - Goal: pure orchestration over workers/tools
- `tools/`
  - From: `src/tools/*`, `src/permissions/*`
  - Goal: thin adapters using API/workers/memory
- `core/`
  - Goal: dependency container + lifecycle only
- `docs/`
  - From: `docs/*`
  - Goal: split oversized docs, keep under limits

## Oversized Files to Split (over limits)

- `docs/architecture.md` (~528 LOC)
- `docs/configuration.md` (~595 LOC)
- `docs/examples.md` (~538 LOC)
