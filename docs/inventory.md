# File Inventory

Snapshot map of Open Orchestra. For deeper behavioral flow, see `docs/primitives.md`.

## Repository Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Monorepo Architecture                           │
└─────────────────────────────────────────────────────────────────────┘

opencode-boomerang/
├── orchestra/                 # Backend (Node.js/Bun plugin)
│   └── src/                   # TypeScript source
├── app/                       # Frontend (Solid.js control panel)
│   └── src/                   # TypeScript + JSX source
├── desktop/                   # Desktop shell (Tauri wrapper)
│   ├── src/                   # Desktop frontend entry
│   └── src-tauri/             # Tauri backend
├── docs/                      # Documentation
└── test/                      # Test suites
```

---

## Backend: `orchestra/src/`

### Directory Tree

```
orchestra/src/
├── index.ts                   # Plugin entrypoint
├── api/                       # OpenCode SDK wrapper
├── commands/                  # Slash command handlers
├── communication/             # Event system
├── config/                    # Configuration parsing
├── core/                      # Service container
├── db/                        # SQLite persistence + overrides
├── helpers/                   # Utility functions
├── integrations/              # External services
├── memory/                    # Memory store
├── models/                    # Model selection
├── orchestrator/              # Task routing
├── permissions/               # Tool permissions
├── profiles/                  # Profile discovery
├── tools/                     # OpenCode tool hooks
├── types/                     # TypeScript types
├── ux/                        # User experience
├── workers/                   # Worker management
└── workflows/                 # Workflow engine
```

---

### Main Module Map

| Module | Purpose | Key files |
| --- | --- | --- |
| `api/` | OpenCode SDK wrapper + HTTP routers (skills/sessions/db). | `orchestra/src/api/index.ts`, `orchestra/src/api/skills-server.ts`, `orchestra/src/api/db-router.ts`, `orchestra/src/api/sessions-router.ts` |
| `commands/` | Slash command router and handlers. | `orchestra/src/commands/index.ts`, `orchestra/src/commands/orchestrator.ts`, `orchestra/src/commands/vision.ts`, `orchestra/src/commands/memory.ts` |
| `communication/` | Internal event bus and payload typing. | `orchestra/src/communication/index.ts`, `orchestra/src/communication/events.ts` |
| `config/` | Orchestrator config loading, defaults, inheritance. | `orchestra/src/config/orchestrator.ts`, `orchestra/src/config/orchestrator/defaults.ts`, `orchestra/src/config/profile-inheritance.ts` |
| `core/` | Service container and lifecycle wiring. | `orchestra/src/core/container.ts`, `orchestra/src/core/index.ts` |
| `db/` | SQLite persistence + per-worker overrides. | `orchestra/src/db/index.ts`, `orchestra/src/db/schema.ts`, `orchestra/src/db/overrides.ts` |
| `helpers/` | Shared utility helpers. | `orchestra/src/helpers/format.ts`, `orchestra/src/helpers/fs.ts`, `orchestra/src/helpers/advanced-util.ts` |
| `integrations/` | External integration adapters. | `orchestra/src/integrations/linear.ts` |
| `memory/` | Memory store, inject, and graph backends. | `orchestra/src/memory/index.ts`, `orchestra/src/memory/store.ts`, `orchestra/src/memory/inject.ts` |
| `models/` | Model selection, resolution, and capabilities. | `orchestra/src/models/resolver.ts`, `orchestra/src/models/catalog.ts`, `orchestra/src/models/hydrate.ts` |
| `orchestrator/` | Task routing and workflow dispatch. | `orchestra/src/orchestrator/index.ts`, `orchestra/src/orchestrator/router.ts` |
| `permissions/` | Tool permission schema + validation. | `orchestra/src/permissions/schema.ts`, `orchestra/src/permissions/validator.ts` |
| `profiles/` | Profile discovery helpers. | `orchestra/src/profiles/discovery.ts` |
| `skills/` | SKILL.md parsing, loading, CRUD, validation. | `orchestra/src/skills/loader.ts`, `orchestra/src/skills/parse.ts`, `orchestra/src/skills/service.ts` |
| `tools/` | Tool hooks + guards for OpenCode. | `orchestra/src/tools/index.ts`, `orchestra/src/tools/hooks.ts` |
| `types/` | Shared config + runtime types. | `orchestra/src/types/config.ts`, `orchestra/src/types/worker.ts`, `orchestra/src/types/skill.ts` |
| `ux/` | Repo context + vision routing helpers. | `orchestra/src/ux/repo-context.ts`, `orchestra/src/ux/vision-routing.ts` |
| `workers/` | Worker lifecycle (spawn/send/jobs/registry). | `orchestra/src/workers/manager.ts`, `orchestra/src/workers/spawn.ts`, `orchestra/src/workers/send.ts` |
| `workflows/` | Workflow engine and built-in definitions. | `orchestra/src/workflows/factory.ts`, `orchestra/src/workflows/builtins.ts` |

---

## Module Map

### Core Modules

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Core Modules                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  index.ts                                                    │    │
│  │  Plugin entrypoint, exports OrchestratorPlugin               │    │
│  │  LOC: ~50                                                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                              ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  core/container.ts                                           │    │
│  │  Service container, dependency wiring                        │    │
│  │  Creates: api → comm → memory → workers → workflows → orch   │    │
│  │  LOC: ~200                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                       │
│                              ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  core/index.ts                                               │    │
│  │  Exports createCore factory                                  │    │
│  │  LOC: ~10                                                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  core/spawn-policy.ts                                        │    │
│  │  Spawn policy evaluation (auto, manual, on-demand)           │    │
│  │  LOC: ~80                                                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  core/jobs.ts                                                │    │
│  │  Job queue types and utilities                               │    │
│  │  LOC: ~50                                                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

### API Module

```
┌─────────────────────────────────────────────────────────────────────┐
│                           api/                                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  api/index.ts                                                │    │
│  │  OpenCode SDK wrapper with withDirectory()                   │    │
│  │                                                              │    │
│  │  Exports:                                                    │    │
│  │  - ApiService interface                                      │    │
│  │  - createApiService factory                                  │    │
│  │                                                              │    │
│  │  Wraps:                                                      │    │
│  │  - session.create/prompt/cancel                              │    │
│  │  - event.subscribe                                           │    │
│  │  - tui.publish                                               │    │
│  │  - project.current                                           │    │
│  │  - health                                                    │    │
│  │                                                              │    │
│  │  LOC: ~150                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Communication Module

