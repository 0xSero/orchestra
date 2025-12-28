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
- Integrations (registry, Linear, Neo4j)
- UX helpers (repo context)
- Prompts (orchestrator + worker profiles + workflows)

## Frontend UI Surfaces

Primary files:
- `app/src/app.tsx` (router + providers)
- `app/src/components/layout/app-layout.tsx` (top nav + layout shell)
- `app/src/pages/chat.tsx` (chat + sessions sidebar)
- `app/src/pages/agents.tsx` (worker runtime view)
- `app/src/pages/profiles.tsx` (skills workspace)
- `app/src/pages/logs.tsx` (event log viewer)
- `app/src/pages/onboarding.tsx` (5-minute onboarding flow)
- `app/src/pages/settings.tsx` (SQLite preferences + overrides UI)
- `app/src/components/sidebar/worker-list.tsx` (sessions list)
- `app/src/components/worker-detail.tsx` (session detail + messages)
- `app/src/components/log-stream.tsx` (event stream + shell)
- `app/src/components/skills/*` (skill CRUD UI)
- `app/src/components/sdk/*` (SDK action runner)

Key responsibilities:
- Show OpenCode sessions, send messages, and surface event telemetry.
- Manage skills via the skills API server.
- Run the onboarding flow and persist progress state.
- Edit SQLite-backed preferences and per-worker overrides.
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

### SQLite Context

Primary files:
- `app/src/context/db.tsx`
- `app/src/pages/settings.tsx`

Responsibilities:
- Load SQLite snapshot via `/api/db`.
- CRUD preferences and worker overrides.
- Subscribe to `/api/db/events` for live updates.
- Store onboarding progress keys (`onboarding.step`, `onboarding.completed`, `onboarding.skipped`).

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
- `orchestra/src/skills/builtin.ts` (deprecated stub; no hardcoded profiles)
- `orchestra/src/skills/service.ts`
- `orchestra/src/api/skills-router.ts`
- `orchestra/src/api/skills-server.ts`

Responsibilities:
- Parse SKILL.md (YAML frontmatter + markdown body).
- Validate against Agent Skills spec plus OpenCode extensions.
- Load skills from project and global scopes, with priority rules.
- Convert skills to worker profiles and vice versa.
- Provide CRUD API and SSE events for the frontend.
- No hardcoded profiles; all workers come from SKILL.md plus overrides.

Config and storage:
- Project: `.opencode/skill/<id>/SKILL.md`
- Global: `~/.opencode/skill/<id>/SKILL.md` or `OPENCODE_SKILLS_HOME`
- API port: `OPENCODE_SKILLS_PORT` or `OPENCODE_SKILLS_API_PORT` (default 4097)

Composable aspects:
- `extends` (single inheritance)
- `compose` (multi-inheritance)

## SQLite Persistence

Primary files:
- `orchestra/src/db/index.ts`
- `orchestra/src/db/schema.ts`
- `orchestra/src/db/overrides.ts`
- `orchestra/src/api/db-router.ts`
- `app/src/context/db.tsx`
- `app/src/pages/settings.tsx`

Responsibilities:
- Persist user metadata, preferences, and worker overrides.
- Serve `/api/db` and `/api/db/events` for the dashboard.
- Apply SQLite overrides during profile refresh.
 - Store data in `.opencode/user.db` within the project directory.

## Workers

Primary files:
- `orchestra/src/workers/manager.ts`
- `orchestra/src/workers/spawn.ts`
- `orchestra/src/workers/send.ts`
- `orchestra/src/workers/registry.ts`
- `orchestra/src/workers/jobs.ts`
- `orchestra/src/workers/session-manager.ts`
- `orchestra/src/workers/event-forwarding.ts`
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
- Track session activity (child/linked/isolated) and forward linked events to the parent.

Config and behavior:
- Spawn policy, auto spawn, timeouts: `orchestra/src/types/config.ts`
- Worker profiles: skills + config overrides + SQLite overrides

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
- Route images to the vision worker synchronously.
- Inject analysis inline as `[VISION ANALYSIS]`.
- Persist vision job outcomes to `.opencode/vision/jobs.jsonl`.

Configuration:
- `OPENCODE_VISION_TIMEOUT_MS` (override default 300000ms)
- `OPENCODE_VISION_PROMPT` (override analysis prompt)

## Communication and Events

Primary files:
- `orchestra/src/communication/*`
- `orchestra/src/communication/events.ts`
- `orchestra/src/workers/session-manager.ts`

Responsibilities:
- Internal event bus (EventEmitter).
- Forward orchestration events into TUI event stream.
- Emit worker/session/model/skill events to the frontend.

## Subagent UX (Spawn → Focus → Return)

Primary files:
- `orchestra/src/workers/manager.ts`
- `orchestra/src/communication/events.ts`
- `app/src/context/opencode.tsx`
- `app/src/context/layout.tsx`

Flow (3 steps):
1) Spawn: orchestrator creates a worker session and emits `orchestra.worker.spawned`.
2) Focus: UI/TUI switches into the subagent session and streams linked events.
3) Return: on completion, the parent session receives a summary and focus returns.

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
- `orchestra/src/integrations/registry.ts`
- `orchestra/src/integrations/selection.ts`
- `orchestra/src/integrations/linear.ts`
- `orchestra/src/memory/neo4j.ts`

Responsibilities:
- Register integrations, export env vars, and provide tool factories.
- Resolve skill-driven integration selection for worker env/config.

## UX Helpers

Primary files:
- `orchestra/src/ux/repo-context.ts`

Responsibilities:
- Collect repo metadata for injection into worker bootstrap prompts.

## Prompts

Primary files:
- `orchestra/.opencode/agent/orchestrator.md` (orchestrator agent prompt)
- `.opencode/skill/<id>/SKILL.md` (project skills; repo ships samples in `orchestra/.opencode/skill`)
- `orchestra/src/workflows/*.ts` (workflow step prompts)

## End-to-End Flow Map

### Skill CRUD

Frontend -> Skills API -> Skills Service -> File Storage -> Events -> Frontend refresh

- UI: `app/src/components/skills/*`
- API: `orchestra/src/api/skills-router.ts`
- Service: `orchestra/src/skills/service.ts`
- Storage: `.opencode/skill/<id>/SKILL.md`
- Events: `skill.created|updated|deleted`

### SQLite Preferences + Overrides

Settings UI -> DB API -> SQLite -> Profile refresh -> Worker manager

- UI: `app/src/pages/settings.tsx`
- API: `orchestra/src/api/db-router.ts`
- Storage: `.opencode/user.db`
- Override apply: `orchestra/src/db/overrides.ts`

### Onboarding Flow

Onboarding UI -> session command -> workers + workflow -> outputs -> SQLite preferences

- UI: `app/src/pages/onboarding.tsx`
- Command: `orchestra/src/commands/orchestrator.ts`
- Workflow: `orchestra/src/workflows/builtins.ts`
- Preferences: `.opencode/user.db`

### Session Tracking + API

Worker events -> Session manager -> Sessions API/SSE -> Logs + Agents pages

- Manager: `orchestra/src/workers/session-manager.ts`
- API: `orchestra/src/api/sessions-router.ts`
- UI: `app/src/pages/agents.tsx`

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

### Vision Auto-Routing (Sync)

Frontend image -> Orchestrator chat hook -> Vision worker send -> Inline analysis

- Hook: `orchestra/src/core/container.ts` (chat.message)
- Router: `orchestra/src/ux/vision-routing.ts`
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
- SQLite overrides: `orchestra/test/unit/db-overrides.test.ts`
