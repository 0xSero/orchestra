# Scope of Work: v0.3.0 - Deep Subagent & Model Management

**Version**: 0.3.0
**Date**: 2025-12-23
**Status**: Planning
**Building on**: v0.2.3 (Architecture Simplification & Vision Auto-Routing)

---

## Executive Summary

This scope defines the next evolution of Open Orchestra, focusing on **deep subagent management**, **intelligent model orchestration**, and **comprehensive documentation**. Building on the simplified v0.2.3 architecture, we'll add production-grade worker lifecycle management, smarter model selection, and documentation that enables both users and AI agents to leverage the full system.

---

## Current State Analysis

### What We Have (v0.2.3)

| Component | Status | Quality |
|-----------|--------|---------|
| Worker Pool | ✅ Unified | Good - single source of truth |
| Spawner | ✅ Simplified | Good - clean spawn logic |
| Model Catalog | ✅ Functional | Medium - complex fuzzy matching |
| Profiles | ✅ 6 built-in | Good - well-designed defaults |
| Device Registry | ✅ File-based | Medium - no TTL, manual cleanup |
| Vision Routing | ✅ Auto-detect | Good - handles multiple formats |
| Documentation | ⚠️ Partial | Gaps in advanced topics |

### Key Gaps Identified

1. **Worker Health**: No active health monitoring while idle
2. **Model Resolution**: Assumes fallback model exists; no validation
3. **Profile Restrictions**: All-or-nothing tool permissions
4. **Session Management**: Potential orphaning on crashes
5. **Documentation**: Missing advanced topics, tool reference, architecture diagrams

---

## Phase 1: Worker Lifecycle Excellence

### 1.1 Active Health Monitoring

**Problem**: Workers can die silently between tasks. Device registry has stale entries.

**Solution**: Implement heartbeat-based health system.

```
┌─────────────────────────────────────────────────────────┐
│                    Health Monitor                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│   Worker Pool                                            │
│   ┌─────────┐  heartbeat   ┌─────────┐                  │
│   │ Worker  │◄────────────►│ Monitor │                  │
│   │ (ready) │   every 30s  │ Thread  │                  │
│   └─────────┘              └────┬────┘                  │
│                                 │                        │
│   ┌─────────┐              ┌────▼────┐                  │
│   │ Worker  │──── dead ───►│ Cleanup │                  │
│   │ (stale) │              │ Handler │                  │
│   └─────────┘              └─────────┘                  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Implementation**:
- `HealthMonitor` class in `src/core/health-monitor.ts`
- Configurable interval (default: 30s, min: 10s)
- Lightweight check: `session.list` call with 3s timeout
- On failure: 3 retries with exponential backoff
- On confirmed death: emit `worker:dead` event, clean registry

**Config Addition**:
```json
{
  "healthCheck": {
    "enabled": true,
    "intervalMs": 30000,
    "timeoutMs": 3000,
    "maxRetries": 3
  }
}
```

**Files to Create/Modify**:
- `src/core/health-monitor.ts` (new)
- `src/core/worker-pool.ts` (integrate monitor)
- `schema/orchestrator.schema.json` (add healthCheck)

---

### 1.2 Graceful Shutdown & Recovery

**Problem**: Crashes leave orphaned workers and sessions.

**Solution**: Implement shutdown hooks and recovery protocol.

**Shutdown Protocol**:
```
1. SIGINT/SIGTERM received
2. Set orchestrator state = "shutting_down"
3. For each owned worker:
   a. Send "orchestrator_shutdown" message
   b. Wait up to 5s for acknowledgment
   c. SIGTERM worker process
   d. Mark device registry entry as "orphaned"
4. Write recovery manifest to ~/.config/opencode/orchestrator-recovery.json
5. Exit cleanly
```

**Recovery Protocol**:
```
1. On orchestrator start
2. Check for recovery manifest
3. For each orphaned worker:
   a. Health check (is process alive?)
   b. If alive: attempt reconnection
   c. If dead: clean up device registry