```
┌─────────────────────────────────────────────────────────────────────┐
│                       communication/                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  communication/index.ts                                      │    │
│  │  Event bus service for inter-component messaging             │    │
│  │  LOC: ~100                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  communication/events.ts                                     │    │
│  │  Event type constants and payloads                           │    │
│  │  LOC: ~50                                                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Event Flow:                                                         │
│  ┌──────────┐    emit()    ┌──────────┐    publish()  ┌──────────┐  │
│  │  Worker  │─────────────▶│ EventBus │──────────────▶│ SSE/TUI  │  │
│  │ Manager  │              │          │               │ Frontend │  │
│  └──────────┘              └──────────┘               └──────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Config Module

```
┌─────────────────────────────────────────────────────────────────────┐
│                          config/                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  config/orchestrator.ts                                      │    │
│  │  Main config loading, merges project + global + defaults     │    │
│  │  LOC: ~150                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌───────────────────────────────────────┐                          │
│  │  config/orchestrator/                 │                          │
│  ├───────────────────────────────────────┤                          │
│  │  parse.ts       Parses JSON config    │                          │
│  │  parse-extra.ts Memory/integrations   │                          │
│  │  defaults.ts    Default values        │                          │
│  │  paths.ts       Config file paths     │                          │
│  └───────────────────────────────────────┘                          │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  config/opencode.ts                                          │    │
│  │  OpenCode config integration (agents, commands)              │    │
│  │  LOC: ~100                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  config/profiles.ts                                          │    │
│  │  Compatibility re-export (built-ins now empty)               │    │
│  │  LOC: ~5                                                     │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  config/profile-inheritance.ts                               │    │
│  │  Profile extends/compose resolution                          │    │
│  │  LOC: ~150                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Commands Module

