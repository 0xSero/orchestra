# Open Orchestra Control Panel - v0.3.0 Scope of Work

## Executive Summary

This document scopes a comprehensive control panel web application for Open Orchestra that provides real-time monitoring, management, and control of the multi-agent orchestration system. The application consists of two major components:

1. **Control Panel Server** - HTTP/WebSocket server exposing orchestrator state and control APIs
2. **Control Panel UI** - Cross-platform TypeScript frontend (browser, mobile, desktop via PWA)

The system enables remote orchestrator control from any Tailscale-connected device without public internet exposure.

---

## Table of Contents

- [1. Architecture Overview](#1-architecture-overview)
- [2. Repository Restructure](#2-repository-restructure)
- [3. Server Implementation](#3-server-implementation)
- [4. Frontend Implementation](#4-frontend-implementation)
- [5. Real-Time Communication](#5-real-time-communication)
- [6. State Management](#6-state-management)
- [7. Authentication & Security](#7-authentication--security)
- [8. Testing Strategy](#8-testing-strategy)
- [9. Debugging & Observability](#9-debugging--observability)
- [10. Build & Deployment](#10-build--deployment)
- [11. Public Repo Hygiene](#11-public-repo-hygiene)
- [12. Implementation Phases](#12-implementation-phases)

---

## 1. Architecture Overview

### 1.1 System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Tailscale Network                                  │
│                                                                              │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │   Desktop    │   │    Laptop    │   │    Phone     │   │    Tablet    │ │
│  │   Browser    │   │   Browser    │   │    PWA       │   │    PWA       │ │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘ │
│         │                  │                  │                  │          │
│         └──────────────────┴────────┬─────────┴──────────────────┘          │
│                                     │                                        │
│                            ┌────────▼────────┐                              │
│                            │  Control Panel  │                              │
│                            │     Server      │                              │
│                            │  (localhost)    │                              │
│                            └────────┬────────┘                              │
│                                     │                                        │
│         ┌───────────────────────────┼───────────────────────────┐           │
│         │                           │                           │           │
│  ┌──────▼──────┐   ┌────────────────▼────────────────┐  ┌──────▼──────┐   │
│  │   Bridge    │   │     Open Orchestra Runtime      │  │   OpenCode  │   │
│  │   Server    │   │  ┌─────────────────────────┐   │  │   Server    │   │
│  │   (SSE)     │◄──┤  │      Worker Pool        │   │  │   (SDK)     │   │
│  └─────────────┘   │  │  ┌───────┐ ┌───────┐   │   │  └─────────────┘   │
│                    │  │  │Vision │ │ Docs  │   │   │                    │
│                    │  │  └───────┘ └───────┘   │   │                    │
│                    │  │  ┌───────┐ ┌───────┐   │   │                    │
│                    │  │  │Coder  │ │Arch   │   │   │                    │
│                    │  │  └───────┘ └───────┘   │   │                    │
│                    │  └─────────────────────────┘   │                    │
│                    │  ┌─────────────────────────┐   │                    │
│                    │  │      Job Registry       │   │                    │
│                    │  └─────────────────────────┘   │                    │
│                    └────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Tech Stack Decision

Based on AI SDK documentation and OpenCode SDK patterns:

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Server Runtime | Bun | Existing project uses Bun; native TypeScript support |
| HTTP Framework | Hono | Lightweight, Bun-native, OpenAPI support |
| Real-time | SSE + WebSocket | SSE for server→client, WS for bidirectional |
| Frontend | React + AI SDK UI | `useChat` hook provides streaming chat UI patterns |
| State | Zustand | Lightweight, TypeScript-first, works with React |
| Styling | Tailwind CSS | Utility-first, responsive, dark mode support |
| Charts | Recharts | React-native charts for metrics visualization |
| Mobile/Desktop | PWA | Single codebase, offline support, installable |

### 1.3 Key Integration Points

From the existing codebase:

```typescript
// src/core/worker-pool.ts - Worker Registry API
export const workerPool: {
  get(id: string): WorkerInstance | undefined;
  list(): WorkerInstance[];
  getActiveWorkers(): WorkerInstance[];
  updateStatus(id: string, status: WorkerStatus, error?: string): void;
  on(event: string, callback: Function): void;
  toJSON(): SerializedWorker[];
}

// src/core/jobs.ts - Job Registry API
export const workerJobs: {
  create(input): WorkerJob;
  get(id: string): WorkerJob | undefined;
  list(options?): WorkerJob[];
  setResult(id: string, input): void;
  setError(id: string, input): void;
  await(id: string, options?): Promise<WorkerJob>;
}

// src/core/bridge-server.ts - Stream Events
export const streamEmitter: EventEmitter;
export type StreamChunk = {
  workerId: string;
  jobId?: string;
  chunk: string;
  timestamp: number;
  final?: boolean;
}
```

---

## 2. Repository Restructure

As part of v0.3.0, the repository will be restructured for better clarity and maintainability.

### 2.1 Directory Philosophy

| Directory | Purpose | Generated? |
|-----------|---------|------------|
| `src/` | Source code | No |
| `dist/` | Build output | **Yes** (gitignored) |
| `docs/` | Documentation | No |
| `scripts/` | One-off tooling & generators | No |
| `test/` | Test files | No |
| `app/` | Control Panel application | No |
| `schema/` | JSON schemas | No |

### 2.2 Source Directory Restructure

**Current State (mixed concerns in `src/core/`):**
```
src/
├── core/
│   ├── runtime.ts
│   ├── worker-pool.ts
│   ├── jobs.ts
│   ├── bridge-server.ts
│   ├── health-monitor.ts
│   ├── shutdown.ts
│   ├── spawn-policy.ts
│   └── warm-pool.ts
├── workers/
├── tools/
├── models/
├── config/
├── workflows/
├── ux/
├── types/
└── ...
```

**Proposed Structure (grouped by responsibility):**
```
src/
├── core/                          # Runtime, lifecycle, orchestration
│   ├── runtime.ts                 # OrchestratorRuntime entry
│   ├── lifecycle.ts               # Startup/shutdown coordination
│   └── orchestration.ts           # High-level orchestration logic
│
├── workers/                       # Worker management
│   ├── pool.ts                    # WorkerPool class (was worker-pool.ts)
│   ├── spawner.ts                 # Spawn/stop/send functions
│   ├── warm-pool.ts               # Pre-spawn warm pool
│   ├── spawn-policy.ts            # Per-profile spawn control
│   ├── prompt.ts                  # Message building
│   └── types.ts                   # Worker-specific types
│
├── jobs/                          # Job tracking (extracted from core)
│   ├── registry.ts                # WorkerJobRegistry class
│   └── types.ts                   # Job types
│
├── bridge/                        # Bridge server & passthrough
│   ├── server.ts                  # HTTP bridge server
│   ├── stream.ts                  # SSE streaming
│   └── passthrough.ts             # Worker↔Orchestrator passthrough
│
├── infra/                         # Infrastructure concerns
│   ├── health-monitor.ts          # Health checking
│   ├── shutdown.ts                # Graceful shutdown
│   ├── telemetry.ts               # PostHog integration
│   └── logging.ts                 # Structured logging
│
├── models/                        # Model system
│   ├── catalog.ts                 # Model catalog building
│   ├── resolver.ts                # Auto-tag resolution
│   ├── capabilities.ts            # Capability detection
│   ├── aliases.ts                 # Model alias resolution
│   └── cost.ts                    # Cost calculations
│
├── config/                        # Configuration
│   ├── loader.ts                  # Config loading (was orchestrator.ts)
│   ├── profiles.ts                # Built-in profiles
│   ├── profile-inheritance.ts     # Extends/compose logic
│   ├── validation.ts              # Schema validation
│   └── opencode.ts                # OpenCode config merging
│
├── workflows/                     # Workflow system
│   ├── engine.ts                  # Workflow executor
│   ├── registry.ts                # Workflow registration
│   ├── builtins.ts                # Built-in workflows
│   └── types.ts                   # Workflow types
│
├── tools/                         # OpenCode tool definitions
│   ├── index.ts                   # Tool exports
│   ├── workers.ts                 # Worker management tools
│   ├── profiles.ts                # Profile tools
│   ├── workflows.ts               # Workflow tools
│   ├── memory.ts                  # Memory tools
│   ├── agents.ts                  # Agent tools
│   ├── ux.ts                      # UX/notification tools
│   └── state.ts                   # Shared state
│
├── permissions/                   # Permission system
│   ├── resolver.ts                # Permission resolution
│   └── types.ts                   # Permission types
│
├── ux/                            # UX integration
│   ├── context-injection.ts       # System context injection
│   └── notifications.ts           # Toast/notification system
│
├── memory/                        # Neo4j memory system
│   ├── client.ts                  # Neo4j client
│   ├── operations.ts              # CRUD operations
│   └── types.ts                   # Memory types
│
├── types/                         # Shared types (re-exported)
│   └── index.ts                   # All type exports
│
├── utils/                         # Utility helpers
│   ├── format.ts                  # Formatting utilities
│   ├── async.ts                   # Async utilities
│   └── validation.ts              # Validation helpers
│
└── index.ts                       # Plugin entry point
```

### 2.3 Import Path Updates

After restructure, imports will be cleaner and more intentional:

```typescript
// Before
import { workerPool } from "./core/worker-pool";
import { workerJobs } from "./core/jobs";
import { startBridgeServer } from "./core/bridge-server";
import { healthMonitor } from "./core/health-monitor";

// After
import { workerPool } from "./workers/pool";
import { workerJobs } from "./jobs/registry";
import { startBridgeServer } from "./bridge/server";
import { healthMonitor } from "./infra/health-monitor";
```

### 2.4 Barrel Exports

Each major directory will have an `index.ts` for clean imports:

```typescript
// src/workers/index.ts
export { workerPool, WorkerPool } from "./pool";
export { spawnWorker, stopWorker, sendToWorker } from "./spawner";
export { WarmPool } from "./warm-pool";
export { resolveSpawnPolicy } from "./spawn-policy";
export type { WorkerInstance, WorkerProfile, WorkerStatus } from "./types";

// Consumer usage
import { workerPool, spawnWorker, type WorkerInstance } from "./workers";
```

### 2.5 Migration Strategy

The restructure will be done incrementally to avoid breaking changes:

1. **Phase 1: Create new directories** - Add new folder structure
2. **Phase 2: Move files with aliases** - Move files, update imports, add re-exports from old locations
3. **Phase 3: Update all imports** - Replace old import paths with new ones
4. **Phase 4: Remove aliases** - Delete old re-export files
5. **Phase 5: Verify** - Run tests, typecheck, build

### 2.6 App Directory Structure

The control panel lives in `/app` with clear separation:

```
app/
├── server/                        # Control panel backend
│   ├── index.ts                   # Server entry
│   ├── routes/                    # API routes
│   ├── middleware/                # HTTP middleware
│   ├── services/                  # Business logic
│   ├── ws/                        # WebSocket handlers
│   └── types/                     # Server types
│
├── web/                           # Control panel frontend
│   ├── src/
│   │   ├── main.tsx               # React entry
│   │   ├── App.tsx                # Root component
│   │   ├── api/                   # API client
│   │   ├── stores/                # Zustand stores
│   │   ├── components/            # React components
│   │   ├── pages/                 # Page components
│   │   ├── hooks/                 # Custom hooks
│   │   └── lib/                   # Utilities
│   ├── public/                    # Static assets
│   ├── index.html
│   └── vite.config.ts
│
├── e2e/                           # E2E tests (Playwright)
│   ├── tests/
│   └── playwright.config.ts
│
├── data/                          # Runtime data (gitignored)
│   └── chat-history.sqlite
│
└── package.json                   # App-specific deps
```

---

## 3. Server Implementation

### 3.1 Directory Structure

```
app/
├── server/
│   ├── index.ts              # Server entry point
│   ├── routes/
│   │   ├── workers.ts        # Worker CRUD endpoints
│   │   ├── jobs.ts           # Job management endpoints
│   │   ├── sessions.ts       # Session/chat endpoints
│   │   ├── models.ts         # Model catalog endpoints
│   │   ├── profiles.ts       # Profile management
│   │   ├── workflows.ts      # Workflow queue/control
│   │   ├── config.ts         # Configuration endpoints
│   │   └── stream.ts         # SSE streaming endpoints
│   ├── middleware/
│   │   ├── auth.ts           # Bearer token validation
│   │   ├── cors.ts           # CORS for Tailscale
│   │   └── logging.ts        # Request logging
│   ├── services/
│   │   ├── orchestrator.ts   # Orchestrator integration
│   │   ├── chat-history.ts   # Chat persistence
│   │   └── queue.ts          # Workflow queue manager
│   ├── ws/
│   │   ├── handler.ts        # WebSocket connection handler
│   │   └── messages.ts       # WS message types
│   └── types/
│       └── api.ts            # API type definitions
```

### 3.2 API Endpoints

Based on OpenCode server patterns (`https://opencode.ai/docs/server`):

#### 3.2.1 Worker Management

```typescript
// GET /api/workers
// Returns: WorkerInstance[]
// Reference: workerPool.toJSON() from src/core/worker-pool.ts:253-275

interface WorkerListResponse {
  workers: Array<{
    id: string;
    name: string;
    model: string;
    modelResolution: string;       // How model was resolved (node:vision → actual ID)
    purpose: string;
    whenToUse: string;
    status: "starting" | "ready" | "busy" | "error" | "stopped";
    port: number;
    pid?: number;
    serverUrl?: string;
    supportsVision: boolean;
    supportsWeb: boolean;
    lastActivity?: string;         // ISO timestamp
    currentTask?: string;
    warning?: string;
    lastResult?: {
      at: string;
      jobId?: string;
      durationMs?: number;
      response: string;
      report?: WorkerJobReport;
    };
  }>;
  meta: {
    total: number;
    active: number;
    timestamp: number;
  };
}

// POST /api/workers
// Spawn a new worker
// Reference: spawnWorker() from src/workers/spawner.ts:89-190
interface SpawnWorkerRequest {
  profileId: string;               // e.g., "vision", "coder", "docs"
  options?: {
    directory?: string;            // Working directory
    systemPrompt?: string;         // Override system prompt
    model?: string;                // Override model
  };
}

// DELETE /api/workers/:id
// Stop a worker
// Reference: stopWorker() from src/workers/spawner.ts:192-230

// POST /api/workers/:id/message
// Send message to worker (sync)
// Reference: sendToWorker() from src/workers/spawner.ts:232-320
interface SendMessageRequest {
  content: string;
  attachments?: Array<{
    type: "image" | "file";
    path?: string;
    base64?: string;
    mimeType?: string;
  }>;
  timeout?: number;                // Default: 120000ms
}

// POST /api/workers/:id/message/async
// Send message to worker (async, returns jobId)
// Reference: workerJobs.create() from src/core/jobs.ts:34-48
interface AsyncMessageResponse {
  jobId: string;
  workerId: string;
  status: "running";
  startedAt: number;
}
```

#### 3.2.2 Job Management

```typescript
// GET /api/jobs
// List all jobs with optional filtering
// Reference: workerJobs.list() from src/core/jobs.ts:54-61
interface JobListRequest {
  workerId?: string;
  status?: "running" | "succeeded" | "failed" | "canceled";
  limit?: number;                  // Default: 50, Max: 200
}

interface JobListResponse {
  jobs: WorkerJob[];               // From src/core/jobs.ts:12-25
  meta: {
    total: number;
    running: number;
    succeeded: number;
    failed: number;
  };
}

// GET /api/jobs/:id
// Get specific job details
// Reference: workerJobs.get() from src/core/jobs.ts:50-52

// POST /api/jobs/:id/await
// Wait for job completion with timeout
// Reference: workerJobs.await() from src/core/jobs.ts:92-109
interface AwaitJobRequest {
  timeoutMs?: number;              // Default: 600000ms (10 min)
}

// POST /api/jobs/:id/cancel
// Cancel a running job
// Requires: Adding cancel() method to WorkerJobRegistry
```

#### 3.2.3 Session Management (Chat History)

```typescript
// GET /api/sessions
// List all tracked sessions (worker conversations)
// Data source: Device registry + per-worker sessions

interface Session {
  id: string;
  workerId: string;
  title?: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  directory: string;
}

// GET /api/sessions/:workerId
// Get full conversation history for a worker
// Reference: OpenCode SDK client.session.prompt()

interface SessionMessages {
  sessionId: string;
  workerId: string;
  messages: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    parts: Part[];                 // UIMessage parts from AI SDK
    createdAt: number;
    toolCalls?: ToolCall[];
    toolResults?: ToolResult[];
  }>;
}

// POST /api/sessions/:workerId/fork
// Fork session at a specific message
// Reference: client.session.fork() from OpenCode SDK
```

#### 3.2.4 Model & Profile Management

```typescript
// GET /api/models
// List available models from catalog
// Reference: src/models/catalog.ts:35-85

interface ModelCatalogEntry {
  id: string;                      // e.g., "anthropic/claude-sonnet-4-5"
  provider: string;
  name: string;
  capabilities: {
    supportsVision: boolean;
    supportsTools: boolean;
    supportsReasoning: boolean;
    contextWindow: number;
  };
  cost: {
    inputPer1k: number;
    outputPer1k: number;
  };
  configured: boolean;             // Provider has valid API key
}

// GET /api/profiles
// List worker profiles (built-in + custom)
// Reference: getProfiles() from src/config/profiles.ts

// PATCH /api/profiles/:id
// Update profile model assignment
// Reference: set_profile_model tool from src/tools/tools-profiles.ts
interface UpdateProfileRequest {
  model?: string;
  systemPrompt?: string;
  temperature?: number;
}
```

#### 3.2.5 Workflow Management

```typescript
// GET /api/workflows
// List registered workflows
// Reference: listWorkflows() from src/workflows/index.ts

interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  steps: Array<{
    id: string;
    title: string;
    workerId: string;
    prompt: string;
    carry: boolean;
  }>;
}

// POST /api/workflows/:id/queue
// Queue a workflow for execution
// Reference: runWorkflow() from src/workflows/engine.ts
interface QueueWorkflowRequest {
  task: string;
  attachments?: Attachment[];
  priority?: "low" | "normal" | "high";
  scheduleAt?: number;             // Future timestamp for scheduled execution
}

interface QueuedWorkflow {
  queueId: string;
  workflowId: string;
  status: "queued" | "running" | "completed" | "failed";
  position: number;                // Position in queue
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  steps: Array<{
    id: string;
    status: "pending" | "running" | "completed" | "failed";
    workerId?: string;
    startedAt?: number;
    completedAt?: number;
    response?: string;
  }>;
}

// GET /api/workflows/queue
// List queued and running workflows

// DELETE /api/workflows/queue/:queueId
// Cancel a queued workflow
```

#### 3.2.6 Configuration

```typescript
// GET /api/config
// Get current orchestrator configuration
// Reference: loadOrchestratorConfig() from src/config/orchestrator.ts

// PATCH /api/config
// Update configuration (runtime only, doesn't persist)
// Fields: autoSpawn, spawnOnDemand, ui.toasts, etc.

// POST /api/config/save
// Persist configuration to file
// Target: .opencode/orchestrator.json (project) or global
```

#### 3.2.7 Real-Time Streaming

```typescript
// GET /api/stream
// SSE endpoint for real-time updates
// Reference: Bridge server SSE from src/core/bridge-server.ts:88-127

// Query params:
// - workerId: Filter by worker
// - jobId: Filter by job
// - events: Comma-separated event types to subscribe

// Event types:
// - worker:status - Worker status changes
// - worker:output - Streaming text chunks
// - job:created - New job started
// - job:completed - Job finished
// - job:failed - Job failed
// - workflow:progress - Workflow step updates

// SSE event format (based on AI SDK streaming protocol):
interface SSEEvent {
  type: string;
  data: {
    timestamp: number;
    workerId?: string;
    jobId?: string;
    payload: unknown;
  };
}
```

### 3.3 Server Implementation Details

#### 3.3.1 Hono Server Setup

```typescript
// app/server/index.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { bearerAuth } from "hono/bearer-auth";
import { streamSSE } from "hono/streaming";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors({
  origin: ["http://localhost:*", "http://100.*"],  // Tailscale IPs
  credentials: true,
}));

// Auth - token from environment or generated
const token = process.env.CONTROL_PANEL_TOKEN || crypto.randomUUID();
app.use("/api/*", bearerAuth({ token }));

// SSE streaming (AI SDK pattern)
app.get("/api/stream", async (c) => {
  return streamSSE(c, async (stream) => {
    const workerId = c.req.query("workerId");
    const jobId = c.req.query("jobId");

    // Subscribe to streamEmitter from bridge-server.ts
    const onChunk = (chunk: StreamChunk) => {
      if (workerId && chunk.workerId !== workerId) return;
      if (jobId && chunk.jobId !== jobId) return;

      stream.writeSSE({
        data: JSON.stringify(chunk),
        event: "worker:output",
      });
    };

    streamEmitter.on("chunk", onChunk);

    // Also subscribe to worker status events
    const onStatus = (event: { worker: WorkerInstance }) => {
      stream.writeSSE({
        data: JSON.stringify(event.worker),
        event: "worker:status",
      });
    };

    workerPool.on("ready", onStatus);
    workerPool.on("busy", onStatus);
    workerPool.on("error", onStatus);

    // Keep-alive
    const interval = setInterval(() => {
      stream.writeSSE({ data: "", event: "ping" });
    }, 30000);

    // Cleanup on disconnect
    c.req.raw.signal.addEventListener("abort", () => {
      clearInterval(interval);
      streamEmitter.off("chunk", onChunk);
      workerPool.off("ready", onStatus);
      workerPool.off("busy", onStatus);
      workerPool.off("error", onStatus);
    });

    // Keep connection open
    await new Promise(() => {});
  });
});
```

#### 3.3.2 Workflow Queue Service

New component for queuing workflows:

```typescript
// app/server/services/queue.ts

interface QueuedItem {
  id: string;
  workflowId: string;
  task: string;
  attachments?: Attachment[];
  priority: "low" | "normal" | "high";
  scheduledAt: number;
  createdAt: number;
  status: "queued" | "running" | "completed" | "failed";
}

export class WorkflowQueue {
  private queue: QueuedItem[] = [];
  private running: Map<string, QueuedItem> = new Map();
  private maxConcurrent = 2;  // Configurable

  async enqueue(item: Omit<QueuedItem, "id" | "createdAt" | "status">) {
    const queuedItem: QueuedItem = {
      id: crypto.randomUUID(),
      ...item,
      createdAt: Date.now(),
      status: "queued",
    };

    this.queue.push(queuedItem);
    this.sortQueue();
    this.processNext();

    return queuedItem;
  }

  private sortQueue() {
    // Sort by priority (high first), then by scheduledAt
    this.queue.sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return a.scheduledAt - b.scheduledAt;
    });
  }

  private async processNext() {
    if (this.running.size >= this.maxConcurrent) return;

    const now = Date.now();
    const next = this.queue.find(item =>
      item.status === "queued" && item.scheduledAt <= now
    );

    if (!next) return;

    next.status = "running";
    this.running.set(next.id, next);
    this.queue = this.queue.filter(item => item.id !== next.id);

    try {
      // Execute workflow using existing engine
      await runWorkflow({
        workflowId: next.workflowId,
        task: next.task,
        attachments: next.attachments,
      }, deps);

      next.status = "completed";
    } catch (error) {
      next.status = "failed";
    } finally {
      this.running.delete(next.id);
      this.processNext();
    }
  }
}
```

#### 3.3.3 Chat History Persistence

```typescript
// app/server/services/chat-history.ts

// Use SQLite for lightweight persistence (file-based, no server needed)
import { Database } from "bun:sqlite";

const db = new Database("app/data/chat-history.sqlite");

// Schema
db.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    worker_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    parts TEXT,  -- JSON
    tool_calls TEXT,  -- JSON
    tool_results TEXT,  -- JSON
    created_at INTEGER NOT NULL,
    INDEX idx_session (session_id),
    INDEX idx_worker (worker_id)
  )
`);

export function saveMessage(msg: Message) {
  db.run(`
    INSERT INTO messages (id, session_id, worker_id, role, content, parts, tool_calls, tool_results, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    msg.id,
    msg.sessionId,
    msg.workerId,
    msg.role,
    msg.content,
    JSON.stringify(msg.parts),
    JSON.stringify(msg.toolCalls),
    JSON.stringify(msg.toolResults),
    msg.createdAt,
  ]);
}

export function getSessionMessages(workerId: string, limit = 100): Message[] {
  return db.query(`
    SELECT * FROM messages
    WHERE worker_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(workerId, limit) as Message[];
}
```

---

## 4. Frontend Implementation

### 4.1 Directory Structure

```
app/
├── web/
│   ├── src/
│   │   ├── main.tsx             # React entry point
│   │   ├── App.tsx              # Root component with routing
│   │   ├── api/
│   │   │   ├── client.ts        # API client (fetch wrapper)
│   │   │   ├── types.ts         # API response types
│   │   │   └── hooks.ts         # React Query hooks
│   │   ├── stores/
│   │   │   ├── workers.ts       # Worker state (Zustand)
│   │   │   ├── jobs.ts          # Job state
│   │   │   ├── chat.ts          # Chat/session state
│   │   │   └── ui.ts            # UI state (panels, modals)
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── Header.tsx
│   │   │   │   └── MobileNav.tsx
│   │   │   ├── workers/
│   │   │   │   ├── WorkerCard.tsx
│   │   │   │   ├── WorkerGrid.tsx
│   │   │   │   ├── WorkerDetail.tsx
│   │   │   │   ├── SpawnDialog.tsx
│   │   │   │   └── StatusBadge.tsx
│   │   │   ├── jobs/
│   │   │   │   ├── JobList.tsx
│   │   │   │   ├── JobCard.tsx
│   │   │   │   └── JobOutput.tsx
│   │   │   ├── chat/
│   │   │   │   ├── ChatPanel.tsx
│   │   │   │   ├── MessageList.tsx
│   │   │   │   ├── MessageBubble.tsx
│   │   │   │   ├── ChatInput.tsx
│   │   │   │   └── ToolCallDisplay.tsx
│   │   │   ├── workflows/
│   │   │   │   ├── WorkflowQueue.tsx
│   │   │   │   ├── WorkflowCard.tsx
│   │   │   │   └── QueueWorkflowDialog.tsx
│   │   │   ├── models/
│   │   │   │   ├── ModelSelector.tsx
│   │   │   │   └── ModelCatalog.tsx
│   │   │   └── common/
│   │   │       ├── Button.tsx
│   │   │       ├── Card.tsx
│   │   │       ├── Input.tsx
│   │   │       ├── Modal.tsx
│   │   │       └── Toast.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx    # Overview with all workers
│   │   │   ├── Workers.tsx      # Worker management
│   │   │   ├── Chat.tsx         # Chat interface
│   │   │   ├── Workflows.tsx    # Workflow queue
│   │   │   ├── Models.tsx       # Model catalog
│   │   │   ├── Config.tsx       # Configuration
│   │   │   └── Logs.tsx         # System logs
│   │   ├── hooks/
│   │   │   ├── useSSE.ts        # SSE subscription hook
│   │   │   ├── useChat.ts       # AI SDK useChat wrapper
│   │   │   └── useWorker.ts     # Worker-specific hooks
│   │   └── lib/
│   │       ├── stream.ts        # SSE parsing utilities
│   │       └── format.ts        # Formatters (dates, durations)
│   ├── public/
│   │   ├── manifest.json        # PWA manifest
│   │   ├── sw.js                # Service worker
│   │   └── icons/               # App icons
│   ├── index.html
│   ├── tailwind.config.ts
│   ├── vite.config.ts
│   └── tsconfig.json
```

### 4.2 Core React Components

#### 4.2.1 Worker Dashboard

```tsx
// app/web/src/pages/Dashboard.tsx
import { useWorkers } from "../hooks/useWorker";
import { WorkerGrid } from "../components/workers/WorkerGrid";
import { JobList } from "../components/jobs/JobList";
import { WorkflowQueue } from "../components/workflows/WorkflowQueue";

export function Dashboard() {
  const { workers, isLoading } = useWorkers();

  const stats = {
    total: workers.length,
    active: workers.filter(w => w.status === "ready" || w.status === "busy").length,
    busy: workers.filter(w => w.status === "busy").length,
    errors: workers.filter(w => w.status === "error").length,
  };

  return (
    <div className="grid grid-cols-12 gap-6 p-6">
      {/* Stats Row */}
      <div className="col-span-12 grid grid-cols-4 gap-4">
        <StatCard title="Total Workers" value={stats.total} />
        <StatCard title="Active" value={stats.active} variant="success" />
        <StatCard title="Busy" value={stats.busy} variant="warning" />
        <StatCard title="Errors" value={stats.errors} variant="error" />
      </div>

      {/* Workers Grid */}
      <div className="col-span-8">
        <h2 className="text-xl font-semibold mb-4">Workers</h2>
        <WorkerGrid workers={workers} />
      </div>

      {/* Sidebar */}
      <div className="col-span-4 space-y-6">
        <section>
          <h2 className="text-xl font-semibold mb-4">Recent Jobs</h2>
          <JobList limit={5} />
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-4">Workflow Queue</h2>
          <WorkflowQueue />
        </section>
      </div>
    </div>
  );
}
```

#### 4.2.2 Chat Interface (Using AI SDK UI Patterns)

Based on `useChat` patterns from AI SDK documentation:

```tsx
// app/web/src/components/chat/ChatPanel.tsx
import { useCallback, useRef, useEffect } from "react";
import { useWorkerChat } from "../../hooks/useChat";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";

interface ChatPanelProps {
  workerId: string;
}

export function ChatPanel({ workerId }: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    status,
    error,
    sendMessage,
    regenerate,
    stop,
  } = useWorkerChat(workerId);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = useCallback((text: string, files?: File[]) => {
    sendMessage({ text, files });
  }, [sendMessage]);

  return (
    <div className="flex flex-col h-full">
      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4">
        <MessageList messages={messages} />
        <div ref={messagesEndRef} />
      </div>

      {/* Error Display */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-200">
          <p className="text-red-700 text-sm">An error occurred</p>
          <button
            onClick={regenerate}
            className="text-red-600 underline text-sm"
          >
            Retry
          </button>
        </div>
      )}

      {/* Status Bar */}
      {status === "streaming" && (
        <div className="px-4 py-2 bg-blue-50 border-t">
          <div className="flex items-center gap-2">
            <div className="animate-pulse h-2 w-2 bg-blue-500 rounded-full" />
            <span className="text-sm text-blue-700">Streaming response...</span>
            <button onClick={stop} className="text-blue-600 underline text-sm">
              Stop
            </button>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t p-4">
        <ChatInput
          onSubmit={handleSubmit}
          disabled={status === "streaming" || status === "submitted"}
        />
      </div>
    </div>
  );
}
```

#### 4.2.3 useWorkerChat Hook (AI SDK Integration)

```tsx
// app/web/src/hooks/useChat.ts
import { useState, useCallback, useEffect, useRef } from "react";
import { useSSE } from "./useSSE";
import { api } from "../api/client";

// AI SDK UI-compatible message format
interface UIMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  parts: Part[];
  createdAt: Date;
}

type ChatStatus = "ready" | "submitted" | "streaming" | "error";

export function useWorkerChat(workerId: string) {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [error, setError] = useState<Error | null>(null);
  const pendingMessageRef = useRef<UIMessage | null>(null);

  // SSE subscription for streaming
  const { subscribe, unsubscribe } = useSSE();

  // Load initial messages
  useEffect(() => {
    api.sessions.getMessages(workerId).then(setMessages);
  }, [workerId]);

  const sendMessage = useCallback(async (input: { text: string; files?: File[] }) => {
    setError(null);
    setStatus("submitted");

    // Optimistic update - add user message immediately
    const userMessage: UIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.text,
      parts: [{ type: "text", text: input.text }],
      createdAt: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);

    // Create placeholder for assistant response
    const assistantMessage: UIMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      parts: [],
      createdAt: new Date(),
    };
    pendingMessageRef.current = assistantMessage;
    setMessages(prev => [...prev, assistantMessage]);

    try {
      // Subscribe to streaming updates for this worker
      const eventSource = subscribe(`/api/stream?workerId=${workerId}`);

      eventSource.addEventListener("worker:output", (event) => {
        const chunk = JSON.parse(event.data);
        setStatus("streaming");

        // Update pending message with streamed content
        setMessages(prev => prev.map(msg =>
          msg.id === pendingMessageRef.current?.id
            ? { ...msg, content: msg.content + chunk.chunk }
            : msg
        ));

        if (chunk.final) {
          setStatus("ready");
          pendingMessageRef.current = null;
          unsubscribe();
        }
      });

      // Send the actual request
      await api.workers.sendMessage(workerId, {
        content: input.text,
        attachments: input.files ? await convertFilesToAttachments(input.files) : undefined,
      });

    } catch (err) {
      setError(err as Error);
      setStatus("error");
      // Remove placeholder on error
      setMessages(prev => prev.filter(msg => msg.id !== pendingMessageRef.current?.id));
    }
  }, [workerId, subscribe, unsubscribe]);

  const regenerate = useCallback(async () => {
    const lastUserMessage = messages.filter(m => m.role === "user").pop();
    if (!lastUserMessage) return;

    // Remove last assistant message
    setMessages(prev => {
      const lastAssistantIdx = prev.findLastIndex(m => m.role === "assistant");
      return prev.slice(0, lastAssistantIdx);
    });

    // Resend last user message
    await sendMessage({ text: lastUserMessage.content });
  }, [messages, sendMessage]);

  const stop = useCallback(() => {
    // Abort the stream
    unsubscribe();
    setStatus("ready");
  }, [unsubscribe]);

  return {
    messages,
    status,
    error,
    sendMessage,
    regenerate,
    stop,
  };
}
```

#### 4.2.4 Message Rendering with Tool Calls

Based on AI SDK `message.parts` rendering pattern:

```tsx
// app/web/src/components/chat/MessageBubble.tsx
import { UIMessage } from "../../hooks/useChat";
import { ToolCallDisplay } from "./ToolCallDisplay";

interface MessageBubbleProps {
  message: UIMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div className={`
        max-w-[80%] rounded-lg px-4 py-2
        ${isUser
          ? "bg-blue-500 text-white"
          : "bg-gray-100 text-gray-900"
        }
      `}>
        {/* Render parts instead of raw content (AI SDK pattern) */}
        {message.parts.map((part, index) => {
          switch (part.type) {
            case "text":
              return <span key={index}>{part.text}</span>;

            case "tool-call":
              return (
                <ToolCallDisplay
                  key={index}
                  name={part.toolName}
                  args={part.args}
                  status="pending"
                />
              );

            case "tool-result":
              return (
                <ToolCallDisplay
                  key={index}
                  name={part.toolName}
                  result={part.result}
                  status="completed"
                />
              );

            case "reasoning":
              return (
                <details key={index} className="text-sm text-gray-500 mt-2">
                  <summary>Reasoning</summary>
                  <pre className="whitespace-pre-wrap">{part.text}</pre>
                </details>
              );

            default:
              return null;
          }
        })}
      </div>
    </div>
  );
}
```

### 4.3 Responsive Design

```tsx
// app/web/src/components/layout/ResponsiveLayout.tsx
import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";

export function ResponsiveLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile header */}
      <div className="lg:hidden">
        <MobileNav onMenuClick={() => setSidebarOpen(true)} />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - hidden on mobile, always visible on desktop */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white border-r
        transform transition-transform duration-200
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0
      `}>
        <Sidebar />
      </aside>

      {/* Main content */}
      <main className="lg:ml-64">
        {children}
      </main>
    </div>
  );
}
```

### 4.4 PWA Configuration

```json
// app/web/public/manifest.json
{
  "name": "Open Orchestra Control Panel",
  "short_name": "Orchestra",
  "description": "Control panel for Open Orchestra multi-agent system",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#3b82f6",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

---

## 5. Real-Time Communication

### 5.1 SSE for Server → Client

Based on AI SDK streaming patterns and existing bridge-server.ts:

```typescript
// app/server/routes/stream.ts
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { streamEmitter } from "../../../src/core/bridge-server";
import { workerPool } from "../../../src/core/worker-pool";
import { workerJobs } from "../../../src/core/jobs";

export const streamRoutes = new Hono();

// Event types
type StreamEvent =
  | { type: "worker:status"; data: WorkerInstance }
  | { type: "worker:output"; data: StreamChunk }
  | { type: "job:created"; data: WorkerJob }
  | { type: "job:completed"; data: WorkerJob }
  | { type: "job:failed"; data: WorkerJob }
  | { type: "workflow:progress"; data: WorkflowProgress };

streamRoutes.get("/", async (c) => {
  const filters = {
    workerId: c.req.query("workerId"),
    jobId: c.req.query("jobId"),
    events: c.req.query("events")?.split(","),
  };

  return streamSSE(c, async (stream) => {
    // Initial state snapshot
    stream.writeSSE({
      event: "snapshot",
      data: JSON.stringify({
        workers: workerPool.toJSON(),
        jobs: workerJobs.list({ limit: 20 }),
        timestamp: Date.now(),
      }),
    });

    // Worker output chunks (from bridge server)
    const onChunk = (chunk: StreamChunk) => {
      if (filters.workerId && chunk.workerId !== filters.workerId) return;
      if (filters.jobId && chunk.jobId !== filters.jobId) return;
      if (filters.events && !filters.events.includes("worker:output")) return;

      stream.writeSSE({
        event: "worker:output",
        data: JSON.stringify(chunk),
      });
    };
    streamEmitter.on("chunk", onChunk);

    // Worker status changes
    const onWorkerEvent = (event: string) => (data: { worker: WorkerInstance }) => {
      if (filters.workerId && data.worker.profile.id !== filters.workerId) return;
      if (filters.events && !filters.events.includes("worker:status")) return;

      stream.writeSSE({
        event: "worker:status",
        data: JSON.stringify({ ...data.worker, event }),
      });
    };

    workerPool.on("spawn", onWorkerEvent("spawn"));
    workerPool.on("ready", onWorkerEvent("ready"));
    workerPool.on("busy", onWorkerEvent("busy"));
    workerPool.on("error", onWorkerEvent("error"));
    workerPool.on("stop", onWorkerEvent("stop"));

    // Keep-alive ping (30s)
    const pingInterval = setInterval(() => {
      stream.writeSSE({ event: "ping", data: "" });
    }, 30000);

    // Cleanup on disconnect
    c.req.raw.signal.addEventListener("abort", () => {
      clearInterval(pingInterval);
      streamEmitter.off("chunk", onChunk);
      // Remove worker event listeners...
    });

    // Keep connection open indefinitely
    await new Promise(() => {});
  });
});
```

### 5.2 WebSocket for Bidirectional Control

```typescript
// app/server/ws/handler.ts
import type { ServerWebSocket } from "bun";

interface WSMessage {
  type: string;
  id: string;  // Client-generated request ID for correlation
  payload: unknown;
}

interface WSResponse {
  type: string;
  id: string;  // Echo back the request ID
  success: boolean;
  payload?: unknown;
  error?: string;
}

export function handleWebSocket(ws: ServerWebSocket) {
  ws.subscribe("broadcast");  // Subscribe to broadcast channel

  ws.onmessage = async (event) => {
    const msg: WSMessage = JSON.parse(event.data);

    try {
      let result: unknown;

      switch (msg.type) {
        case "spawn_worker":
          result = await spawnWorker(msg.payload as SpawnWorkerRequest);
          break;

        case "stop_worker":
          result = await stopWorker(msg.payload.workerId);
          break;

        case "send_message":
          result = await sendToWorker(
            msg.payload.workerId,
            msg.payload.content,
            msg.payload.options
          );
          break;

        case "queue_workflow":
          result = await workflowQueue.enqueue(msg.payload);
          break;

        case "cancel_workflow":
          result = await workflowQueue.cancel(msg.payload.queueId);
          break;

        default:
          throw new Error(`Unknown message type: ${msg.type}`);
      }

      ws.send(JSON.stringify({
        type: `${msg.type}:response`,
        id: msg.id,
        success: true,
        payload: result,
      } as WSResponse));

    } catch (error) {
      ws.send(JSON.stringify({
        type: `${msg.type}:error`,
        id: msg.id,
        success: false,
        error: (error as Error).message,
      } as WSResponse));
    }
  };
}
```

### 5.3 Client-Side SSE Hook

```typescript
// app/web/src/hooks/useSSE.ts
import { useRef, useCallback, useEffect } from "react";
import { useAuthToken } from "../stores/auth";

export function useSSE() {
  const eventSourceRef = useRef<EventSource | null>(null);
  const token = useAuthToken();

  const subscribe = useCallback((url: string): EventSource => {
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Add auth token to URL
    const fullUrl = `${url}${url.includes("?") ? "&" : "?"}token=${token}`;

    const eventSource = new EventSource(fullUrl);
    eventSourceRef.current = eventSource;

    eventSource.onerror = (error) => {
      console.error("SSE error:", error);
      // Reconnect after 5s
      setTimeout(() => subscribe(url), 5000);
    };

    return eventSource;
  }, [token]);

  const unsubscribe = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return { subscribe, unsubscribe };
}
```

---

## 6. State Management

### 6.1 Zustand Stores

```typescript
// app/web/src/stores/workers.ts
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

interface WorkerInstance {
  id: string;
  name: string;
  model: string;
  status: "starting" | "ready" | "busy" | "error" | "stopped";
  port: number;
  pid?: number;
  lastActivity?: string;
  currentTask?: string;
  // ... other fields from WorkerInstance type
}

interface WorkerStore {
  workers: Map<string, WorkerInstance>;
  selectedWorkerId: string | null;

  // Actions
  setWorkers: (workers: WorkerInstance[]) => void;
  updateWorker: (id: string, updates: Partial<WorkerInstance>) => void;
  removeWorker: (id: string) => void;
  selectWorker: (id: string | null) => void;

  // Computed
  getActiveWorkers: () => WorkerInstance[];
  getWorkerById: (id: string) => WorkerInstance | undefined;
}

export const useWorkerStore = create<WorkerStore>()(
  subscribeWithSelector((set, get) => ({
    workers: new Map(),
    selectedWorkerId: null,

    setWorkers: (workers) => {
      const map = new Map(workers.map(w => [w.id, w]));
      set({ workers: map });
    },

    updateWorker: (id, updates) => {
      set((state) => {
        const worker = state.workers.get(id);
        if (!worker) return state;

        const newMap = new Map(state.workers);
        newMap.set(id, { ...worker, ...updates });
        return { workers: newMap };
      });
    },

    removeWorker: (id) => {
      set((state) => {
        const newMap = new Map(state.workers);
        newMap.delete(id);
        return { workers: newMap };
      });
    },

    selectWorker: (id) => set({ selectedWorkerId: id }),

    getActiveWorkers: () => {
      const workers = get().workers;
      return Array.from(workers.values()).filter(
        w => w.status === "ready" || w.status === "busy"
      );
    },

    getWorkerById: (id) => get().workers.get(id),
  }))
);

// Subscribe to SSE updates
export function initWorkerSync(eventSource: EventSource) {
  eventSource.addEventListener("worker:status", (event) => {
    const data = JSON.parse(event.data);
    useWorkerStore.getState().updateWorker(data.id, data);
  });

  eventSource.addEventListener("snapshot", (event) => {
    const { workers } = JSON.parse(event.data);
    useWorkerStore.getState().setWorkers(workers);
  });
}
```

### 6.2 React Query for API Data

```typescript
// app/web/src/api/hooks.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

// Workers
export function useWorkers() {
  return useQuery({
    queryKey: ["workers"],
    queryFn: () => api.workers.list(),
    refetchInterval: false,  // Use SSE for updates
  });
}

export function useSpawnWorker() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: SpawnWorkerRequest) => api.workers.spawn(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workers"] });
    },
  });
}

export function useStopWorker() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (workerId: string) => api.workers.stop(workerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workers"] });
    },
  });
}

