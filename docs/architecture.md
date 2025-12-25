# Architecture Overview

Open Orchestra is an OpenCode plugin that coordinates specialized workers through the official SDK and server APIs.

## Core Services

- `createCore()` wires dependencies and owns lifecycle start/stop.
- `createApi()` wraps the OpenCode SDK client and local server creation.
- `createCommunication()` adapts OpenCode SSE (`client.event.subscribe()`).
- `createWorkerManager()` owns worker registry, spawn, send, jobs.
- `createWorkflowEngine()` runs multi-step workflows over workers.
- `createTools()` exposes plugin tools + guard/compaction hooks.
- `createOrchestrator()` handles routing and policy decisions.

## Data Flow

1. User prompt enters OpenCode.
2. Plugin tools route tasks to the orchestrator.
3. Orchestrator selects worker(s) and sends prompts.
4. Worker output returns via SDK and is recorded by tools/memory.
5. Communication layer emits `orchestra.*` events.

## Worker Lifecycle

- `createWorkerManager` spawns workers via SDK `createOpencode`.
- Each worker has a dedicated OpenCode session and system prompt.
- `send` uses `client.session.prompt` with attachments and timeouts.
- Registry tracks status and emits events via communication layer.

## Memory System

- File backend by default; Neo4j when configured.
- `record`, `search`, `recent`, `inject`, `trim` are exposed via `src/memory`.
- Neo4j config resolves from env or `.opencode/orchestrator.json` integrations.

## Vision Pipeline

- `src/vision` handles image extraction, analysis, and formatting.
- Vision analysis calls a vision-capable worker with image attachments.

## Folder Map (src/)

- `api/` SDK client wrapper
- `communication/` SSE/event adapters
- `workers/` lifecycle + registry + jobs
- `workflows/` workflow engine + built-ins
- `tools/` plugin tools + hooks
- `orchestrator/` routing and policy
- `memory/` memory store + injection
- `vision/` vision analysis helpers
- `core/` dependency container + lifecycle
