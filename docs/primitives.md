# Repo Primitive Map

This document maps every core primitive in the repo, from the frontend surface down to backend services, TUI events, and worker lifecycle. It is meant to be used as a reference when changing behavior, adding tests, or wiring new features.

## Monorepo Boundaries

- Backend plugin: `orchestra/`
- Frontend control panel: `app/`
- Docs and runbooks: `docs/`

## Primitive Index (Top Level)

- Frontend UI surfaces
- Frontend state providers (OpenCode + Skills)
- Skills system
- Workers (profiles, spawn, send, jobs, registry)
- Workflows
- Orchestrator routing
- Tools (OpenCode tool hooks)
- Communication and events (SSE/TUI)
- Config parsing and profile inheritance
- Models (resolution, capabilities, cost)
- Permissions (tools + path constraints)
- Memory (Neo4j/file store)
- Integrations (Linear, Neo4j)
- UX helpers (repo context)
- Prompts (orchestrator + worker profiles + workflows)

## Frontend UI Surfaces

Primary files:
- `app/src/pages/dashboard.tsx` (layout, panels, prompt input)
- `app/src/components/header.tsx` (connection and worker stats)
- `app/src/components/sidebar/worker-list.tsx` (sessions list)
- `app/src/components/worker-detail.tsx` (session detail + messages)
- `app/src/components/job-queue.tsx` (recent activity)
- `app/src/components/log-stream.tsx` (event stream + shell)
- `app/src/components/skills/*` (skill CRUD UI)
- `app/src/components/sdk/*` (SDK action runner)

Key responsibilities:
- Show OpenCode sessions, send messages, and surface event telemetry.
- Manage skills via the skills API server.
- Provide a generic SDK action console for all OpenCode endpoints.

## Frontend State Providers

### OpenCode Context

Primary files:
- `app/src/context/opencode.tsx`

Responsibilities:
- Connect to OpenCode server and keep sessions/messages in sync.
- Subscribe to the OpenCode SSE event stream and expose event history.
- Track orchestrator worker runtime events (spawn/ready/busy/error/stopped).
- Convert UI attachments into OpenCode message parts.

Inputs and config:
- `baseUrl` (defaults to `http://localhost:4096`)

Outputs:
- Sessions, messages, parts, events, worker runtime list.
- Methods for session lifecycle and message send/abort.

### Skills Context

Primary files:
- `app/src/context/skills.tsx`

Responsibilities:
- CRUD for skills via the skills API server.
- SSE subscription for skill changes.

Inputs and config:
- `VITE_SKILLS_API_BASE` or `http://localhost:4097`

## Skills System

Primary files:
- `orchestra/src/skills/paths.ts`
- `orchestra/src/skills/parse.ts`
- `orchestra/src/skills/validate.ts`
- `orchestra/src/skills/loader.ts`
- `orchestra/src/skills/crud.ts`
- `orchestra/src/skills/convert.ts`
- `orchestra/src/skills/builtin.ts`
- `orchestra/src/skills/service.ts`
- `orchestra/src/api/skills-router.ts`
- `orchestra/src/api/skills-server.ts`

Responsibilities:
- Parse SKILL.md (YAML frontmatter + markdown body).
- Validate against Agent Skills spec plus OpenCode extensions.
- Load skills from project and global scopes, with priority rules.
- Convert skills to worker profiles and vice versa.
- Provide CRUD API and SSE events for the frontend.

Config and storage:
- Project: `.opencode/skill/<id>/SKILL.md`
- Global: `~/.opencode/skill/<id>/SKILL.md` or `OPENCODE_SKILLS_HOME`
- API port: `OPENCODE_SKILLS_PORT` or `OPENCODE_SKILLS_API_PORT` (default 4097)

Composable aspects:
- `extends` (single inheritance)
- `compose` (multi-inheritance)

## Workers

Primary files:
- `orchestra/src/workers/manager.ts`
- `orchestra/src/workers/spawn.ts`
- `orchestra/src/workers/send.ts`
- `orchestra/src/workers/registry.ts`
- `orchestra/src/workers/jobs.ts`
- `orchestra/src/workers/prompt.ts`
- `orchestra/src/workers/attachments.ts`
- `orchestra/src/workers/profiles/*`
- `orchestra/src/types/worker.ts`

Responsibilities:
- Spawn isolated OpenCode servers per profile.
- Create per-worker sessions and bootstrap prompts.
- Handle attachments, tool permissions, and memory injection.
- Track lifecycle state (starting -> ready -> busy -> error/stopped).
- Provide async job queue and result collection.

Config and behavior:
- Spawn policy, auto spawn, timeouts: `orchestra/src/types/config.ts`
- Worker profiles: built-ins + skill overrides + config overrides

Events:
- `orchestra.worker.spawned|ready|busy|error|stopped`

## Workflows

Primary files:
- `orchestra/src/workflows/*`
- `orchestra/src/types/workflow.ts`

Responsibilities:
- Define multi-step workflows with carry-forward context.
- Enforce security limits (max steps, max chars, per-step timeout).

Config:
- `workflows` and `security.workflows` in `.opencode/orchestrator.json`

Composable aspects:
- Per-step `carry` and prompt template variables `{task}` / `{carry}`

## Orchestrator Routing

Primary files:
- `orchestra/src/orchestrator/index.ts`
- `orchestra/src/orchestrator/router.ts`