// Jobs
export function useJobs(filters?: { workerId?: string; status?: string }) {
  return useQuery({
    queryKey: ["jobs", filters],
    queryFn: () => api.jobs.list(filters),
    refetchInterval: 5000,  // Poll for updates
  });
}

// Sessions
export function useSessionMessages(workerId: string) {
  return useQuery({
    queryKey: ["session", workerId],
    queryFn: () => api.sessions.getMessages(workerId),
    enabled: !!workerId,
  });
}

// Models
export function useModels() {
  return useQuery({
    queryKey: ["models"],
    queryFn: () => api.models.list(),
    staleTime: 5 * 60 * 1000,  // Cache for 5 minutes
  });
}

// Workflows
export function useWorkflows() {
  return useQuery({
    queryKey: ["workflows"],
    queryFn: () => api.workflows.list(),
  });
}

export function useQueueWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: QueueWorkflowRequest) => api.workflows.queue(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflow-queue"] });
    },
  });
}
```

---

## 7. Authentication & Security

### 7.1 Bearer Token Authentication

```typescript
// app/server/middleware/auth.ts
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

// Generate or load token on server start
const TOKEN = process.env.CONTROL_PANEL_TOKEN || (() => {
  const token = crypto.randomUUID();
  console.log(`\n🔐 Control Panel Token: ${token}\n`);
  return token;
})();

