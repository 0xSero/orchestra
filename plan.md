# OpenCode Orchestrator - Comprehensive Improvement Plan

> **Goal**: Simplify and improve every workflow by deeply understanding OpenCode SDK capabilities and our current implementation gaps.

---

## Executive Summary

After analyzing all 57+ source files and cross-referencing with the OpenCode SDK documentation, I've identified **6 major system categories** with **24 specific improvement opportunities**. Many complexities exist because we're reimplementing SDK features or not leveraging key APIs like `session.prompt({ noReply: true })` for message injection.

---

## System Categories Overview

| Category | Files | Lines | Complexity | Priority |
|----------|-------|-------|------------|----------|
| [Worker Lifecycle](#1-worker-lifecycle-management) | 8 | ~2,400 | HIGH | P0 |
| [Communication](#2-communication-infrastructure) | 6 | ~1,800 | HIGH | P0 |
| [Vision System](#3-vision-system) | 4 | ~900 | MEDIUM | P1 |
| [Memory & Persistence](#4-memory--persistence) | 6 | ~1,200 | MEDIUM | P1 |
| [Tools & UX](#5-tools--ux) | 10 | ~3,200 | MEDIUM | P2 |
| [Workflows](#6-workflows) | 4 | ~400 | LOW | P3 |

---

## 1. Worker Lifecycle Management

### Current State

| File | Purpose | Lines | Issues |
|------|---------|-------|--------|
| `core/registry.ts` | In-memory worker registry | ~200 | Duplicates worker-pool.ts functionality |
| `core/worker-pool.ts` | Unified worker pool (newer) | ~620 | Parallel system, not fully adopted |
| `core/device-registry.ts` | File-based persistence | ~280 | Redundant with worker-pool.ts |
| `core/runtime.ts` | Lifecycle & cleanup | ~290 | Complex orphan detection |
| `core/profile-lock.ts` | Prevent duplicate spawns | ~100 | Superseded by worker-pool.ts |
| `workers/spawner.ts` | Core spawn logic | ~830 | Main complexity hub |

### Problems Identified

1. **Three parallel registries**: `registry.ts`, `worker-pool.ts`, `device-registry.ts` all track workers
2. **Orphan cleanup is complex**: 150+ lines in runtime.ts for process cleanup
3. **Spawn deduplication scattered**: Both `inFlightSpawns` in worker-pool.ts AND profile-lock.ts
4. **No SDK session reuse**: Each spawn creates new session instead of reusing

### SDK-Based Solutions

| Problem | Current Approach | SDK Solution | Effort |
|---------|------------------|--------------|--------|
| Multiple registries | 3 separate systems | Use SDK's session management + single Map | 2 days |
| Orphan detection | Manual `ps aux` parsing | SDK server manages child sessions | 1 day |
| Spawn deduplication | Two systems | Single `inFlightSpawns` Map in worker-pool | 4 hours |
| Session lifecycle | Manual PID tracking | `session.abort()` + SDK cleanup | 1 day |

### Recommended Actions

```
CONSOLIDATE:
- DELETE core/registry.ts → Use worker-pool.ts exclusively
- DELETE core/device-registry.ts → SDK handles persistence
- DELETE core/profile-lock.ts → Handled by worker-pool.inFlightSpawns

SIMPLIFY spawner.ts:
- Remove 200+ lines of PID tracking
- Use SDK session IDs for identity
- Trust SDK's process management
```

---

## 2. Communication Infrastructure

### Current State

| File | Purpose | Lines | Issues |
|------|---------|-------|--------|
| `core/bridge-server.ts` | HTTP server for workers | ~450 | Custom protocol when SDK has APIs |
| `core/message-bus.ts` | Inter-agent messaging | ~200 | Duplicates SDK session.prompt |
| `core/jobs.ts` | Async job tracking | ~250 | Could use SDK subscriptions |
| `worker-bridge-plugin.mjs` | Worker-side tools | ~180 | 4 tools for 1 SDK feature |
| `core/stream-formatter.ts` | ASCII box output | ~140 | Nice UX, keep it |

### Problems Identified

1. **Custom HTTP bridge**: We built `/v1/message`, `/v1/report`, `/v1/wakeup` when SDK has `session.prompt()`
2. **4 worker tools** (`message_tool`, `worker_inbox`, `wakeup_orchestrator`, `stream_chunk`) for communication
3. **Message bus is redundant**: SDK's session system handles message routing
4. **Jobs system duplicates**: SDK tracks tool execution state

### SDK-Based Solutions

| Problem | Current Approach | SDK Solution | Effort |
|---------|------------------|--------------|--------|
| Worker→Orchestrator messaging | HTTP POST to bridge | SDK's session parent/child relationship | 3 days |
| Orchestrator→Worker messaging | HTTP POST + polling | `session.prompt({ noReply: true })` injection | 1 day |
| Async job tracking | Custom jobs.ts (200 jobs max) | SDK's tool state tracking | 2 days |
| Real-time streaming | SSE endpoint + EventEmitter | SDK streaming responses | 1 day |

### Recommended Actions

```
SIMPLIFY bridge-server.ts:
- Keep only /v1/stream for real-time output (SDK doesn't expose this)
- Remove /v1/message, /v1/report, /v1/inbox → Use SDK session.prompt()
- Remove /v1/wakeup → Use SDK session events

REDUCE worker-bridge-plugin.mjs:
- Keep stream_chunk (needed for real-time UX)
- Remove message_tool → SDK handles this
- Remove worker_inbox → SDK handles this
- Remove wakeup_orchestrator → SDK session events

DELETE OR SIMPLIFY:
- core/message-bus.ts → SDK session messaging
- core/jobs.ts → SDK tool state OR keep simplified (50 lines max)
```

---

## 3. Vision System

### Current State

| File | Purpose | Lines | Issues |
|------|---------|-------|--------|
| `vision/analyzer.ts` | Core image analysis | ~360 | Clean, focused |
| `ux/vision-router.ts` | Backwards compat wrapper | ~200 | Should be deleted |
| `core/progress.ts` | Progress indicators | ~150 | Good, keep it |

### Problems Identified

1. **Dual implementations**: vision-router.ts wraps analyzer.ts unnecessarily
2. **Manual worker spawning**: Should use worker-pool.ts consistently
3. **Placeholder injection works well**: `[VISION ANALYSIS PENDING]` pattern is good

### SDK-Based Solutions

| Problem | Current Approach | SDK Solution | Effort |
|---------|------------------|--------------|--------|
| Backwards compat layer | vision-router.ts wrapper | Delete it, update imports | 2 hours |
| Worker spawning | Custom logic in vision-router | Use worker-pool.getOrSpawn() | 4 hours |
| Image handling | Base64 extraction | SDK handles image parts natively | Already good |

### Recommended Actions

```
DELETE:
- ux/vision-router.ts → Update all imports to use vision/analyzer.ts

KEEP AS-IS:
- vision/analyzer.ts → Clean implementation
- core/progress.ts → Good UX patterns

MINOR UPDATES:
- Use worker-pool.ts for spawn management
- Remove workerAge tracking (unnecessary)
```

---

## 4. Memory & Persistence

### Current State

| File | Purpose | Lines | Issues |
|------|---------|-------|--------|
| `memory/graph.ts` | Neo4j operations | ~200 | External dependency |
| `memory/neo4j.ts` | Neo4j config | ~50 | Config only |
| `memory/auto.ts` | Auto-record/inject | ~180 | Complex state machine |
| `memory/inject.ts` | Memory injection | ~150 | Formatting utilities |
| `memory/text.ts` | Text memory (new) | ~200 | Simpler alternative |
| `core/file-monitor.ts` | File watching | ~300 | Not used for memory |

### Problems Identified

1. **Neo4j is heavy dependency**: Most users won't have Neo4j running
2. **Auto-record complexity**: Complex hooks when SDK has session history
3. **Two memory systems**: graph.ts (Neo4j) vs text.ts (file-based)
4. **File monitor unused**: Created but not integrated

### SDK-Based Solutions

| Problem | Current Approach | SDK Solution | Effort |
|---------|------------------|--------------|--------|
| Session history | Custom Neo4j storage | SDK's `/session/messages` API | 2 days |
| Memory injection | Complex auto.ts logic | `session.prompt({ noReply: true })` | 1 day |
| Persistence | Neo4j OR text files | SDK session persistence + simple JSON | 2 days |

### Recommended Actions

```
SIMPLIFY:
- Make Neo4j OPTIONAL (already is, but cleaner)
- Default to text.ts for most users
- Remove auto.ts complexity → Simple injection on session start

LEVERAGE SDK:
- Use SDK's session history for "recent context"
- Use SDK's session summarize for summaries
- Store decisions/learnings in simple JSON

DELETE:
- core/file-monitor.ts → Not used, adds complexity
```

---

## 5. Tools & UX

### Current State

| File | Purpose | Lines | Issues |
|------|---------|-------|--------|
| `tools/index.ts` | Tool exports | ~50 | Good organization |
| `tools/tools-workers.ts` | Worker management tools | ~590 | Core functionality |
| `tools/tools-ux.ts` | UX/passthrough tools | ~685 | Many tools |
| `tools/tools-profiles.ts` | Profile management | ~420 | Feature-complete |
| `tools/tools-memory.ts` | Memory tools | ~130 | Neo4j dependent |
| `tools/tools-diagnostics.ts` | Debug tools | ~95 | Useful |
| `tools/tools-workflows.ts` | Workflow tools | ~180 | Clean |
| `tools/state.ts` | Global state | ~95 | Module-level state |
| `tools/config-store.ts` | Config persistence | ~200 | File operations |
| `tools/markdown.ts` | Markdown helpers | ~50 | Utilities |

### Problems Identified

1. **40+ tools exposed**: Overwhelming for the LLM
2. **Module-level state**: `tools/state.ts` uses global variables
3. **Passthrough complexity**: 200+ lines for simple mode switch
4. **Many tools are admin-only**: Model shouldn't auto-pin profiles

### SDK-Based Solutions

| Problem | Current Approach | SDK Solution | Effort |
|---------|------------------|--------------|--------|
| Too many tools | All tools visible | SDK `tools` config to disable | 1 day |
| Global state | Module variables | Pass context through SDK | 2 days |
| Passthrough | Custom state machine | SDK agent switching? | Research |

### Recommended Actions

```
REDUCE TOOL COUNT:
- Core tools (8): spawn_worker, ask_worker, delegate_task, list_workers,
                  stop_worker, list_profiles, list_models, orchestrator_status
- Hide admin tools by default: autofill_profile_models, set_profile_model,
                               set_auto_spawn, reset_profile_models, etc.

USE SDK CONFIG:
{
  "tools": {
    "autofill_profile_models": false,
    "set_profile_model": false,
    // ... hide admin tools
  }
}

SIMPLIFY:
- tools/state.ts → Pass context explicitly OR use SDK context
- core/passthrough.ts → Already simple, keep it
```

---

## 6. Workflows

### Current State

| File | Purpose | Lines | Issues |
|------|---------|-------|--------|
| `workflows/engine.ts` | Workflow runner | ~120 | Clean |
| `workflows/types.ts` | Type definitions | ~60 | Good |
| `workflows/roocode-boomerang.ts` | Example workflow | ~75 | Template |
| `workflows/index.ts` | Registration | ~20 | Entry point |

### Assessment

**This is the cleanest subsystem.** Only ~275 lines total, well-structured.

### Minor Improvements

| Problem | Current Approach | Improvement | Effort |
|---------|------------------|-------------|--------|
| Step limits hardcoded | 4 steps max | Make configurable | 2 hours |
| Single workflow | roocode-boomerang | Add more templates | Future |

### Recommended Actions

```
KEEP AS-IS:
- Clean implementation
- Good security limits
- Configurable via orchestrator.json

FUTURE:
- Add more workflow templates
- Visual workflow builder?
```

---

## Implementation Priority Matrix

### P0 - Critical (Do First)

| Item | Impact | Effort | Files Affected |
|------|--------|--------|----------------|
| Consolidate registries | HIGH | 2 days | registry.ts, worker-pool.ts, device-registry.ts |
| Simplify bridge-server | HIGH | 3 days | bridge-server.ts, worker-bridge-plugin.mjs |
| Delete message-bus | MEDIUM | 1 day | message-bus.ts, spawner.ts |

### P1 - Important (Do Second)

| Item | Impact | Effort | Files Affected |
|------|--------|--------|----------------|
| Delete vision-router.ts | MEDIUM | 2 hours | vision-router.ts, imports |
| Simplify memory system | MEDIUM | 2 days | auto.ts, inject.ts |
| Delete file-monitor.ts | LOW | 30 min | file-monitor.ts |

### P2 - Nice to Have

| Item | Impact | Effort | Files Affected |
|------|--------|--------|----------------|
| Reduce tool count | MEDIUM | 1 day | tools/*.ts, config |
| Refactor state.ts | LOW | 2 days | state.ts, all tools |

### P3 - Future

| Item | Impact | Effort | Files Affected |
|------|--------|--------|----------------|
| More workflow templates | LOW | Ongoing | workflows/*.ts |
| Visual workflow builder | LOW | Large | New system |

---

## Files to DELETE (Immediate Wins)

| File | Reason | Replacement |
|------|--------|-------------|
| `core/registry.ts` | Duplicates worker-pool.ts | worker-pool.ts |
| `core/device-registry.ts` | Redundant persistence | worker-pool.ts + SDK |
| `core/profile-lock.ts` | Handled by worker-pool | worker-pool.inFlightSpawns |
| `ux/vision-router.ts` | Wrapper over analyzer.ts | vision/analyzer.ts |
| `core/file-monitor.ts` | Created but unused | None needed |
| `core/message-bus.ts` | SDK handles messaging | session.prompt() |

**Total: 6 files (~1,200 lines) can be deleted**

---

## SDK Features We Should Use More

| SDK Feature | Our Current Approach | Benefit |
|-------------|---------------------|---------|
| `session.prompt({ noReply: true })` | Custom injection | Context injection without AI reply |
| `session.abort()` | Manual PID killing | Clean session termination |
| `session.messages` | Custom message-bus | Get session history |
| `session.summarize()` | Custom summary logic | Built-in summarization |
| `session/children` | Manual tracking | Parent-child session management |
| `config.providers` | Manual model lookup | Get available models |
| Tool state tracking | Custom jobs.ts | Built-in tool execution state |

---

## Architecture Diagram (After Simplification)

```
┌─────────────────────────────────────────────────────────────────┐
│                     ORCHESTRATOR PLUGIN                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   Tools     │    │   Vision    │    │  Workflows  │         │
│  │  (8 core)   │    │  analyzer   │    │   engine    │         │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘         │
│         │                   │                  │                 │
│         └───────────────────┼──────────────────┘                 │
│                             │                                    │
│                    ┌────────▼────────┐                          │
│                    │   Worker Pool   │  ◄── Single source       │
│                    │  (worker-pool)  │      of truth            │
│                    └────────┬────────┘                          │
│                             │                                    │
│              ┌──────────────┼──────────────┐                    │
│              │              │              │                     │
│        ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐             │
│        │  Bridge   │  │   SDK     │  │  Memory   │             │
│        │ (stream   │  │ Sessions  │  │ (text.ts) │             │
│        │  only)    │  │           │  │           │             │
│        └───────────┘  └───────────┘  └───────────┘             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │      OpenCode SDK Server       │
              │   (opencode serve instances)   │
              └───────────────────────────────┘
```

---

## Metrics After Simplification

| Metric | Before | After | Reduction |
|--------|--------|-------|-----------|
| Source files | 57 | ~45 | -21% |
| Lines of code | ~12,000 | ~8,000 | -33% |
| Worker registries | 3 | 1 | -67% |
| Communication channels | 4 | 2 | -50% |
| Tools exposed | 40+ | 15 | -62% |

---

## Next Steps

1. **Create feature branch**: `git checkout -b simplify/v0.3`
2. **Start with P0 items**: Registry consolidation
3. **Write migration tests**: Ensure no regression
4. **Delete dead code**: The 6 files identified
5. **Update documentation**: Reflect simplified architecture

---

*Generated: 2025-12-23*
*Based on: Full codebase analysis + OpenCode SDK documentation*