```
┌─────────────────────────────────────────────────────────────────────┐
│                          commands/                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  commands/index.ts                                           │    │
│  │  Command router + parsing utilities                          │    │
│  │  LOC: ~150                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  commands/orchestrator.ts                                    │    │
│  │  /orchestrator.* commands (status/spawn/demo/onboard)        │    │
│  │  LOC: ~450                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  commands/vision.ts                                          │    │
│  │  /vision.analyze command                                     │    │
│  │  LOC: ~100                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  commands/memory.ts                                          │    │
│  │  /memory.record + /memory.query                              │    │
│  │  LOC: ~200                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Database Module

```
┌─────────────────────────────────────────────────────────────────────┐
│                              db/                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  db/index.ts                                                 │    │
│  │  SQLite lifecycle + preferences + worker overrides           │    │
│  │  LOC: ~250                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  db/schema.ts                                                │    │
│  │  SQLite schema + row adapters                                │    │
│  │  LOC: ~150                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  db/overrides.ts                                             │    │
│  │  Apply SQLite worker overrides to profiles                   │    │
│  │  LOC: ~50                                                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Workers Module

```
┌─────────────────────────────────────────────────────────────────────┐
│                          workers/                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  workers/index.ts                                            │    │
│  │  Exports WorkerManager factory                               │    │
│  │  LOC: ~10                                                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  workers/manager.ts                                          │    │
│  │  Central worker lifecycle management                         │    │
│  │  spawn/stop/send/listWorkers                                 │    │
│  │  LOC: ~250                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  workers/registry.ts                                         │    │
│  │  In-memory worker instance storage                           │    │
│  │  LOC: ~100                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  workers/spawn.ts                                            │    │
│  │  Process spawning for opencode serve                         │    │
│  │  LOC: ~200                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  workers/send.ts                                             │    │
│  │  Message sending to workers                                  │    │
│  │  LOC: ~150                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  workers/jobs.ts                                             │    │
│  │  Async job queue for worker tasks                            │    │
│  │  LOC: ~150                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  workers/prompt.ts                                           │    │
│  │  Prompt shaping and attachments                              │    │
│  │  LOC: ~100                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  workers/attachments.ts                                      │    │
│  │  Image/file attachment handling                              │    │
│  │  LOC: ~80                                                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Worker Profiles

```
┌─────────────────────────────────────────────────────────────────────┐
│                    workers/profiles/                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  index.ts          Profile registry exports                          │
│                                                                      │
│  ┌─────────────────────────────────────────┐                        │
│  │  Built-in Profiles (~50 LOC each)       │                        │
│  ├─────────────────────────────────────────┤                        │
│  │  analyst/profile.ts     Data analysis   │                        │
│  │  architect/profile.ts   System design   │                        │
│  │  coder/profile.ts       Implementation  │                        │
│  │  docs/profile.ts        Documentation   │                        │
│  │  explorer/profile.ts    Codebase nav    │                        │
│  │  memory/profile.ts      Context mgmt    │                        │
│  │  product/profile.ts     Product specs   │                        │
│  │  qa/profile.ts          Testing         │                        │
│  │  reviewer/profile.ts    Code review     │                        │
│  │  security/profile.ts    Security audit  │                        │
│  │  vision/profile.ts      Image analysis  │                        │
│  └─────────────────────────────────────────┘                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Orchestrator Module