4. Delete recovery manifest
5. Continue normal initialization
```

**Files to Create/Modify**:
- `src/core/shutdown.ts` (new)
- `src/core/recovery.ts` (new)
- `src/index.ts` (integrate shutdown/recovery)

---

### 1.3 Worker Pooling & Warm Starts

**Problem**: Spawning workers is slow (2-5s). Frequently used workers restart often.

**Solution**: Implement warm pool with pre-spawned workers.

**Warm Pool Design**:
```
┌─────────────────────────────────────────────────────────┐
│                      Warm Pool                           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│   ┌─────────────┐    ┌─────────────┐    ┌───────────┐   │
│   │   vision    │    │    coder    │    │  explorer │   │
│   │   (warm)    │    │   (warm)    │    │  (warm)   │   │
│   │  reserved   │    │  reserved   │    │ reserved  │   │
│   └──────┬──────┘    └──────┬──────┘    └─────┬─────┘   │
│          │                  │                  │         │
│          ▼                  ▼                  ▼         │
│   ┌─────────────────────────────────────────────────┐   │
│   │              Acquisition Queue                   │   │
│   │   task → acquire(profile) → worker → release    │   │
│   └─────────────────────────────────────────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Implementation**:
- `WarmPool` class managing pre-spawned workers
- Configurable pool size per profile (default: 0 = disabled)
- Lease-based acquisition: task acquires worker, releases on completion
- Automatic replenishment after lease release
- Idle timeout: release warm workers after N minutes of no use

**Config Addition**:
```json
{
  "warmPool": {
    "enabled": false,
    "profiles": {
      "coder": { "size": 1, "idleTimeoutMs": 300000 },
      "explorer": { "size": 2, "idleTimeoutMs": 120000 }
    }
  }
}
```

**Files to Create/Modify**:
- `src/core/warm-pool.ts` (new)
- `src/core/worker-pool.ts` (integrate warm pool)
- `schema/orchestrator.schema.json` (add warmPool)

---

## Phase 2: Intelligent Model Orchestration

### 2.1 Model Resolution Overhaul

**Problem**: Current resolution is complex with fragile assumptions.

**Solution**: Redesign with explicit validation and fallback chains.

**New Resolution Pipeline**:
```
┌─────────────────────────────────────────────────────────┐
│                  Model Resolution v2                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│   Input: "node:vision" or "anthropic/claude-3-sonnet"   │
│                          │                               │
│                          ▼                               │
│   ┌─────────────────────────────────────────────────┐   │
│   │            1. Parse & Classify                   │   │
│   │   - Is auto-tag? (auto:*, node:*)               │   │
│   │   - Is explicit? (provider/model)               │   │
│   │   - Is alias? (lookup alias table)              │   │
│   └───────────────────────┬─────────────────────────┘   │
│                           │                              │
│                           ▼                              │
│   ┌─────────────────────────────────────────────────┐   │
│   │            2. Provider Filtering                 │   │
│   │   - Auto-tag: configured providers only         │   │
│   │   - Explicit: all available providers           │   │
│   │   - Validate provider exists                    │   │
│   └───────────────────────┬─────────────────────────┘   │
│                           │                              │
│                           ▼                              │
│   ┌─────────────────────────────────────────────────┐   │
│   │            3. Capability Matching                │   │
│   │   - Vision: supportsVision === true             │   │
│   │   - Fast: contextWindow < 32k, small model      │   │
│   │   - Docs: reasoning + large context             │   │
│   │   - Code: function calling support              │   │
│   └───────────────────────┬─────────────────────────┘   │
│                           │                              │
│                           ▼                              │
│   ┌─────────────────────────────────────────────────┐   │
│   │            4. Scoring & Selection                │   │
│   │   - Score by capability match                   │   │
│   │   - Score by provider preference                │   │
│   │   - Score by cost (if available)                │   │
│   │   - Return top match or error with suggestions  │   │
│   └───────────────────────┬─────────────────────────┘   │
│                           │                              │
│                           ▼                              │
│   ┌─────────────────────────────────────────────────┐   │
│   │            5. Validation                         │   │
│   │   - Verify model exists in provider             │   │
│   │   - Verify capability requirements met          │   │
│   │   - Return validated ModelRef or error          │   │
│   └─────────────────────────────────────────────────┘   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**New Auto-Tags**:
| Tag | Purpose | Selection Criteria |
|-----|---------|-------------------|
| `auto` | Default model | Current session default |
| `auto:vision` | Vision tasks | `supportsVision: true` |
| `auto:fast` | Quick responses | Small context, fast inference |
| `auto:docs` | Research/docs | Large context, web access |
| `auto:code` | Code tasks | Function calling, large context |
| `auto:reasoning` | Complex tasks | Extended thinking support |
| `auto:cheap` | Cost-sensitive | Lowest cost per token |

**Model Aliases**:
```json
{
  "modelAliases": {
    "sonnet": "anthropic/claude-sonnet-4-20250514",
    "opus": "anthropic/claude-opus-4-20250514",
    "gpt4": "openai/gpt-4o",
    "gemini": "google/gemini-2.0-flash"
  }
}
```

**Files to Create/Modify**:
- `src/models/resolver.ts` (new - replaces complex catalog logic)
- `src/models/capabilities.ts` (new - capability detection)
- `src/models/aliases.ts` (new - alias management)
- `src/models/catalog.ts` (simplify, delegate to resolver)
- `schema/orchestrator.schema.json` (add modelAliases)

---

### 2.2 Model Capability Detection

**Problem**: Capability detection is implicit and scattered.

**Solution**: Centralize capability detection with explicit flags.

**Capability Schema**:
```typescript
interface ModelCapabilities {
  // Core capabilities
  supportsVision: boolean;
  supportsTools: boolean;
  supportsStreaming: boolean;

