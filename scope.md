# OpenCode Boomerang — Scope

## What we’re building

We’re porting a real, repeatable work process into the orchestrator’s workflow engine:

1. **Plan/Scope pass** (“architect” style): read a target directory, produce a code map + a big-picture `scope.md`, write operational `rules.md`, and generate the full task queue upfront under `tasks/` (`tasks/task-00.md` … `tasks/task-NN.md`).
2. **Execute pass** (“coder” style): tasks are then fed to the implementer one-at-a-time, in order, so the model only ever sees a single task per turn.

This continues until the “big goal” is complete, with each task being a 15–60 minute unit of work.
The key difference is we generate the whole queue first, then we drain it.

In parallel, we’re making the system **provably correct and debuggable** with a headless E2E workflow test harness that:

- Runs a real workflow against a real prompt.
- Produces real artifacts in the repo (so you can validate results visually).
- Writes a full, timestamped audit bundle to a gitignored `test-runs/` directory (messages, tool calls, events, warnings/errors, timings, outputs).

## Two top-level goals

### Goal A — Product workflow (“your process”, automated)

Encode the process as a workflow definition that can run end-to-end via the existing Task API:

- `task_start({ kind: "workflow", workflowId, task, ... })`
- `task_await({ taskId })`

The workflow must be able to:

- Read a specified directory (initial dogfood target: `packages/orchestrator`).
- Produce `scope.md` + `rules.md` + a complete `tasks/` queue (not just the first task).
- Keep tasks small and sequenced (one task per turn; queue drained in order).
- Enforce a strict handoff format so carry is useful and bounded.

Execution is queue-based (Open Queue model):