```
┌─────────────────────────────────────────────────────────────────────┐
│                        orchestrator/                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  orchestrator/index.ts                                       │    │
│  │  Main orchestration service                                  │    │
│  │  ensureWorker, delegateTask, runWorkflow                     │    │
│  │  LOC: ~150                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  orchestrator/router.ts                                      │    │
│  │  Task routing via keywords, tags, vision detection           │    │
│  │  LOC: ~100                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Routing Flow:                                                       │
│  ┌─────────┐    ┌─────────────┐    ┌──────────────┐                 │
│  │  Task   │───▶│ selectWorker│───▶│ Best Match   │                 │
│  │ + Attach│    │  (router)   │    │  Worker ID   │                 │
│  └─────────┘    └─────────────┘    └──────────────┘                 │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Memory Module

```
┌─────────────────────────────────────────────────────────────────────┐
│                          memory/                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  memory/index.ts                                             │    │
│  │  Memory service factory, inject/record                       │    │
│  │  LOC: ~140                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  memory/store.ts                                             │    │
│  │  Abstract store interface                                    │    │
│  │  LOC: ~50                                                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  memory/store-file.ts                                        │    │
│  │  File-based memory store                                     │    │
│  │  LOC: ~150                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  memory/neo4j.ts                                             │    │
│  │  Neo4j connection and config loading                         │    │
│  │  LOC: ~80                                                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  memory/graph.ts                                             │    │
│  │  Neo4j graph operations                                      │    │
│  │  LOC: ~200                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  memory/inject.ts                                            │    │
│  │  Memory injection into prompts                               │    │
│  │  LOC: ~120                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  memory/auto.ts                                              │    │
│  │  Automatic message recording                                 │    │
│  │  LOC: ~100                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  memory/text.ts                                              │    │
│  │  Text processing utilities                                   │    │
│  │  LOC: ~50                                                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌───────────────────────────────────────┐                          │
│  │  memory/graph/                        │                          │
│  ├───────────────────────────────────────┤                          │
│  │  shared.ts    Shared graph utilities  │                          │
│  │  trim.ts      Graph trimming logic    │                          │
│  └───────────────────────────────────────┘                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Workflows Module

```
┌─────────────────────────────────────────────────────────────────────┐
│                         workflows/                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  workflows/index.ts                                          │    │
│  │  Exports workflow factory                                    │    │
│  │  LOC: ~10                                                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  workflows/factory.ts                                        │    │
│  │  WorkflowEngine service creation                             │    │
│  │  LOC: ~200                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  workflows/engine.ts                                         │    │
│  │  Core workflow execution logic                               │    │
│  │  LOC: ~150                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  workflows/roocode-boomerang.ts                              │    │
│  │  Boomerang workflow implementation                           │    │
│  │  LOC: ~200                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  workflows/builtins.ts                                       │    │
│  │  Built-in workflow definitions                               │    │
│  │  LOC: ~100                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  workflows/types.ts                                          │    │
│  │  Workflow type definitions                                   │    │
│  │  LOC: ~50                                                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Tools Module

```
┌─────────────────────────────────────────────────────────────────────┐
│                           tools/                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  tools/index.ts                                              │    │
│  │  ToolsService factory, exports all tools                     │    │
│  │  LOC: ~100                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  tools/worker-tools.ts                                       │    │
│  │  Worker management tools:                                    │    │
│  │  - spawn_worker                                              │    │
│  │  - stop_worker                                               │    │
│  │  - list_workers                                              │    │
│  │  - list_profiles                                             │    │
│  │  - ask_worker                                                │    │
│  │  - ask_worker_async                                          │    │
│  │  - await_worker_job                                          │    │
│  │  - delegate_task                                             │    │
│  │  LOC: ~300                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  tools/workflow-tools.ts                                     │    │
│  │  Workflow execution tools:                                   │    │
│  │  - run_workflow                                              │    │
│  │  LOC: ~100                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  tools/hooks.ts                                              │    │
│  │  OpenCode plugin hooks                                       │    │
│  │  LOC: ~80                                                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Types Module