  // Context & memory
  contextWindow: number;
  maxOutputTokens: number;

  // Advanced features
  supportsReasoning: boolean;
  supportsWebSearch: boolean;
  supportsPDFAnalysis: boolean;
  supportsCodeExecution: boolean;

  // Cost (optional)
  inputCostPer1kTokens?: number;
  outputCostPer1kTokens?: number;

  // Performance hints
  averageLatencyMs?: number;
  throughputTokensPerSecond?: number;
}
```

**Detection Sources**:
1. **SDK metadata**: Primary source from OpenCode SDK
2. **Provider API**: Query provider for model info
3. **Local overrides**: User-specified capability overrides
4. **Inference**: Infer from model name patterns

**Files to Create**:
- `src/models/capabilities.ts` (capability detection)
- `src/models/capability-overrides.ts` (user overrides)

---

### 2.3 Cost-Aware Model Selection

**Problem**: No consideration of cost when selecting models.

**Solution**: Add optional cost-awareness to model selection.

**Cost Selection Modes**:
- `performance`: Best capability match (current behavior)
- `balanced`: Balance capability and cost
- `economical`: Minimize cost while meeting requirements

**Config Addition**:
```json
{
  "modelSelection": {
    "mode": "balanced",
    "maxCostPer1kTokens": 0.01,
    "preferredProviders": ["anthropic", "openai"]
  }
}
```

**Files to Create/Modify**:
- `src/models/cost.ts` (new - cost calculation)
- `src/models/resolver.ts` (integrate cost scoring)

---

## Phase 3: Advanced Profile System

### 3.1 Granular Tool Permissions

**Problem**: Tool restrictions are all-or-nothing.

**Solution**: Implement fine-grained permission system.

**Permission Schema**:
```typescript
interface ToolPermissions {
  // Category-level permissions
  categories?: {
    filesystem?: 'full' | 'read' | 'none';
    execution?: 'full' | 'sandboxed' | 'none';
    network?: 'full' | 'localhost' | 'none';
  };

  // Tool-level overrides
  tools?: {
    [toolName: string]: {
      enabled: boolean;
      constraints?: {
        // Tool-specific constraints
        [key: string]: unknown;
      };
    };
  };