export const authMiddleware = createMiddleware(async (c, next) => {
  // Skip auth for SSE (uses query param)
  if (c.req.path === "/api/stream") {
    const tokenParam = c.req.query("token");
    if (tokenParam !== TOKEN) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }
    return next();
  }

  // Bearer token for all other routes
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Missing authorization header" });
  }

  const token = authHeader.slice(7);
  if (token !== TOKEN) {
    throw new HTTPException(401, { message: "Invalid token" });
  }

  return next();
});

// Export for client configuration
export function getToken() {
  return TOKEN;
}
```

### 7.2 Client Token Storage

```typescript
// app/web/src/stores/auth.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthStore {
  token: string | null;
  setToken: (token: string) => void;
  clearToken: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      setToken: (token) => set({ token }),
      clearToken: () => set({ token: null }),
    }),
    {
      name: "orchestra-auth",
      storage: {
        getItem: (key) => {
          // Use sessionStorage for security
          const value = sessionStorage.getItem(key);
          return value ? JSON.parse(value) : null;
        },
        setItem: (key, value) => {
          sessionStorage.setItem(key, JSON.stringify(value));
        },
        removeItem: (key) => {
          sessionStorage.removeItem(key);
        },
      },
    }
  )
);

export const useAuthToken = () => useAuthStore((state) => state.token);
```

### 7.3 Tailscale-Only Binding

```typescript
// app/server/index.ts
import { Hono } from "hono";