```
┌─────────────────────────────────────────────────────────────────────┐
│                           types/                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  types/index.ts                                              │    │
│  │  Re-exports all types                                        │    │
│  │  LOC: ~20                                                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  types/factory.ts                                            │    │
│  │  Factory<Config, Deps, Service> pattern                      │    │
│  │  ServiceLifecycle interface                                  │    │
│  │  LOC: ~30                                                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  types/config.ts                                             │    │
│  │  OrchestratorConfig interface                                │    │
│  │  LOC: ~160                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  types/worker.ts                                             │    │
│  │  WorkerProfile, WorkerInstance, Registry                    │    │
│  │  LOC: ~110                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  types/events.ts                                             │    │
│  │  Event payloads and types                                    │    │
│  │  LOC: ~80                                                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  types/memory.ts                                             │    │
│  │  MemoryConfig type                                           │    │
│  │  LOC: ~35                                                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  types/workflow.ts                                           │    │
│  │  WorkflowsConfig, SecurityConfig                             │    │
│  │  LOC: ~35                                                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  types/permissions.ts                                        │    │
│  │  ToolPermissions type                                        │    │
│  │  LOC: ~20                                                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  types/integrations.ts                                       │    │
│  │  Neo4j, Linear, Monitoring config types                      │    │
│  │  LOC: ~40                                                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  types/skill.ts                                              │    │
│  │  Future: SKILL.md parsing types                              │    │
│  │  LOC: ~20                                                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Models Module

```
┌─────────────────────────────────────────────────────────────────────┐
│                          models/                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  models/resolver.ts                                          │    │
│  │  Model resolution (aliases, auto-selection)                  │    │
│  │  LOC: ~150                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  models/catalog.ts                                           │    │
│  │  Known model catalog                                         │    │
│  │  LOC: ~200                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  models/aliases.ts                                           │    │
│  │  Model alias resolution                                      │    │
│  │  LOC: ~50                                                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  models/capabilities.ts                                      │    │
│  │  Model capability detection                                  │    │
│  │  LOC: ~80                                                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  models/capability-overrides.ts                              │    │
│  │  Per-model capability overrides                              │    │
│  │  LOC: ~50                                                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  models/cost.ts                                              │    │
│  │  Token cost calculations                                     │    │
│  │  LOC: ~80                                                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  models/hydrate.ts                                           │    │
│  │  Model hydration from SDK                                    │    │
│  │  LOC: ~50                                                    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Helper Modules