  // Path restrictions
  paths?: {
    allowed?: string[];
    denied?: string[];
  };
}
```

**Example Profiles**:
```json
{
  "profiles": [
    {
      "id": "reviewer",
      "permissions": {
        "categories": {
          "filesystem": "read",
          "execution": "none"
        },
        "tools": {
          "Bash": {
            "enabled": true,
            "constraints": {
              "allowedCommands": ["git", "npm", "bun"],
              "deniedFlags": ["--force", "-f"]
            }
          }
        }
      }
    }
  ]
}
```

**Files to Create/Modify**:
- `src/permissions/schema.ts` (new - permission types)
- `src/permissions/validator.ts` (new - permission checking)
- `src/config/profiles.ts` (integrate permissions)
- `src/workers/spawner.ts` (enforce permissions at spawn)

---

### 3.2 Profile Inheritance & Composition

**Problem**: Can't easily extend built-in profiles.

**Solution**: Implement profile inheritance system.

**Inheritance Syntax**:
```json
{
  "profiles": [
    {
      "id": "safe-coder",
      "extends": "coder",
      "permissions": {
        "categories": {
          "execution": "sandboxed"
        }
      }
    },
    {
      "id": "full-stack",
      "compose": ["coder", "docs"],
      "model": "auto:code"
    }
  ]
}
```

**Files to Create/Modify**:
- `src/config/profile-inheritance.ts` (new)
- `src/config/profiles.ts` (integrate inheritance)

---

### 3.3 Dynamic Profile Discovery

**Problem**: Users must know exact profile IDs.

**Solution**: Implement semantic profile matching.

**Discovery API**:
```typescript
// Find best profile for a task description
findProfile("analyze this image and extract text") → "vision"
findProfile("write a REST API endpoint") → "coder"
findProfile("review this PR for security issues") → "architect"
```

**Implementation**:
- Embed profile descriptions and tags
- Use simple keyword matching (no ML required)
- Return confidence scores

**New Tool**:
```
suggest_worker purpose="<task description>"
→ Returns ranked list of suitable profiles with confidence
```

**Files to Create/Modify**:
- `src/profiles/discovery.ts` (new)
- `src/tools/tools-workers.ts` (add suggest_worker)

---

## Phase 4: Deep Documentation

### 4.1 Architecture Documentation

**New Documents**:

#### `docs/deep-dive/worker-lifecycle.md`
- Complete lifecycle diagram with state machine
- Spawn sequence with timing
- Health check protocol
- Shutdown and recovery flows
- Device registry mechanics

#### `docs/deep-dive/model-resolution.md`
- Resolution pipeline diagram
- Auto-tag reference table
- Scoring algorithm explanation
- Capability detection details
- Troubleshooting model issues

#### `docs/deep-dive/communication-protocol.md`
- Message format specification
- Stream chunk protocol
- Worker-to-worker communication
- Bridge server architecture
- Error handling patterns

#### `docs/deep-dive/memory-system.md`
- Neo4j schema documentation
- Memory injection pipeline
- Auto-recording configuration
- Query patterns and examples
- Performance considerations

---

### 4.2 Tool Reference Documentation

**Format**: One section per tool with:
- Description
- Parameters (with types and defaults)
- Return value structure
- Example usage
- Error conditions

**Tool Categories**:
```
docs/tools/
├── workers.md          # spawn_worker, ask_worker, stop_worker, etc.
├── profiles.md         # list_profiles, set_profile_model, etc.
├── models.md           # list_models, resolve_model, etc.
├── memory.md           # memory_put, memory_search, etc.
├── workflows.md        # run_workflow, list_workflows
└── diagnostics.md      # orchestrator_config, health_check, etc.
```

---

### 4.3 Configuration Reference

**New Document**: `docs/configuration-reference.md`

Complete reference for every configuration option:
- JSON path
- Type
- Default value
- Description
- Example
- Related options

**Auto-Generation**:
- Generate from JSON Schema
- Keep in sync with schema changes
- Include validation rules

---

### 4.4 Runbook Documentation

**New Documents**:

#### `docs/runbooks/troubleshooting.md`
- "Worker won't spawn" decision tree
- "Model not found" resolution steps
- "Session timeout" diagnosis
- "Memory not recording" checklist

#### `docs/runbooks/operations.md`
- Scaling worker counts
- Managing warm pools
- Monitoring health
- Cleaning up stale workers

#### `docs/runbooks/migration.md`
- v0.2.x → v0.3.0 migration guide
- Configuration changes
- Breaking changes
- Deprecation notices

---

## Implementation Phases

### Phase 1: Worker Lifecycle (2 weeks)
1. Health monitor implementation
2. Shutdown/recovery protocol
3. Warm pool foundation
4. Unit tests for all new code

### Phase 2: Model Orchestration (2 weeks)
1. Resolver redesign
2. Capability detection
3. Cost-aware selection
4. Integration tests

### Phase 3: Profile System (1 week)
1. Granular permissions
2. Profile inheritance
3. Dynamic discovery
4. Profile migration tools

### Phase 4: Documentation (1 week)
1. Architecture deep-dives
2. Tool reference
3. Configuration reference
4. Runbooks

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Worker spawn time (cold) | 2-5s | < 2s |
| Worker spawn time (warm) | N/A | < 100ms |
| Stale worker cleanup | Manual | Automatic |
| Model resolution failures | ~5% | < 1% |
| Documentation coverage | ~60% | > 95% |
| Tool reference completeness | 0% | 100% |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Warm pool memory usage | Medium | Medium | Configurable limits, idle timeout |
| Health check overhead | Low | Low | Lightweight checks, configurable interval |
| Permission complexity | Medium | High | Start simple, iterate |
| Documentation drift | High | Medium | Auto-generation, CI checks |

---

## Dependencies

- OpenCode SDK v1.0.164+ (current)
- Neo4j 6.x (for memory system)
- Node.js 20+ / Bun 1.0+

---

## Out of Scope (Future)

- Distributed worker support (multi-machine)
- WebSocket real-time communication
- Plugin marketplace
- GUI configuration interface
- Multi-tenant support

---

## Appendix A: File Structure Changes

```
src/
├── core/
│   ├── health-monitor.ts     (new)
│   ├── shutdown.ts           (new)
│   ├── recovery.ts           (new)
│   ├── warm-pool.ts          (new)
│   └── worker-pool.ts        (modified)
├── models/
│   ├── resolver.ts           (new)
│   ├── capabilities.ts       (new)
│   ├── aliases.ts            (new)
│   ├── cost.ts               (new)
│   └── catalog.ts            (simplified)
├── permissions/
│   ├── schema.ts             (new)
│   └── validator.ts          (new)
├── profiles/
│   ├── discovery.ts          (new)
│   └── inheritance.ts        (new)
└── config/
    └── profiles.ts           (modified)