const app = new Hono();

// Only bind to localhost - Tailscale will handle network exposure
const server = Bun.serve({
  hostname: "0.0.0.0",  // Bind to all interfaces for Tailscale
  port: parseInt(process.env.CONTROL_PANEL_PORT || "14200"),
  fetch: app.fetch,
});

console.log(`
🎛️  Open Orchestra Control Panel
   Local:     http://localhost:${server.port}
   Tailscale: http://$(hostname):${server.port}
   Token:     ${TOKEN}
`);
```

---

## 8. Testing Strategy

### 8.1 Test Directory Structure

```
app/
├── server/
│   └── __tests__/
│       ├── unit/
│       │   ├── routes/
│       │   │   ├── workers.test.ts
│       │   │   ├── jobs.test.ts
│       │   │   └── workflows.test.ts
│       │   └── services/
│       │       ├── queue.test.ts
│       │       └── chat-history.test.ts
│       ├── integration/
│       │   ├── api.test.ts         # Full API integration tests
│       │   ├── sse.test.ts         # SSE streaming tests
│       │   └── websocket.test.ts   # WebSocket tests
│       └── e2e/
│           └── server.e2e.ts       # End-to-end server tests
├── web/
│   └── __tests__/
│       ├── unit/
│       │   ├── components/
│       │   │   ├── WorkerCard.test.tsx
│       │   │   ├── ChatPanel.test.tsx
│       │   │   └── JobList.test.tsx
│       │   ├── hooks/
│       │   │   ├── useSSE.test.ts
│       │   │   └── useChat.test.ts
│       │   └── stores/
│       │       ├── workers.test.ts
│       │       └── jobs.test.ts
│       ├── integration/
│       │   ├── Dashboard.test.tsx
│       │   └── Chat.test.tsx
│       └── e2e/
│           ├── fixtures/
│           │   └── test-data.ts
│           └── flows/
│               ├── spawn-worker.e2e.ts
│               ├── send-message.e2e.ts
│               └── queue-workflow.e2e.ts
└── e2e/
    ├── playwright.config.ts
    └── tests/
        ├── dashboard.spec.ts
        ├── chat.spec.ts
        ├── workflows.spec.ts
        └── mobile.spec.ts
