# Migration Map

Comprehensive migration tracking from legacy architecture to SDK-first design.

## Migration Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Architecture Evolution                           │
└─────────────────────────────────────────────────────────────────────┘

    Legacy (v0.1)                          Current (v0.3)
    ┌─────────────────┐                    ┌─────────────────┐
    │ Custom Bridge   │                    │  OpenCode SDK   │
    │  SSE Server     │  ──────────────▶   │  event.subscribe│
    └─────────────────┘                    └─────────────────┘

    ┌─────────────────┐                    ┌─────────────────┐
    │ Worker Pool +   │                    │  WorkerManager  │
    │ Spawner + Client│  ──────────────▶   │  (unified)      │
    └─────────────────┘                    └─────────────────┘

    ┌─────────────────┐                    ┌─────────────────┐
    │ Direct SDK      │                    │  ApiService     │
    │ Calls Scattered │  ──────────────▶   │  (centralized)  │
    └─────────────────┘                    └─────────────────┘

    ┌─────────────────┐                    ┌─────────────────┐
    │ Supervisor HTTP │                    │  SDK Events +   │
    │ Server          │  ──────────────▶   │  tui.publish()  │
    └─────────────────┘                    └─────────────────┘
```

---

## Phase Status

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Phase Completion                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Phase 0: Inventory & Guardrails              [████████████] 100%   │
│  Phase 1: API Layer Standardization           [████████████] 100%   │
│  Phase 2: Communication & Events              [████████████] 100%   │
│  Phase 3: Worker Manager                      [████████████] 100%   │
│  Phase 4: Memory Isolation                    [████████████] 100%   │
│  Phase 5: Workflow Engine                     [████████████] 100%   │
│  Phase 6: Tools & Plugin Wiring               [████████████] 100%   │
│  Phase 7: Orchestrator & Core                 [████████████] 100%   │
│  Phase 8: Docs & Runbooks                     [████████░░░░]  70%   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Completed Migrations

### File Moves

| Old Location | New Location | Status |
|--------------|--------------|--------|
| `src/config/orchestrator.ts` | `src/config/orchestrator/*` (split) | ✅ Done |
| `src/workers/spawner.ts` | `src/workers/spawn.ts` + `src/workers/manager.ts` | ✅ Done |
| `src/core/worker-pool.ts` | `src/workers/registry.ts` | ✅ Done |
| `src/core/jobs.ts` | `src/workers/jobs.ts` + `src/core/jobs.ts` | ✅ Done |
| `src/ux/vision-router.ts` | Removed (in worker profiles) | ✅ Done |

### Deletions (Completed)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Deleted Legacy Files                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Custom Transport Layer                                              │
│  ├── src/worker-bridge-plugin.mjs     Custom streaming plugin       │
│  ├── src/core/bridge-server.ts        Custom SSE server             │
│  └── src/core/stream-events.ts        Custom stream store           │
│                                                                      │
│  Custom Supervisor                                                   │
│  └── src/supervisor/server.ts         Custom worker supervisor API  │
│                                                                      │
│  Legacy Worker Stack                                                 │
│  ├── src/core/worker-pool.ts          Old worker pool               │
│  └── src/workers/client.ts            Old worker client             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Directory Mapping

### Source → Target Topology

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Module Migration Map                              │
└─────────────────────────────────────────────────────────────────────┘

    Source                          Target
    ──────                          ──────

    src/models/*                    src/api/ + src/models/
    src/config/opencode.ts     ───▶ src/api/
                                    (central SDK client + model access)

    (custom SSE)                    src/communication/
                               ───▶ (SDK event.subscribe first)

    src/workers/*                   src/workers/
                               ───▶ (single factory + registry + jobs)

    src/index.ts                    src/orchestrator/
    src/tools/* (partial)      ───▶ (routing/policy only, no IO)

    src/memory/*                    src/memory/
    src/integrations/*         ───▶ (record/search/inject/trim)

    src/workflows/*                 src/workflows/
                               ───▶ (pure orchestration over workers)

    src/tools/*                     src/tools/
    src/permissions/*          ───▶ (thin adapters using API/workers)

    (container)                     src/core/
                               ───▶ (dependency container + lifecycle)
```

---

## Service Factory Pattern

All services now follow the standard factory pattern:

```typescript
// Factory signature
type Factory<TConfig, TDeps, TService> = (input: {
  config: TConfig;
  deps: TDeps;
}) => TService;

// ServiceLifecycle interface
interface ServiceLifecycle {
  start(): Promise<void>;
  stop(): Promise<void>;
  health(): Promise<{ ok: boolean; info?: any }>;
}
```

### Factory Implementation Status

| Service | Factory | Lifecycle | Health |
|---------|---------|-----------|--------|
| ApiService | `createApiService` | ✅ | ✅ |
| CommunicationService | `createCommunicationService` | ✅ | ✅ |
| MemoryService | `createMemoryStore` | ✅ | ✅ |
| WorkerManager | `createWorkerManager` | ✅ | ✅ |
| WorkflowEngine | `createWorkflowEngine` | ✅ | ✅ |
| OrchestratorService | `createOrchestrator` | ✅ | ✅ |
| ToolsService | `createToolsService` | ✅ | ✅ |

---

## Dependency Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                   Service Dependency Order                           │
└─────────────────────────────────────────────────────────────────────┘

    createCore() wiring order:

    1. ApiService
       └── No deps (wraps SDK)

    2. CommunicationService
       └── deps: { api }

    3. MemoryService
       └── deps: { api }

    4. WorkerManager
       └── deps: { api, communication }

    5. WorkflowEngine
       └── deps: { workers }

    6. OrchestratorService
       └── deps: { api, workers, workflows, communication }

    7. ToolsService
       └── deps: { workers, workflows, orchestrator }


    Dependency Graph:
    ┌─────┐
    │ api │◀──────────────────────────────────────┐
    └──┬──┘                                        │
       │                                           │
       ▼                                           │
    ┌──────────────┐     ┌────────┐               │
    │communication │     │ memory │               │
    └──────┬───────┘     └────────┘               │
           │                                       │
           ▼                                       │
    ┌─────────────┐                               │
    │  workers    │◀──────────────────┐           │
    └──────┬──────┘                    │           │
           │                           │           │
           ▼                           │           │
    ┌─────────────┐                    │           │
    │  workflows  │                    │           │
    └──────┬──────┘                    │           │
           │                           │           │
           ▼                           │           │
    ┌──────────────┐                   │           │
    │ orchestrator │───────────────────┤           │
    └──────┬───────┘                   │           │
           │                           │           │
           ▼                           │           │
    ┌─────────────┐                    │           │
    │   tools     │────────────────────┴───────────┘
    └─────────────┘
```

---

## IO Boundary Enforcement

All IO operations must go through designated services:

```
┌─────────────────────────────────────────────────────────────────────┐
│                      IO Boundary Rules                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ALLOWED IO Sources:                                                 │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  src/api/          OpenCode SDK calls                       │    │
│  │  src/communication/SDK event subscriptions                  │    │
│  │  src/memory/       File store / Neo4j                       │    │
│  │  src/workers/spawn Process spawning (opencode serve)        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  FORBIDDEN IO:                                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  ✗ Direct createOpencodeClient() outside api/               │    │
│  │  ✗ Custom HTTP servers                                      │    │
│  │  ✗ Custom SSE streaming                                     │    │
│  │  ✗ Direct filesystem in orchestrator/                       │    │
│  │  ✗ Direct network in workflows/                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## File Size Limits

Enforced limits to maintain code quality:

| Category | Limit | Notes |
|----------|-------|-------|
| Core/Runtime files | ≤350 LOC | Critical path code |
| Feature modules | ≤300 LOC | Worker, memory, etc. |
| Documentation | ≤250 LOC | Split when exceeded |
| Types/Interfaces | ≤200 LOC | Group by domain |

### Files Requiring Attention

| File | Current | Limit | Action |
|------|---------|-------|--------|
| `docs/architecture.md` | ~600 | 250 | Consider split |
| `docs/configuration.md` | ~830 | 250 | Consider split |
| `docs/inventory.md` | ~765 | 250 | Consider split |

---

## Remaining Work

### Phase 8: Documentation

- [ ] Split oversized docs if needed
- [ ] Add runbooks for:
  - Real-data testing procedures
  - Server operations
  - Troubleshooting guide
  - Performance tuning

### Future Phases (v0.4+)

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Future Migration Targets                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Skills-Based Worker Configuration                                   │
│  ├── SKILL.md file discovery                                        │
│  ├── Agent Skills Standard implementation                            │
│  └── Dynamic profile generation from skills                          │
│                                                                      │
│  Enhanced Memory System                                              │
│  ├── Vector store integration                                        │
│  ├── Semantic search                                                 │
│  └── Cross-project memory                                            │
│                                                                      │
│  Workflow Improvements                                               │
│  ├── Parallel step execution                                         │
│  ├── Conditional branching                                           │
│  └── Workflow templates                                              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Migration Validation

### Testing Requirements

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Validation Checklist                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ☑ Real-data tests only (no mocking)                                │
│  ☑ Run against live `opencode serve`                                │
│  ☑ All services start/stop cleanly                                  │
│  ☑ Health checks pass for all services                              │
│  ☑ Worker spawn/send/stop lifecycle works                           │
│  ☑ Memory inject/record functions work                              │
│  ☑ Workflow execution completes                                     │
│  ☑ Event forwarding to frontend works                               │
│  ☑ Tools registered and callable                                    │
│  ☐ Documentation complete and accurate                              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Notes

- All migrations maintain backward compatibility where possible
- Delete old files immediately after replacement is tested
- Keep test coverage during migrations
- Document any breaking changes
