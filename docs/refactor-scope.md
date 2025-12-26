# Refactor Scope

OpenCode-aligned refactoring scope with goals, patterns, and implementation details.

## Goals

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Refactoring Goals                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. Standardize Factories                                            │
│     └── All services use Factory<TConfig, TDeps, TService>          │
│                                                                      │
│  2. SDK-First Transport                                              │
│     └── Replace custom streaming with OpenCode SDK events           │
│                                                                      │
│  3. Unified Worker Management                                        │
│     └── Single WorkerManager owns spawn/send/stop/jobs              │
│                                                                      │
│  4. Clean Deletions                                                  │
│     └── Remove duplicated/obsolete code immediately                 │
│                                                                      │
│  5. Code Reduction                                                   │
│     └── Target ~40% reduction without breaking behavior             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Non-Negotiables

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Architectural Rules                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ✗ No module-level globals for runtime config                       │
│                                                                      │
│  ✗ No direct IO outside designated modules:                         │
│      - src/api/          → SDK calls                                │
│      - src/communication/→ Event subscriptions                      │
│      - src/memory/       → Storage operations                       │
│      - src/workers/spawn → Process management                       │
│                                                                      │
│  ✗ No custom servers (prefer SDK + endpoints)                       │
│                                                                      │
│  ✗ No mocked tests (real-data only)                                 │
│                                                                      │
│  ✗ No files exceeding size limits (split early)                     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Target Topology

### Directory Structure

```
orchestra/src/
├── index.ts                   # Plugin entry (thin)
├── api/                       # SDK wrapper
│   └── index.ts
├── communication/             # Event system
│   ├── index.ts
│   └── events.ts
├── config/                    # Configuration
│   ├── orchestrator.ts
│   ├── orchestrator/
│   │   ├── defaults.ts
│   │   ├── parse.ts
│   │   ├── parse-extra.ts
│   │   └── paths.ts
│   ├── opencode.ts
│   ├── profiles.ts
│   └── profile-inheritance.ts
├── core/                      # Container + lifecycle
│   ├── index.ts
│   ├── container.ts
│   ├── spawn-policy.ts
│   └── jobs.ts
├── helpers/                   # Utilities
├── integrations/              # External services
├── memory/                    # Memory store
│   ├── index.ts
│   ├── store.ts
│   ├── store-file.ts
│   ├── neo4j.ts
│   ├── graph.ts
│   ├── inject.ts
│   ├── auto.ts
│   └── text.ts
├── models/                    # Model selection
├── orchestrator/              # Routing + coordination
│   ├── index.ts
│   └── router.ts
├── permissions/               # Tool permissions
├── profiles/                  # Profile discovery
├── tools/                     # OpenCode tools
│   ├── index.ts
│   ├── worker-tools.ts
│   ├── workflow-tools.ts
│   └── hooks.ts
├── types/                     # TypeScript types
├── ux/                        # UX helpers
├── workers/                   # Worker management
│   ├── index.ts
│   ├── manager.ts
│   ├── registry.ts
│   ├── spawn.ts
│   ├── send.ts
│   ├── jobs.ts
│   ├── prompt.ts
│   ├── attachments.ts
│   └── profiles/
└── workflows/                 # Workflow engine
    ├── index.ts
    ├── factory.ts
    ├── engine.ts
    ├── roocode-boomerang.ts
    ├── builtins.ts
    └── types.ts
```

---

## Standard Factory Pattern

### Factory Shape

```typescript
/**
 * Factory function signature for all services
 */
export type Factory<TConfig, TDeps, TService> = (input: {
  config: TConfig;
  deps: TDeps;
}) => TService;

/**
 * Required lifecycle interface for all services
 */
export interface ServiceLifecycle {
  start(): Promise<void>;
  stop(): Promise<void>;
  health(): Promise<{ ok: boolean; info?: any }>;
}
```

### Implementation Pattern

```
┌─────────────────────────────────────────────────────────────────────┐
│                   Factory Implementation                             │
└─────────────────────────────────────────────────────────────────────┘

    // Example: createApiService
    export const createApiService: Factory<ApiConfig, {}, ApiService> = ({
      config,
      deps,
    }) => {
      // Private state
      let client: ReturnType<typeof createOpencodeClient>;

      // Service methods
      const session = { ... };
      const event = { ... };
      const tui = { ... };

      // Lifecycle
      const start = async () => { ... };
      const stop = async () => { ... };
      const health = async () => ({ ok: true });

      return {
        session,
        event,
        tui,
        start,
        stop,
        health,
      };
    };
```