```

### 8.2 Server Unit Tests

Using existing test patterns from `test/helpers/e2e-env.ts`:

```typescript
// app/server/__tests__/unit/routes/workers.test.ts
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Hono } from "hono";
import { createE2eEnv, type E2eEnv } from "../../../../test/helpers/e2e-env";
import { workerRoutes } from "../../../routes/workers";
import { workerPool } from "../../../../src/core/worker-pool";

describe("Worker Routes", () => {
  let env: E2eEnv;
  let app: Hono;

  beforeAll(async () => {
    env = await createE2eEnv({ metrics: true });
    app = new Hono();
    app.route("/api/workers", workerRoutes);
  });

  afterAll(async () => {
    await env.restore();
  });

  test("GET /api/workers returns empty array initially", async () => {
    const res = await app.request("/api/workers");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.workers).toEqual([]);
    expect(body.meta.total).toBe(0);
  });

  test("POST /api/workers spawns a worker", async () => {
    const endTiming = env.startTiming("spawn-worker-api");

    const res = await app.request("/api/workers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: "vision" }),
    });

    endTiming();

    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.id).toBe("vision");
    expect(body.status).toBe("starting");

    // Wait for worker to be ready
    await env.emitLifecycleEvent("ready", "vision");

    // Verify in pool
    const worker = workerPool.get("vision");
    expect(worker).toBeDefined();
    expect(worker?.status).toBe("ready");
  }, 60000);

  test("DELETE /api/workers/:id stops a worker", async () => {
    const res = await app.request("/api/workers/vision", {
      method: "DELETE",
    });

    expect(res.status).toBe(200);

    const worker = workerPool.get("vision");
    expect(worker?.status).toBe("stopped");
  });
});
```

### 8.3 Server Integration Tests

```typescript
// app/server/__tests__/integration/api.test.ts
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createE2eEnv, type E2eEnv } from "../../../../test/helpers/e2e-env";
import { createServer } from "../../index";

describe("Control Panel API Integration", () => {
  let env: E2eEnv;
  let server: ReturnType<typeof Bun.serve>;
  let baseUrl: string;
  const token = "test-token";

  beforeAll(async () => {
    env = await createE2eEnv({ metrics: true });

    process.env.CONTROL_PANEL_TOKEN = token;
    const app = createServer();

    server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: app.fetch,
    });

    baseUrl = `http://127.0.0.1:${server.port}`;
  });

  afterAll(async () => {
    server.stop();
    await env.restore();
  });

  const authHeaders = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  test("health check returns server status", async () => {
    const res = await fetch(`${baseUrl}/api/health`, { headers: authHeaders });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.healthy).toBe(true);
    expect(body.version).toBeDefined();
  });

  test("full workflow: spawn → message → stop", async () => {
    // 1. Spawn worker
    const spawnRes = await fetch(`${baseUrl}/api/workers`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ profileId: "explorer" }),
    });
    expect(spawnRes.status).toBe(201);
    const spawned = await spawnRes.json();

    // 2. Wait for ready
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 3. Send message
    const msgRes = await fetch(`${baseUrl}/api/workers/explorer/message`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ content: "Hello, explorer!" }),
    });
    expect(msgRes.status).toBe(200);
    const msgResult = await msgRes.json();
    expect(msgResult.success).toBe(true);
    expect(msgResult.response).toBeDefined();

    // 4. Stop worker
    const stopRes = await fetch(`${baseUrl}/api/workers/explorer`, {
      method: "DELETE",
      headers: authHeaders,
    });
    expect(stopRes.status).toBe(200);
  }, 120000);
});
```

### 8.4 SSE Streaming Tests

```typescript
// app/server/__tests__/integration/sse.test.ts
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createServer } from "../../index";
import { streamEmitter, type StreamChunk } from "../../../../src/core/bridge-server";