- We can submit multiple task messages without interrupting an active run.
- Messages are delivered only when the session is idle, in FIFO order (see https://github.com/0xSero/open-queue for the reference behavior we’re matching).

### Goal B — Engineering workflow E2E test (visible + quantified)

Make workflow runs observable and reviewable:

- Every headless workflow E2E run creates `test-runs/run-{workflow}-{timestamp}/` (gitignored).
- The run directory contains:
  - Full orchestrator event stream
  - Orchestrator internal log buffer
  - Full worker session transcripts (including tool parts/tool calls)
  - A computed summary with counts + durations (quantified visibility)

## Hard constraints (repo contract)

- **Never delete tests.**
- **No mocks.** Tests use dependency injection and/or real fakes (local processes, temp dirs, in-memory adapters).
- **E2E model:** all E2E tests default to `opencode/gpt-5-nano` (via `OPENCODE_ORCH_E2E_MODEL` override only when explicitly set).
- **Minimal changes:** prefer reuse and reduction over adding new surface area.
- **No new code comments** unless explicitly requested (repo standard).

## OpenCode primitives we rely on (from opencode.ai docs)

### Skills

OpenCode discovers skills at:

- Project: `.opencode/skill/<name>/SKILL.md`
- Global: `~/.config/opencode/skill/<name>/SKILL.md`
- Claude-compatible: `.claude/skills/<name>/SKILL.md` and `~/.claude/skills/<name>/SKILL.md`

`SKILL.md` YAML frontmatter recognizes only:

- `name` (required)
- `description` (required)
- `license` (optional)
- `compatibility` (optional)
- `metadata` (optional map)

Names must match `^[a-z0-9]+(-[a-z0-9]+)*$` and match the directory name.

### SDK TUI

OpenCode SDK exposes TUI helpers (used by this repo already):

- `client.tui.appendPrompt({ body })`
- `client.tui.openHelp()`, `openSessions()`, `openThemes()`, `openModels()`
- `client.tui.submitPrompt()`, `clearPrompt()`
- `client.tui.executeCommand({ body })`
- `client.tui.showToast({ body })`

### Server APIs

Headless OpenCode server exposes:

- Agents: `GET /agent` (list available agents)
- Logging: `POST /log` (write log entries)

These matter for headless testing and for “perfect visibility” runs.

## Code map (focused on the big goal)

### Workflow engine + execution

- `packages/orchestrator/src/workflows/engine.ts`: prompt templating, handoff parsing, carry/trim logic, `runWorkflow`.
- `packages/orchestrator/src/workflows/runner.ts`: run persistence, UI gating, skill preflight, worker spawn/send plumbing.
- `packages/orchestrator/src/workflows/roocode-boomerang.ts`: existing plan→implement→review→fix loop (closest precedent).
- `packages/orchestrator/src/workflows/index.ts`: workflow registration (`loadWorkflows`).
- `packages/orchestrator/src/workflows/triggers.ts`: auto-triggered workflows (vision/memory).

### Task API (the orchestrator’s only “public” tool surface)

- `packages/orchestrator/src/command/tasks.ts`: implements `task_start`, `task_await`, `task_peek`, `task_list`, `task_cancel`; runs workflows via `runWorkflowWithContext`.

### Workers

- `packages/orchestrator/src/config/profiles.ts`: built-in worker profiles (`coder`, `architect`, etc).
- `packages/orchestrator/src/workers/spawner.ts`: spawn/stop/send abstraction.
- `packages/orchestrator/src/workers/backends/server.ts`: server workers (isolated `opencode serve` processes).
- `packages/orchestrator/src/workers/backends/agent.ts`: in-process agent/subagent workers.
- `packages/orchestrator/src/workers/prompt/*`: attachments formatting + response extraction (tool parts matter for test visibility).

### Skills + permissions

- `packages/orchestrator/src/skills/discovery.ts`: finds `SKILL.md` roots.
- `packages/orchestrator/src/skills/validate.ts`: validates name/description constraints.
- `packages/orchestrator/src/skills/preflight.ts`: permission checks and workflow step requirements.
- `packages/orchestrator/bin/worker-bridge-plugin.mjs`: worker-side bridge that streams chunks and emits skill load/permission events.

### Observability surfaces we’ll record in tests

- `packages/orchestrator/src/core/orchestrator-events.ts`: typed in-process event bus (`onOrchestratorEvent`).
- `packages/orchestrator/src/core/logger.ts`: internal log buffer (`getLogBuffer`).
- `packages/orchestrator/src/core/bridge-server.ts`: SSE events endpoint and worker bridge endpoints.

### Existing headless test harness (we’ll extend)

- `packages/orchestrator/test/helpers/e2e-env.ts`: isolated XDG dirs for headless OpenCode runs.
- `packages/orchestrator/test/e2e/*.test.ts`: model-backed tests already defaulting to `opencode/gpt-5-nano`.

## What we will add (high level)

1. **A new boomerang workflow** that encodes your 2-phase process:
   - Planner step reads a directory, writes `scope.md` + `rules.md` + `tasks/task-00.md`.
   - Coder step executes task-00, then writes `tasks/task-01.md`.
   - Optional reviewer/fix loop (bounded carry) for polish.
2. **A workflow E2E “visibility harness”**:
   - Creates `test-runs/run-{workflow}-{timestamp}/`.
   - Records orchestrator events + log buffer + worker messages/tool parts.
   - Computes summary counts/timings so failures are diagnosable.
3. **Docs updates** so contributors can run the workflow tests and inspect artifacts.

## E2E run artifacts (required contents)

Minimum bundle for each workflow E2E run:

- `test-runs/run-{workflow}-{timestamp}/meta.json`
- `test-runs/run-{workflow}-{timestamp}/events.jsonl` (one orchestrator event per line)
- `test-runs/run-{workflow}-{timestamp}/orchestrator.log.jsonl` (log buffer entries)
- `test-runs/run-{workflow}-{timestamp}/workers/<workerId>/messages.json` (full OpenCode session messages; includes tool parts)
- `test-runs/run-{workflow}-{timestamp}/summary.json` (counts + durations + pass/fail)

`test-runs/` must be gitignored and never committed.

## Definition of done (end state)

- A workflow exists and is runnable from OpenCode via `task_start(kind="workflow")`.
- Tasks are generated sequentially under `tasks/` and match the required format (Before/After, acceptance criteria, test plan).
- The workflow E2E test:
  - Runs headlessly (OpenCode server + workers).
  - Uses `opencode/gpt-5-nano` by default.
  - Produces the run artifact bundle with complete visibility into messages/tool calls/events/errors.
- `bun run check` passes (lint + typecheck + full test suite + build).