Responsibilities:
- Select worker for a task based on routing rules and capabilities.
- Ensure worker spawn policy compliance (manual/on-demand/auto).
- Delegate tasks or run workflows.

## Tools (OpenCode Tool Hooks)

Primary files:
- `orchestra/src/tools/*`

Responsibilities:
- Expose orchestrator controls to OpenCode tool system.
- Enforce spawn policy via tool guard.
- Inject system context with available worker summary.

## Vision Routing

Primary files:
- `orchestra/src/ux/vision-routing.ts`
- `orchestra/src/core/container.ts` (chat.message hook wiring)
- `orchestra/src/workers/jobs.ts` (async job registry)

Responsibilities:
- Detect image parts in user messages.
- Route images to the vision worker asynchronously.
- Replace image parts with a pending placeholder and job ID.
- Persist vision job outcomes to `.opencode/vision/jobs.jsonl`.

Configuration:
- `OPENCODE_VISION_TIMEOUT_MS` (override default 300000ms)
- `OPENCODE_VISION_PROMPT` (override analysis prompt)

## Communication and Events

Primary files:
- `orchestra/src/communication/*`
- `orchestra/src/types/events.ts`

Responsibilities:
- Internal event bus (EventEmitter).
- Forward orchestration events into TUI event stream.
- Emit skill change events to frontend.

## Config and Profile Inheritance

Primary files:
- `orchestra/src/config/*`
- `orchestra/src/config/profile-inheritance.ts`

Responsibilities:
- Merge global/project config + defaults.
- Resolve worker inheritance and composition.
- Enforce spawn policy, warm pool, and model selection.

Config sources (priority):
- `~/.opencode/orchestrator.json`
- `<project>/.opencode/orchestrator.json`
- `<project>/orchestrator.json`

## Models

Primary files:
- `orchestra/src/models/*`

Responsibilities:
- Resolve model aliases and auto tags (auto:fast, auto:vision, etc).
- Score providers by cost/capabilities and selection preferences.
- Validate capabilities (vision, tools, reasoning).

Config:
- `modelSelection`, `modelAliases` in orchestrator config

## Permissions

Primary files:
- `orchestra/src/permissions/*`

Responsibilities:
- Merge tool permissions across profile inheritance.
- Compute tool availability by category (filesystem, execution, network).

## Memory

Primary files:
- `orchestra/src/memory/*`

Responsibilities:
- Auto-record assistant/user messages into memory.
- Auto-inject memory into worker sessions.
- Support Neo4j or file-based storage.

Config:
- `memory` section in orchestrator config
- Neo4j via `integrations.neo4j` or env vars

## Integrations

Primary files:
- `orchestra/src/integrations/linear.ts`
- `orchestra/src/memory/neo4j.ts`

Responsibilities:
- External service wiring for memory graph and issue tracking.

## UX Helpers

Primary files:
- `orchestra/src/ux/repo-context.ts`

Responsibilities:
- Collect repo metadata for injection into worker bootstrap prompts.

## Prompts

Primary files:
- `orchestra/prompts/orchestrator.ts` (orchestrator agent prompt)
- `orchestra/src/workers/profiles/*/profile.ts` (worker system prompts)
- `orchestra/src/workflows/*.ts` (workflow step prompts)
- Skill prompts stored in `SKILL.md` bodies

## End-to-End Flow Map

### Skill CRUD

Frontend -> Skills API -> Skills Service -> File Storage -> Events -> Frontend refresh

- UI: `app/src/components/skills/*`
- API: `orchestra/src/api/skills-router.ts`
- Service: `orchestra/src/skills/service.ts`
- Storage: `.opencode/skill/<id>/SKILL.md`
- Events: `skill.created|updated|deleted`

### Worker Spawn + Send

Frontend prompt -> Orchestrator tools -> Worker manager -> Spawn -> Session prompt

- UI: `app/src/components/prompt-input.tsx`
- Tool path: `orchestra/src/tools/worker-tools.ts`
- Spawn: `orchestra/src/workers/spawn.ts`
- Send: `orchestra/src/workers/send.ts`
- Events: `orchestra.worker.*`

### Workflow Run

Frontend/Tool -> Orchestrator -> Workflow engine -> Worker sends per step

- Tool path: `orchestra/src/tools/workflow-tools.ts`
- Engine: `orchestra/src/workflows/factory.ts`
- Limits: `orchestra/src/types/workflow.ts`

### Vision Auto-Routing (Async)

Frontend image -> Orchestrator chat hook -> Vision worker job -> await_worker_job -> Analysis

- Hook: `orchestra/src/core/container.ts` (chat.message)
- Router: `orchestra/src/ux/vision-routing.ts`
- Jobs: `orchestra/src/workers/jobs.ts`, tool `await_worker_job`
- Output log: `.opencode/vision/jobs.jsonl`

### TUI Event Flow

Orchestrator events -> Communication -> OpenCode TUI publish -> SSE -> Frontend log

- Emit: `orchestra/src/communication/index.ts`
- SSE: OpenCode event stream `/event`
- UI: `app/src/components/log-stream.tsx`

## Test Coverage Map

- Skills parsing/validation: `orchestra/test/unit/skills-*.test.ts`
- Skills CRUD and API: `orchestra/test/integration/skills-*.test.ts`
- Worker lifecycle and send: `orchestra/test/integration/worker-spawn-send.test.ts`
- Workflow runs: `orchestra/test/integration/workflow-run.test.ts`
- Worker primitives: `orchestra/test/unit/worker-*.test.ts`