```
┌─────────────────────────────────────────────────────────────────────┐
│                          helpers/                                    │
├─────────────────────────────────────────────────────────────────────┤
│  format.ts        Formatting utilities (isPlainObject, etc.)        │
│  fs.ts            Filesystem helpers                                 │
│  process.ts       Process management helpers                         │
│  advanced-util.ts Advanced utilities                                 │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        permissions/                                  │
├─────────────────────────────────────────────────────────────────────┤
│  schema.ts        Permission schema definitions                      │
│  validator.ts     Permission validation                              │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        integrations/                                 │
├─────────────────────────────────────────────────────────────────────┤
│  linear.ts        Linear.app integration                             │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         profiles/                                    │
├─────────────────────────────────────────────────────────────────────┤
│  discovery.ts     SKILL.md file discovery (future)                   │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                            ux/                                       │
├─────────────────────────────────────────────────────────────────────┤
│  repo-context.ts  Repository context helpers                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Frontend: `app/src/`

### Directory Tree

```
app/src/
├── entry.tsx                  # App mount point
├── app.tsx                    # Root component + routing
├── context/                   # State providers
├── pages/                     # Page components
├── components/                # UI components
├── types/                     # UI data types
└── lib/                       # Utilities
```

### Main Module Map

| Module | Purpose | Key files |
| --- | --- | --- |
| `entry.tsx` | App bootstrap + mounting. | `app/src/entry.tsx` |
| `app.tsx` | Router, providers, onboarding gate. | `app/src/app.tsx` |
| `context/` | UI state providers (OpenCode, Skills, DB, Layout). | `app/src/context/opencode.tsx`, `app/src/context/skills.tsx`, `app/src/context/db.tsx`, `app/src/context/layout.tsx` |
| `pages/` | Top-level routes (chat, agents, logs, settings, onboarding). | `app/src/pages/chat.tsx`, `app/src/pages/agents.tsx`, `app/src/pages/onboarding.tsx` |
| `components/` | UI composition blocks + SDK console. | `app/src/components/layout/app-layout.tsx`, `app/src/components/command-palette.tsx`, `app/src/components/sdk/sdk-workspace.tsx` |
| `types/` | Shared UI data shapes. | `app/src/types/skill.ts`, `app/src/types/db.ts` |
| `lib/` | Utility helpers. | `app/src/lib/utils.ts` |

### Module Map

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Frontend Modules                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Entry & Root                                                        │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  entry.tsx     Mount point, render(<App />)                  │    │
│  │  app.tsx       OpenCodeProvider + LayoutProvider wrapper     │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Context Providers                                                   │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  context/opencode.tsx   SDK state (sessions, messages, etc) │    │
│  │  context/layout.tsx     UI state (selected worker, panel)   │    │
│  │  context/skills.tsx     Skills CRUD + SSE                   │    │
│  │  context/db.tsx         SQLite snapshot + preferences       │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Pages                                                               │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  pages/chat.tsx         Chat + session timeline             │    │
│  │  pages/agents.tsx       Worker runtime view                 │    │
│  │  pages/profiles.tsx     Skills workspace                    │    │
│  │  pages/logs.tsx         Event log viewer                    │    │
│  │  pages/settings.tsx     Preferences + overrides             │    │
│  │  pages/onboarding.tsx   5-minute onboarding flow            │    │
│  │  pages/dashboard.tsx    Legacy dashboard view               │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Components                                                          │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  header.tsx          App header with actions                │    │
│  │  worker-grid.tsx     Grid layout of worker cards            │    │
│  │  worker-card.tsx     Individual worker status card          │    │
│  │  worker-detail.tsx   Worker detail panel                    │    │
│  │  spawn-dialog.tsx    Worker spawn modal                     │    │
│  │  prompt-input.tsx    Message input component                │    │
│  │  job-queue.tsx       Async job status display               │    │
│  │  log-stream.tsx      Real-time log viewer                   │    │
│  │  command-palette.tsx  Command palette (⌘K)                  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Layout Components                                                   │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  layout/shell.tsx      Main app shell                       │    │
│  │  sidebar/worker-list   Worker list in sidebar               │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  UI Primitives (Solid + Tailwind)                                   │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  ui/badge.tsx    ui/button.tsx   ui/card.tsx                │    │
│  │  ui/dialog.tsx   ui/input.tsx    ui/select.tsx              │    │
│  │  ui/scroll-area.tsx   ui/separator.tsx   ui/tooltip.tsx     │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Utilities                                                           │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  lib/utils.ts    Utility functions (cn, etc.)               │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## File Count Summary

| Directory | Files | Description |
|-----------|-------|-------------|
| `orchestra/src/` | ~85 | Backend plugin source |
| `orchestra/src/workers/profiles/` | 11 | Built-in worker profiles |
| `app/src/` | ~30 | Frontend source |
| `app/src/components/ui/` | 10 | UI primitives |
| `docs/` | 5 | Documentation |
| `test/` | ~20 | Test suites |

---

## Key Entry Points

| File | Purpose |
|------|---------|
| `orchestra/src/index.ts` | Plugin export |
| `orchestra/src/core/container.ts` | Service wiring |
| `app/src/entry.tsx` | Frontend mount |
| `app/src/context/opencode.tsx` | SDK state |

---

## Import Graph (Simplified)

```
                    index.ts
                       │
                       ▼
                 core/container
                       │
         ┌─────────────┼─────────────────┐
         │             │                 │
         ▼             ▼                 ▼
       api/        workers/        orchestrator/
         │             │                 │
         │      ┌──────┴──────┐          │
         │      │             │          │
         ▼      ▼             ▼          ▼
     memory/  tools/      workflows/  communication/
```