describe("SSE Streaming", () => {
  let server: ReturnType<typeof Bun.serve>;
  let baseUrl: string;
  const token = "test-token";

  beforeAll(async () => {
    process.env.CONTROL_PANEL_TOKEN = token;
    const app = createServer();
    server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: app.fetch,
    });
    baseUrl = `http://127.0.0.1:${server.port}`;
  });

  afterAll(() => {
    server.stop();
  });

  test("receives initial snapshot on connect", async () => {
    const res = await fetch(`${baseUrl}/api/stream?token=${token}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // Read first event (snapshot)
    const { value } = await reader.read();
    const text = decoder.decode(value);

    expect(text).toContain("event: snapshot");
    expect(text).toContain("workers");

    reader.cancel();
  });

  test("receives worker output chunks", async () => {
    const res = await fetch(`${baseUrl}/api/stream?token=${token}&workerId=test-worker`);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // Skip snapshot
    await reader.read();

    // Emit a test chunk
    const testChunk: StreamChunk = {
      workerId: "test-worker",
      jobId: "job-123",
      chunk: "Hello from test!",
      timestamp: Date.now(),
      final: false,
    };
    streamEmitter.emit("chunk", testChunk);

    // Read the chunk event
    const { value } = await reader.read();
    const text = decoder.decode(value);

    expect(text).toContain("event: worker:output");
    expect(text).toContain("Hello from test!");

    reader.cancel();
  });

  test("filters by workerId", async () => {
    const res = await fetch(`${baseUrl}/api/stream?token=${token}&workerId=filtered-worker`);
    const reader = res.body!.getReader();

    await reader.read();  // Skip snapshot

    // Emit chunk for different worker
    streamEmitter.emit("chunk", {
      workerId: "other-worker",
      chunk: "Should not receive",
      timestamp: Date.now(),
    });

    // Emit chunk for filtered worker
    streamEmitter.emit("chunk", {
      workerId: "filtered-worker",
      chunk: "Should receive",
      timestamp: Date.now(),
    });

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);

    expect(text).toContain("Should receive");
    expect(text).not.toContain("Should not receive");

    reader.cancel();
  });
});
```

### 8.5 Frontend Unit Tests

```typescript
// app/web/__tests__/unit/components/WorkerCard.test.tsx
import { describe, test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { WorkerCard } from "../../../src/components/workers/WorkerCard";

describe("WorkerCard", () => {
  const mockWorker = {
    id: "vision",
    name: "Vision Analyst",
    model: "openrouter/llama-vision",
    status: "ready" as const,
    port: 14100,
    purpose: "Analyze images",
    supportsVision: true,
    supportsWeb: false,
  };

  test("renders worker information", () => {
    render(<WorkerCard worker={mockWorker} />);

    expect(screen.getByText("Vision Analyst")).toBeDefined();
    expect(screen.getByText("vision")).toBeDefined();
    expect(screen.getByText("ready")).toBeDefined();
  });

  test("shows vision badge when supportsVision is true", () => {
    render(<WorkerCard worker={mockWorker} />);

    expect(screen.getByText("Vision")).toBeDefined();
  });

  test("applies correct status color", () => {
    const { container } = render(<WorkerCard worker={mockWorker} />);

    const statusBadge = container.querySelector('[data-status="ready"]');
    expect(statusBadge?.classList.contains("bg-green-100")).toBe(true);
  });

  test("shows error state correctly", () => {
    const errorWorker = { ...mockWorker, status: "error" as const, error: "Connection failed" };
    render(<WorkerCard worker={errorWorker} />);

    expect(screen.getByText("error")).toBeDefined();
    expect(screen.getByText("Connection failed")).toBeDefined();
  });
});
```

### 8.6 Frontend Hook Tests

```typescript
// app/web/__tests__/unit/hooks/useSSE.test.ts
import { describe, test, expect, mock } from "bun:test";
import { renderHook, act } from "@testing-library/react-hooks";
import { useSSE } from "../../../src/hooks/useSSE";

// Mock EventSource
class MockEventSource {
  url: string;
  listeners: Map<string, Function[]> = new Map();
  readyState = 1;

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(event: string, callback: Function) {
    const list = this.listeners.get(event) || [];
    list.push(callback);
    this.listeners.set(event, list);
  }

  removeEventListener(event: string, callback: Function) {
    const list = this.listeners.get(event) || [];
    this.listeners.set(event, list.filter(cb => cb !== callback));
  }

  close() {
    this.readyState = 2;
  }

  // Test helper
  emit(event: string, data: any) {
    const list = this.listeners.get(event) || [];
    list.forEach(cb => cb({ data: JSON.stringify(data) }));
  }
}

globalThis.EventSource = MockEventSource as any;

describe("useSSE", () => {
  test("creates EventSource on subscribe", () => {
    const { result } = renderHook(() => useSSE());

    let eventSource: MockEventSource;
    act(() => {
      eventSource = result.current.subscribe("/api/stream") as any;
    });

    expect(eventSource!.url).toContain("/api/stream");
    expect(eventSource!.readyState).toBe(1);
  });

  test("closes EventSource on unsubscribe", () => {
    const { result } = renderHook(() => useSSE());

    let eventSource: MockEventSource;
    act(() => {
      eventSource = result.current.subscribe("/api/stream") as any;
    });

    act(() => {
      result.current.unsubscribe();
    });

    expect(eventSource!.readyState).toBe(2);
  });

  test("replaces existing connection on new subscribe", () => {
    const { result } = renderHook(() => useSSE());

    let eventSource1: MockEventSource;
    let eventSource2: MockEventSource;

    act(() => {
      eventSource1 = result.current.subscribe("/api/stream?v=1") as any;
    });

    act(() => {
      eventSource2 = result.current.subscribe("/api/stream?v=2") as any;
    });

    expect(eventSource1!.readyState).toBe(2);  // Closed
    expect(eventSource2!.readyState).toBe(1);  // Open
  });
});
```

### 8.7 E2E Tests with Playwright

```typescript
// app/e2e/tests/dashboard.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    // Set auth token
    await page.goto("/");
    await page.evaluate((token) => {
      sessionStorage.setItem("orchestra-auth", JSON.stringify({ state: { token } }));
    }, process.env.TEST_TOKEN);

    await page.goto("/dashboard");
  });

  test("displays worker grid", async ({ page }) => {
    await expect(page.locator("h2").filter({ hasText: "Workers" })).toBeVisible();
    await expect(page.locator("[data-testid='worker-grid']")).toBeVisible();
  });

  test("shows stats cards", async ({ page }) => {
    await expect(page.locator("[data-testid='stat-total']")).toBeVisible();
    await expect(page.locator("[data-testid='stat-active']")).toBeVisible();
    await expect(page.locator("[data-testid='stat-busy']")).toBeVisible();
    await expect(page.locator("[data-testid='stat-errors']")).toBeVisible();
  });

  test("can spawn a new worker", async ({ page }) => {
    // Click spawn button
    await page.click("[data-testid='spawn-worker-btn']");

    // Select profile
    await page.click("[data-testid='profile-option-vision']");

    // Confirm
    await page.click("[data-testid='spawn-confirm-btn']");

    // Wait for worker to appear
    await expect(page.locator("[data-testid='worker-card-vision']")).toBeVisible({
      timeout: 30000,
    });

    // Check status transitions
    await expect(page.locator("[data-testid='worker-status-vision']")).toHaveText("starting");
    await expect(page.locator("[data-testid='worker-status-vision']")).toHaveText("ready", {
      timeout: 60000,
    });
  });
});

// app/e2e/tests/chat.spec.ts
test.describe("Chat", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/chat/vision");
  });

  test("can send a message and receive response", async ({ page }) => {
    // Type message
    await page.fill("[data-testid='chat-input']", "Describe the architecture");

    // Send
    await page.click("[data-testid='send-btn']");

    // Check user message appears
    await expect(page.locator("[data-testid='message-user']").last()).toContainText(
      "Describe the architecture"
    );

    // Wait for streaming to start
    await expect(page.locator("[data-testid='streaming-indicator']")).toBeVisible();

    // Wait for response
    await expect(page.locator("[data-testid='message-assistant']").last()).toBeVisible({
      timeout: 60000,
    });

    // Check streaming indicator disappears
    await expect(page.locator("[data-testid='streaming-indicator']")).not.toBeVisible();
  });

  test("can stop streaming", async ({ page }) => {
    await page.fill("[data-testid='chat-input']", "Write a long response");
    await page.click("[data-testid='send-btn']");

    // Wait for streaming to start
    await expect(page.locator("[data-testid='streaming-indicator']")).toBeVisible();

    // Click stop
    await page.click("[data-testid='stop-btn']");

    // Verify streaming stopped
    await expect(page.locator("[data-testid='streaming-indicator']")).not.toBeVisible();
  });
});

// app/e2e/tests/mobile.spec.ts
test.describe("Mobile Responsiveness", () => {
  test.use({ viewport: { width: 375, height: 667 } });  // iPhone SE

  test("shows mobile navigation", async ({ page }) => {
    await page.goto("/dashboard");

    // Desktop sidebar should be hidden
    await expect(page.locator("[data-testid='desktop-sidebar']")).not.toBeVisible();

    // Mobile hamburger should be visible
    await expect(page.locator("[data-testid='mobile-menu-btn']")).toBeVisible();

    // Click hamburger
    await page.click("[data-testid='mobile-menu-btn']");

    // Mobile sidebar should slide in
    await expect(page.locator("[data-testid='mobile-sidebar']")).toBeVisible();
  });

  test("chat input is accessible on mobile", async ({ page }) => {
    await page.goto("/chat/vision");

    // Input should be at bottom
    const input = page.locator("[data-testid='chat-input']");
    await expect(input).toBeVisible();

    // Should be focusable
    await input.focus();
    await expect(input).toBeFocused();

    // Virtual keyboard should not obscure input
    // (This is more of a manual test, but we can check input remains visible)
    await page.fill("[data-testid='chat-input']", "Test message");
    await expect(input).toBeVisible();
  });
});
```

### 8.8 Test Configuration

```typescript
// app/e2e/playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 120000,
  expect: { timeout: 10000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["html", { open: "never" }],
    ["json", { outputFile: "results.json" }],
  ],

  use: {
    baseURL: "http://localhost:14200",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    // Desktop browsers
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },

    // Mobile browsers
    { name: "mobile-chrome", use: { ...devices["Pixel 5"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 12"] } },

    // Tablet
    { name: "tablet", use: { ...devices["iPad (gen 7)"] } },
  ],

  // Start server before tests
  webServer: [
    {
      command: "bun run app/server/index.ts",
      port: 14200,
      reuseExistingServer: !process.env.CI,
      env: {
        CONTROL_PANEL_TOKEN: "e2e-test-token",
      },
    },
    {
      command: "bun run vite --port 5173",
      cwd: "app/web",
      port: 5173,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
```

---

## 9. Debugging & Observability

### 9.1 Logging Strategy

```typescript
// app/server/middleware/logging.ts
import { createMiddleware } from "hono/factory";

// Structured logging compatible with existing OpenCode patterns
interface LogEntry {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  service: "control-panel";
  message: string;
  requestId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  error?: string;
  extra?: Record<string, unknown>;
}

function log(entry: Omit<LogEntry, "timestamp" | "service">) {
  const fullEntry: LogEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
    service: "control-panel",
  };

  if (process.env.LOG_FORMAT === "json") {
    console.log(JSON.stringify(fullEntry));
  } else {
    const prefix = `[${fullEntry.level.toUpperCase()}] [${fullEntry.timestamp}]`;
    console.log(`${prefix} ${fullEntry.message}`, fullEntry.extra || "");
  }
}

export const loggingMiddleware = createMiddleware(async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set("requestId", requestId);

  const startTime = performance.now();

  log({
    level: "info",
    message: `→ ${c.req.method} ${c.req.path}`,
    requestId,
    method: c.req.method,
    path: c.req.path,
  });

  await next();

  const durationMs = performance.now() - startTime;

  log({
    level: c.res.status >= 400 ? "error" : "info",
    message: `← ${c.req.method} ${c.req.path} ${c.res.status}`,
    requestId,
    method: c.req.method,
    path: c.req.path,
    statusCode: c.res.status,
    durationMs: Math.round(durationMs),
  });
});
```

### 9.2 Error Tracking

```typescript
// app/server/middleware/error-handler.ts
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

// Error boundary middleware
export const errorHandler = createMiddleware(async (c, next) => {
  try {
    await next();
  } catch (error) {
    const requestId = c.get("requestId") || "unknown";

    if (error instanceof HTTPException) {
      return error.getResponse();
    }

    // Log error with full context
    console.error({
      timestamp: new Date().toISOString(),
      level: "error",
      service: "control-panel",
      requestId,
      message: "Unhandled error",
      error: (error as Error).message,
      stack: (error as Error).stack,
      path: c.req.path,
      method: c.req.method,
    });

    // Return generic error response
    return c.json({
      error: "Internal server error",
      requestId,
      message: process.env.NODE_ENV === "development"
        ? (error as Error).message
        : undefined,
    }, 500);
  }
});
```

### 9.3 Debug Mode

```typescript
// app/server/services/debug.ts

// Debug mode exposes additional endpoints
export function registerDebugRoutes(app: Hono) {
  if (process.env.DEBUG !== "true") return;

  // Expose internal state
  app.get("/debug/state", (c) => {
    return c.json({
      workerPool: workerPool.toJSON(),
      jobs: workerJobs.list({ limit: 100 }),
      deviceRegistry: listDeviceRegistry(),
      config: {
        autoSpawn: config.autoSpawn,
        spawnOnDemand: config.spawnOnDemand,
        profiles: Object.keys(config.profiles),
      },
    });
  });

  // Force garbage collection (if exposed)
  app.post("/debug/gc", (c) => {
    if (global.gc) {
      global.gc();
      return c.json({ message: "GC triggered" });
    }
    return c.json({ error: "GC not exposed" }, 400);
  });

  // Simulate events for testing
  app.post("/debug/emit", async (c) => {
    const { event, data } = await c.req.json();
    streamEmitter.emit(event, data);
    return c.json({ message: `Emitted ${event}` });
  });
}
```

### 9.4 Frontend Debugging

```typescript
// app/web/src/lib/debug.ts

// Debug panel component (only in development)
export function DebugPanel() {
  if (process.env.NODE_ENV !== "development") return null;

  const [open, setOpen] = useState(false);
  const workers = useWorkerStore(state => state.workers);
  const [sseEvents, setSseEvents] = useState<any[]>([]);

  // Log SSE events
  useEffect(() => {
    const handler = (event: CustomEvent) => {
      setSseEvents(prev => [...prev.slice(-50), event.detail]);
    };
    window.addEventListener("sse:event", handler as any);
    return () => window.removeEventListener("sse:event", handler as any);
  }, []);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 p-2 bg-gray-800 text-white rounded"
      >
        🐛
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 w-96 h-96 bg-gray-900 text-white p-4 overflow-auto">
      <button onClick={() => setOpen(false)} className="float-right">×</button>

      <h3 className="font-bold mb-2">Workers</h3>
      <pre className="text-xs">{JSON.stringify(Object.fromEntries(workers), null, 2)}</pre>

      <h3 className="font-bold mt-4 mb-2">SSE Events (last 50)</h3>
      <div className="space-y-1">
        {sseEvents.map((evt, i) => (
          <div key={i} className="text-xs bg-gray-800 p-1 rounded">
            {evt.type}: {JSON.stringify(evt.data).slice(0, 100)}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 9.5 Metrics Collection

```typescript
// app/server/services/metrics.ts
import { createMetricsCollector } from "../../../test/helpers/metrics";

// Singleton metrics collector
const metrics = createMetricsCollector({ sampleIntervalMs: 5000 });

// Middleware to record request metrics
export const metricsMiddleware = createMiddleware(async (c, next) => {
  const endSpan = metrics.startSpan(`http:${c.req.method}:${c.req.path}`);

  await next();

  endSpan();

  // Record status codes
  if (c.res.status >= 500) {
    metrics.recordError(`HTTP ${c.res.status}`);
  }
});

// Expose metrics endpoint
app.get("/metrics", (c) => {
  return c.json({
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    spans: metrics.getSpans(),
    errors: metrics.getErrors(),
    samples: metrics.getSamples().slice(-100),
  });
});
```

---

## 10. Build & Deployment

### 10.1 Package Scripts

```json
// app/package.json
{
  "name": "@opencode-orchestrator/control-panel",
  "version": "0.3.0",
  "private": true,
  "scripts": {
    "dev": "concurrently \"bun run dev:server\" \"bun run dev:web\"",
    "dev:server": "bun --watch server/index.ts",
    "dev:web": "cd web && vite",

    "build": "bun run build:server && bun run build:web",
    "build:server": "bun build server/index.ts --outdir dist/server --target node",
    "build:web": "cd web && vite build",

    "test": "bun run test:server && bun run test:web",
    "test:server": "bun test server/__tests__",
    "test:web": "cd web && vitest run",

    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",

    "typecheck": "tsc --noEmit && cd web && tsc --noEmit",

    "start": "bun run dist/server/index.js",
    "start:prod": "NODE_ENV=production bun run dist/server/index.js"
  },
  "dependencies": {
    "hono": "^4.0.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.40.0",
    "concurrently": "^8.0.0"
  }
}
```

### 10.2 Web Build Configuration

```typescript
// app/web/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "robots.txt", "icons/*.png"],
      manifest: {
        name: "Open Orchestra Control Panel",
        short_name: "Orchestra",
        description: "Control panel for Open Orchestra",
        theme_color: "#3b82f6",
        background_color: "#ffffff",
        display: "standalone",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
            handler: "StaleWhileRevalidate",
          },
          {
            urlPattern: /\/api\//,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:14200",
        changeOrigin: true,
      },
    },
  },
});
```

### 10.3 Production Startup

```typescript
// app/server/index.ts (production mode)
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { workerRoutes } from "./routes/workers";
import { jobRoutes } from "./routes/jobs";
import { streamRoutes } from "./routes/stream";
// ... other imports