docs/
├── deep-dive/
│   ├── worker-lifecycle.md   (new)
│   ├── model-resolution.md   (new)
│   ├── communication-protocol.md (new)
│   └── memory-system.md      (new)
├── tools/
│   ├── workers.md            (new)
│   ├── profiles.md           (new)
│   ├── models.md             (new)
│   ├── memory.md             (new)
│   ├── workflows.md          (new)
│   └── diagnostics.md        (new)
├── runbooks/
│   ├── troubleshooting.md    (new)
│   ├── operations.md         (new)
│   └── migration.md          (new)
└── configuration-reference.md (new)
```

---

## Appendix B: Schema Additions

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "properties": {
    "healthCheck": {
      "type": "object",
      "properties": {
        "enabled": { "type": "boolean", "default": true },
        "intervalMs": { "type": "number", "default": 30000, "minimum": 10000 },
        "timeoutMs": { "type": "number", "default": 3000 },
        "maxRetries": { "type": "number", "default": 3 }
      }
    },
    "warmPool": {
      "type": "object",
      "properties": {
        "enabled": { "type": "boolean", "default": false },
        "profiles": {
          "type": "object",
          "additionalProperties": {
            "type": "object",
            "properties": {
              "size": { "type": "number", "minimum": 0 },
              "idleTimeoutMs": { "type": "number", "minimum": 0 }
            }
          }
        }
      }
    },
    "modelSelection": {
      "type": "object",
      "properties": {
        "mode": { "enum": ["performance", "balanced", "economical"], "default": "performance" },
        "maxCostPer1kTokens": { "type": "number" },
        "preferredProviders": { "type": "array", "items": { "type": "string" } }
      }
    },
    "modelAliases": {
      "type": "object",
      "additionalProperties": { "type": "string" }
    }
  }
}
```

---

*Document prepared for v0.3.0 planning. Subject to revision based on implementation learnings.*