---

## Service Contracts

### ApiService

```typescript
interface ApiService extends ServiceLifecycle {
  session: {
    create(opts: { model: string; system?: string }): Promise<{ id: string }>;
    prompt(id: string, body: PromptBody, opts?: PromptOpts): Promise<Response>;
    cancel(id: string): Promise<void>;
  };
  event: {
    subscribe(opts?: SubscribeOpts): AsyncIterable<Event>;
  };
  tui: {
    publish(type: string, message: string): Promise<void>;
  };
  project: {
    current(): Promise<{ id: string } | undefined>;
  };
  health(): Promise<{ ok: boolean }>;
}
```

### WorkerManager

```typescript
interface WorkerManager extends ServiceLifecycle {
  spawnById(id: string): Promise<WorkerInstance>;
  stopWorker(id: string): Promise<void>;
  getWorker(id: string): WorkerInstance | undefined;
  listWorkers(): WorkerInstance[];
  send(id: string, message: string, opts?: SendOpts): Promise<SendResult>;
  jobs: JobQueue;
}
```

### OrchestratorService

```typescript
interface OrchestratorService extends ServiceLifecycle {
  ensureWorker(input: {
    workerId: string;
    reason: "manual" | "on-demand";
  }): Promise<WorkerInstance>;

  delegateTask(input: {
    task: string;
    attachments?: WorkerAttachment[];
    autoSpawn?: boolean;
  }): Promise<{ workerId: string; response: string }>;

  runWorkflow(input: {
    workflowId: string;
    task: string;
    attachments?: WorkerAttachment[];
    autoSpawn?: boolean;
  }): Promise<any>;
}
```

---

## Phased Refactoring

### Phase 0: Inventory & Guardrails (DONE)

```
☑ Map src/ modules to target topology
☑ Identify oversized files and split plan
☑ Define deletion list and ordering
☑ Validate OpenCode server connectivity
```

### Phase 1: API Layer (DONE)

```
☑ Create src/api/ wrapper
☑ Centralize createOpencodeClient usage
☑ Replace direct SDK calls in workers/core
```

### Phase 2: Communication (DONE)

```
☑ Create src/communication/ service
☑ Wrap client.event.subscribe()
☑ Remove custom bridge server
☑ Remove worker streaming plugin
```

### Phase 3: Worker Manager (DONE)

```
☑ Create unified createWorkerManager()
☑ Consolidate spawn/send/stop/health/jobs
☑ Remove old worker-pool/client/spawner
```

### Phase 4: Memory Isolation (DONE)

```
☑ Move injection/record/search to factories
☑ Use client.session.prompt({ noReply: true })
☑ Support file and Neo4j backends
```

### Phase 5: Workflow Engine (DONE)

```
☑ Keep workflows pure (no direct IO)
☑ Call worker manager + tools only
☑ Remove direct SDK calls
```

### Phase 6: Tools & Wiring (DONE)

```
☑ Split tools into small files
☑ Implement tool.execute.before hook
☑ Implement compaction hook
☑ Tools call API/Workers/Memory only
```

### Phase 7: Orchestrator & Core (DONE)

```
☑ createCore() wires all factories
☑ Orchestrator handles coordination only
☑ No IO in orchestrator module
```

### Phase 8: Documentation (IN PROGRESS)

```
☑ Update architecture.md
☑ Update configuration.md
☑ Update inventory.md
☑ Update migration-map.md
☑ Update refactor-scope.md
☐ Add runbooks (testing, ops, troubleshooting)
```

---

## Removed Components

### Custom Transport (Deleted)

```
src/worker-bridge-plugin.mjs  → DELETED
src/core/bridge-server.ts     → DELETED
src/core/stream-events.ts     → DELETED
```

### Custom Supervisor (Deleted)

```
src/supervisor/server.ts      → DELETED
```

### Legacy Worker Stack (Deleted)