const app = new Hono();

// API routes
app.route("/api/workers", workerRoutes);
app.route("/api/jobs", jobRoutes);
app.route("/api/stream", streamRoutes);
// ... other routes

// Serve static files in production
if (process.env.NODE_ENV === "production") {
  app.use("/*", serveStatic({ root: "./dist/web" }));

  // SPA fallback
  app.get("*", (c) => {
    return c.html(Bun.file("./dist/web/index.html"));
  });
}

const port = parseInt(process.env.CONTROL_PANEL_PORT || "14200");
const token = process.env.CONTROL_PANEL_TOKEN || crypto.randomUUID();

const server = Bun.serve({
  hostname: "0.0.0.0",
  port,
  fetch: app.fetch,
});

console.log(`
╔══════════════════════════════════════════════════════════════╗
║         🎛️  Open Orchestra Control Panel v0.3.0              ║
╠══════════════════════════════════════════════════════════════╣
║  Local:     http://localhost:${port}                         ║
║  Network:   http://$(hostname):${port}                       ║
╠══════════════════════════════════════════════════════════════╣
║  Token:     ${token}                                         ║
╚══════════════════════════════════════════════════════════════╝
`);
```

---

## 11. Public Repo Hygiene

As part of the v0.3.0 release, the repository will include standard open-source project files.

### 11.1 Required Files

```
/
├── LICENSE                        # MIT License
├── SECURITY.md                    # Security policy & vulnerability reporting
├── CONTRIBUTING.md                # Contribution guidelines
├── CODE_OF_CONDUCT.md             # Community standards
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                 # Main CI pipeline
│   │   ├── release.yml            # Release automation
│   │   └── codeql.yml             # Security scanning
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md
│   │   ├── feature_request.md
│   │   └── config.yml
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── dependabot.yml             # Dependency updates
├── .gitignore                     # Updated with new paths
└── .editorconfig                  # Editor consistency
```

### 11.2 GitHub Actions CI Pipeline

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, v*]
  pull_request:
    branches: [main]

jobs:
  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Typecheck
        run: bun run typecheck

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Lint
        run: bun run lint

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Run tests
        run: bun test

  build:
    runs-on: ubuntu-latest
    needs: [typecheck, lint, test]
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Build
        run: bun run build

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/

  e2e:
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Install Playwright
        run: npx playwright install --with-deps

      - name: Download build
        uses: actions/download-artifact@v4
        with:
          name: dist
          path: dist/

      - name: Run E2E tests
        run: bun run test:e2e
```

### 11.3 Security Policy

```markdown
# SECURITY.md

## Reporting Security Vulnerabilities

Please report security vulnerabilities to: security@example.com

Do NOT create public GitHub issues for security vulnerabilities.

## Response Timeline

- Initial response: 48 hours
- Triage and assessment: 1 week
- Fix development: Varies by severity
- Disclosure: Coordinated with reporter

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.3.x   | :white_check_mark: |
| 0.2.x   | :white_check_mark: |
| < 0.2   | :x:                |
```

### 11.4 Contributing Guidelines

```markdown
# CONTRIBUTING.md

## Development Setup

1. Fork and clone the repository
2. Install dependencies: `bun install`
3. Run tests: `bun test`
4. Start dev server: `bun run dev`

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with tests
3. Ensure all checks pass
4. Submit PR with clear description

## Code Style

- TypeScript strict mode
- Prettier for formatting
- ESLint for linting
- Conventional commits

## Testing Requirements

- Unit tests for new functions
- Integration tests for API changes
- E2E tests for user-facing features
```

### 11.5 Updated .gitignore

```gitignore
# Build output
dist/
app/dist/

# Dependencies
node_modules/

# Runtime data
app/data/
.tmp/

# Environment
.env
.env.local

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Test artifacts
coverage/
.playwright/
test-results/
playwright-report/

# Logs
*.log
npm-debug.log*

# Cache
.cache/
*.tsbuildinfo
```

---

## 12. Implementation Phases

### Phase 0: Repository Restructure & Hygiene (Week 0)
**Goal: Clean codebase + public repo readiness**

1. **Directory Restructure**
   - Create new folder structure (`src/workers/`, `src/jobs/`, `src/bridge/`, `src/infra/`)
   - Move files incrementally with re-exports
   - Update all import paths
   - Remove legacy re-exports

2. **Public Repo Files**
   - Add LICENSE, SECURITY.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md
   - Set up GitHub Actions CI (typecheck, lint, test, build)
   - Add issue templates and PR template
   - Configure Dependabot

3. **Build & Tooling**
   - Add ESLint configuration
   - Add Prettier configuration
   - Update package.json scripts
   - Verify all tests pass after restructure

**Deliverables:**
- [ ] Restructured `src/` with clear responsibility groupings
- [ ] All CI checks passing
- [ ] Public repo files in place
- [ ] No breaking changes to plugin functionality

---

### Phase 1: Foundation (Week 1-2)
**Goal: Basic server + dashboard**

1. **Server Setup**
   - Create `app/server/` structure
   - Implement Hono routes for workers, jobs
   - Add bearer token authentication
   - Wire up to existing `workerPool` and `workerJobs`

2. **SSE Streaming**
   - Implement `/api/stream` endpoint
   - Connect to `streamEmitter` from bridge-server.ts
   - Add worker status event forwarding

3. **Basic Web UI**
   - Create React app with Vite
   - Implement `useSSE` hook
   - Build Dashboard page with worker grid
   - Add StatCards and basic worker cards

**Deliverables:**
- [ ] Working API server on port 14200
- [ ] SSE streaming of worker events
- [ ] Dashboard showing worker status in real-time
- [ ] Basic auth with bearer token

### Phase 2: Worker Management (Week 3)
**Goal: Full worker control**

1. **Spawn/Stop Workers**
   - Spawn worker dialog with profile selection
   - Stop worker confirmation
   - Wire to `spawnWorker()` and `stopWorker()`

2. **Worker Detail View**
   - Individual worker page
   - Show last result, current task
   - Model resolution info
   - Activity timeline

3. **Job Management**
   - Job list component
   - Job status updates via SSE
   - Job output streaming

**Deliverables:**
- [ ] Spawn/stop workers from UI
- [ ] Worker detail pages
- [ ] Job list with real-time updates

### Phase 3: Chat Interface (Week 4)
**Goal: Interactive chat with workers**

1. **Chat Panel**
   - Implement `useWorkerChat` hook (AI SDK patterns)
   - Message list with streaming
   - Chat input with file attachments

2. **Message Rendering**
   - Render message parts (text, tool-call, tool-result)
   - Tool call visualization
   - Reasoning display (collapsible)

3. **Chat History**
   - SQLite persistence
   - Load historical messages
   - Session forking

**Deliverables:**
- [ ] Full chat interface per worker
- [ ] Streaming message display
- [ ] Tool call visualization
- [ ] Chat history persistence

### Phase 4: Workflow Queue (Week 5)
**Goal: Workflow scheduling and queue**

1. **Queue Service**
   - Implement `WorkflowQueue` class
   - Priority scheduling
   - Concurrent execution limits

2. **Queue UI**
   - Workflow queue display
   - Queue workflow dialog
   - Cancel/reorder support

3. **Workflow Progress**
   - Step-by-step progress tracking
   - Real-time status updates
   - Completion notifications

**Deliverables:**
- [ ] Workflow queue with priority
- [ ] Queue management UI
- [ ] Step progress visualization

### Phase 5: Configuration & Models (Week 6)
**Goal: Configuration management**

1. **Model Catalog**
   - Display available models
   - Capability indicators
   - Cost information

2. **Profile Management**
   - Edit profile model assignments
   - Create custom profiles
   - Profile inheritance visualization

3. **Config Editor**
   - View/edit orchestrator config
   - Save to project or global
   - Validation with JSON schema

**Deliverables:**
- [ ] Model catalog browser
- [ ] Profile editor
- [ ] Config management UI

### Phase 6: Mobile & PWA (Week 7)
**Goal: Full responsive + PWA**

1. **Responsive Design**
   - Mobile navigation
   - Touch-friendly controls
   - Adaptive layouts

2. **PWA Setup**
   - Service worker
   - Offline indicators
   - Install prompt

3. **Tablet Optimization**
   - Split-view layouts
   - Gesture support

**Deliverables:**
- [ ] Full mobile responsiveness
- [ ] PWA installable
- [ ] Offline support

### Phase 7: Testing & Polish (Week 8)
**Goal: Production-ready quality**

1. **E2E Tests**
   - Playwright test suite
   - Cross-browser testing
   - Mobile device testing

2. **Performance**
   - Bundle optimization
   - SSE connection pooling
   - Memory leak testing

3. **Documentation**
   - API documentation
   - User guide
   - Troubleshooting guide

**Deliverables:**
- [ ] 90%+ test coverage
- [ ] < 200KB initial bundle
- [ ] Complete documentation

---

## Appendix A: Key Code References

### Existing Codebase Files

| File | Purpose | Key Exports |
|------|---------|-------------|
| [src/types/index.ts](../src/types/index.ts) | Type definitions | `WorkerInstance`, `WorkerProfile`, `WorkerStatus`, `OrchestratorConfig` |
| [src/core/worker-pool.ts](../src/core/worker-pool.ts) | Worker registry | `workerPool`, `WorkerPool` class |
| [src/core/jobs.ts](../src/core/jobs.ts) | Job tracking | `workerJobs`, `WorkerJob`, `WorkerJobRegistry` |
| [src/core/bridge-server.ts](../src/core/bridge-server.ts) | SSE server | `streamEmitter`, `StreamChunk`, `startBridgeServer()` |
| [src/workers/spawner.ts](../src/workers/spawner.ts) | Worker lifecycle | `spawnWorker()`, `stopWorker()`, `sendToWorker()` |
| [src/models/catalog.ts](../src/models/catalog.ts) | Model catalog | `buildModelCatalog()`, `ModelCatalogEntry` |
| [src/config/orchestrator.ts](../src/config/orchestrator.ts) | Config loading | `loadOrchestratorConfig()` |
| [src/config/profiles.ts](../src/config/profiles.ts) | Built-in profiles | `BUILTIN_PROFILES`, `getProfiles()` |
| [src/workflows/engine.ts](../src/workflows/engine.ts) | Workflow execution | `runWorkflow()`, `WorkflowDefinition` |
| [test/helpers/e2e-env.ts](../test/helpers/e2e-env.ts) | Test infrastructure | `createE2eEnv()`, `E2eEnv` |

### AI SDK Documentation References

| Feature | Documentation URL | Key Patterns |
|---------|-------------------|--------------|
| useChat Hook | https://ai-sdk.dev/docs/ai-sdk-ui/chatbot | Message parts, streaming, status states |
| Streaming | https://ai-sdk.dev/docs/ai-sdk-core/generating-text | `streamText()`, `toUIMessageStreamResponse()` |
| Tool Calling | https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling | Tool definition, multi-step execution |
| Error Handling | https://ai-sdk.dev/docs/ai-sdk-ui/error-handling | Error states, regeneration |
| Message Persistence | https://ai-sdk.dev/docs/ai-sdk-ui/storing-messages | `UIMessage` format, validation |

### OpenCode SDK References

| Feature | Documentation | Key Patterns |
|---------|--------------|--------------|
| SDK Overview | https://opencode.ai/docs/sdk | `createOpencode()`, `createOpencodeClient()` |
| Server API | https://opencode.ai/docs/server | REST endpoints, SSE events |
| Session Management | SDK types | `client.session.prompt()`, `client.session.create()` |

---

## Appendix B: Schema Definitions

### API Response Schemas

```typescript
// Worker List Response
interface WorkerListResponse {
  workers: WorkerInstance[];
  meta: {
    total: number;
    active: number;
    timestamp: number;
  };
}

// Job List Response
interface JobListResponse {
  jobs: WorkerJob[];
  meta: {
    total: number;
    running: number;
    succeeded: number;
    failed: number;
  };
}

// SSE Event Format
interface SSEEvent {
  event: string;
  data: string;  // JSON-encoded payload
  id?: string;
  retry?: number;
}

// WebSocket Message Format
interface WSMessage {
  type: string;
  id: string;
  payload: unknown;
}

interface WSResponse {
  type: string;
  id: string;
  success: boolean;
  payload?: unknown;
  error?: string;
}
```

---

## Appendix C: Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CONTROL_PANEL_PORT` | `14200` | HTTP server port |
| `CONTROL_PANEL_TOKEN` | (generated) | Bearer authentication token |
| `NODE_ENV` | `development` | Environment mode |
| `DEBUG` | `false` | Enable debug endpoints |
| `LOG_FORMAT` | `pretty` | Logging format (`pretty` or `json`) |

---

*This scope document is part of Open Orchestra v0.3.0 release planning.*
*Last updated: 2025-12-24*