```
src/core/worker-pool.ts       → DELETED
src/workers/client.ts         → DELETED
```

---

## Data Flow Patterns

### Tool Execution Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Tool Execution Flow                              │
└─────────────────────────────────────────────────────────────────────┘

    OpenCode CLI                    Orchestra Plugin
         │                               │
         │  tool.execute.before          │
         ▼                               ▼
    ┌─────────┐                   ┌─────────────┐
    │  Tool   │────intercept────▶│ ToolsService│
    │  Call   │                   └──────┬──────┘
    └─────────┘                          │
                                         ▼
                              ┌──────────────────┐
                              │  Dispatch to:    │
                              │  - WorkerManager │
                              │  - Orchestrator  │
                              │  - WorkflowEngine│
                              └──────────────────┘
```

### Event Forwarding Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Event Forwarding Flow                            │
└─────────────────────────────────────────────────────────────────────┘

    Worker Process              Communication           Frontend
         │                           │                      │
         │ status change             │                      │
         ▼                           ▼                      │
    ┌──────────┐              ┌─────────────┐              │
    │  Emit    │──────────────▶│  EventBus   │              │
    │  Event   │              │  (internal) │              │
    └──────────┘              └──────┬──────┘              │
                                     │                      │
                                     ▼                      │
                              ┌─────────────┐              │
                              │ api.tui     │              │
                              │ .publish()  │──SSE────────▶│
                              └─────────────┘              │
                                                           ▼
                                                    ┌─────────────┐
                                                    │  UI Update  │
                                                    └─────────────┘
```

---

## File Size Guidelines

| Type | Limit | Reason |
|------|-------|--------|
| Core runtime | ≤350 LOC | Performance-critical |
| Feature module | ≤300 LOC | Maintainability |
| Documentation | ≤250 LOC | Readability |
| Type definitions | ≤200 LOC | Focus |
| Worker profile | ≤100 LOC | Simplicity |

### Split Triggers

- File exceeds limit → Split by concern
- Module has >3 responsibilities → Extract services
- Test file >500 LOC → Split by feature

---

## Testing Strategy

### Real-Data Testing Only

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Testing Requirements                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ✓ Run against live `opencode serve`                                │
│  ✓ Use real API endpoints                                           │
│  ✓ Spawn actual worker processes                                    │
│  ✓ Test full lifecycle (start → operate → stop)                     │
│                                                                      │
│  ✗ No mocked SDK responses                                          │
│  ✗ No fake worker processes                                         │
│  ✗ No simulated events                                              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Test Categories

| Category | Location | Purpose |
|----------|----------|---------|
| Unit | `test/unit/` | Pure function tests |
| Integration | `test/integration/` | Service interaction |
| E2E | `test/e2e*.test.ts` | Full system flows |

---

## Future Scope (v0.4+)

### Skills-Based Configuration

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Skills-Based Workers (Future)                       │
└─────────────────────────────────────────────────────────────────────┘

    .opencode/
    └── skills/
        ├── coder/
        │   └── SKILL.md         # Agent Skills Standard format
        ├── reviewer/
        │   └── SKILL.md
        └── custom-worker/
            └── SKILL.md

    Discovery Flow:
    ┌────────────┐    ┌──────────────┐    ┌───────────────┐
    │  Scan for  │───▶│  Parse       │───▶│  Generate     │
    │  SKILL.md  │    │  Frontmatter │    │  WorkerProfile│
    └────────────┘    └──────────────┘    └───────────────┘
```

### Enhanced Memory

```
Future Memory Backends:
├── File store (current)
├── Neo4j (current)
├── Vector store (planned)
└── Semantic search (planned)
```

### Workflow Improvements

```
Future Workflow Features:
├── Parallel step execution
├── Conditional branching
├── Error recovery strategies
└── Workflow templates
```

---

## Cleanup Checklist

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Final Cleanup Items                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ☑ All factories follow standard pattern                            │
│  ☑ All services implement ServiceLifecycle                          │
│  ☑ No direct SDK usage outside api/                                 │
│  ☑ No custom servers remaining                                       │
│  ☑ All deleted files removed                                         │
│  ☑ Tests pass against live server                                    │
│  ☐ Documentation reflects current state                              │
│  ☐ Runbooks written for operations                                   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```
