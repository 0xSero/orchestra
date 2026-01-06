# Scope: Stabilize 24/7 + Docker + Infinite Orchestra Changes

This file captures what needs to be done to make the current diff coherent, shippable, and safe for day-to-day development.

## Goals

1. Keep the valuable orchestrator improvements (Docker-backed workers, task defaults, workflow observability, optional log-to-file).
2. Make “24/7 autonomous operation” an **opt-in** mode that cannot surprise-run or spam the repo with files.
3. Ensure Docker + Compose docs and configs are consistent, complete, and runnable.
4. Restore a clean developer workflow (`bun run check`, `bun run test`, formatting/lint) without broken scripts/paths.

## Current State Summary (What’s in the diff)

### Orchestrator config & schema

- Added config parsing + schema for:
  - `tasks` defaults (timeout/autospawn/model policy)
  - `ui.visionTimeoutMs`
  - `workflows.triggers.infiniteOrchestra`
  - `workflows.infiniteOrchestra` (goal, queue/archive dirs, plan/task workflow ids, max tasks per cycle)
  - per-worker `docker` config (image, mount, env, etc.)
  - `execution: "conversation"` (schema + types)

### Infinite Orchestra

- New workflows:
  - `infinite-orchestra-plan` (architect plans a bounded queue)
  - `infinite-orchestra` (runner reads a queue dir of `task-NN.md` files, runs them via `roocode-boomerang`, archives successes)
- Triggered on `session.idle` with cooldown and a module-level timer.

### Docker worker sandboxing

- Server worker spawn supports Docker:
  - `docker run ... opencode serve ...`
  - rewritten bridge URL host for container access
  - rewritten plugin file URLs if mount paths differ
  - fixed port selection for Docker workers

### Observability

- Logger supports JSONL to `LOG_FILE` if set.
- Workflow tasks now attach step details to `workerJobs.report.details`, and `task_list(view="workflow")` renders workflow status/steps.

### Repo-level additions

- Docker/Compose docs and files were added (Neo4j + Grafana/Loki/Promtail + orchestrator container + “supervisor” container).
- Several `scripts/*.mjs` wrappers were deleted and Biome is now invoked via `bunx`.

## Critical Problems to Fix (Blocking)

### 1) Root `package.json` broken script path

- `test:plugin` currently runs in `packages/orenchestrator` (typo).
- Fix to `packages/orchestrator`.
- Confirm `bun run test` works from the repo root.

### 2) Docker Compose references missing runtime artifacts

`docker-compose.yml` currently references things that do not exist or don’t line up with package scripts.

- `supervisor.js` is referenced but does not exist.
  - Either implement it and make it part of the repo, or remove the `supervisor` service and all “supervised mode” claims.
- `orchestrator` service runs: `command: ["bun", "run", "start:supervised"]`
  - That script exists in `packages/orchestrator/package.json`, not the repo root.
  - Decide one:
    - A) Change compose command to something that exists at repo root, or
    - B) Change the Docker image entrypoint/workdir so it runs inside `packages/orchestrator`, or
    - C) Add a root-level script that delegates to `packages/orchestrator`.
- `Dockerfile` currently ends with `CMD ["bun", "run", "dev"]`
  - That likely won’t match the intended production behavior (and may not start the control panel or any server reliably).
  - Decide the real container responsibilities:
    - “Control panel web server”
    - “Orchestrator plugin runtime”
    - “Both”
  - Update Dockerfile and compose accordingly.

### 3) Logging format mismatch (Promtail pipeline)

- Logger writes lines as JSON: `{ at, level, message }`.
- Promtail is configured to parse `timestamp` + `source` fields and uses an `output` stage with `source: output` which doesn’t exist.

Decide one:

- A) Adjust `packages/orchestrator/src/core/logger.ts` output schema to match promtail config, OR
- B) Adjust `docker/promtail/promtail-config.yaml` to match logger output.

Then verify:

- Loki receives logs.
- Grafana datasource works and can query by `level`.

### 4) “24/7 docs” reference missing scripts/files

`docs/24-7-autonomous-operation.md` references:

- `./scripts/setup-24-7.sh`
- `ecosystem.config.js`
- PM2-based health monitor setup
- health state/log paths

But these do not exist in the repo as-is.

Decide one:

- A) Implement the referenced scripts/configs and make them real, OR
- B) Rewrite the doc to describe the actual supported approach (Docker Compose supervised profile, or a Bun-native supervisor).

### 5) Repo hygiene: infinite orchestra queue files should not pollute git

The system writes to `.opencode/orchestra/tasks` and `.opencode/orchestra/done`.

- Add `.opencode/orchestra/` to `.gitignore` (or change queue dir to a location that is already ignored).
- Ensure the workflow never writes outside its configured queue/archive dirs during planning.

## Safety / Product Decisions Required (High Priority)

### 6) Make autonomous triggers opt-in by default

The current `.opencode/orchestrator.json` is very opinionated and enables autonomous triggers and debug behavior.

Decide:

- Should `.opencode/orchestrator.json` be a **developer local config** (checked in but conservative), or a **production config template**?

If it’s checked in:

- Default `workflows.triggers.infiniteOrchestra.enabled` to `false`.
- Default `workflows.triggers.selfImproveOnIdle.enabled` to `false`.
- Consider `ui.debug` defaulting to `false`.
- Avoid hard-coding specific models unless that’s intentional for the project.

Alternative approach:

- Keep `.opencode/orchestrator.json` conservative.
- Add `.opencode/orchestrator.example.json` (or a docs snippet) for “24/7 mode”.

### 7) Docker worker sandbox defaults

Right now `coder` is configured as a Docker-backed server worker in `.opencode/orchestrator.json`.

Decide:

- Is Docker worker spawning theQ default, or only for “sandboxed mode” profiles?
- If default:
  - Ensure developer onboarding includes Docker requirement.
  - Ensure behavior is graceful when Docker is not installed/running.
- If optional:
  - Provide separate profiles: `coder` (native) and `coder-docker` (sandboxed).

## Feature Completeness / Cleanup (Medium Priority)

### 8) “conversation” execution mode: finish or remove

Additions include:

- Types/schema allow `execution: "conversation"` + `conversation` options.
- Built-in profile sets an agent/subagent to `execution: "conversation"`.
- Agent backend toggles `noReply` based on this mode.

But there is no end-to-end behavior described/implemented for:

- subscribing to orchestrator events stream
- awaiting conversation responses with a configured timeout

Choose:

- A) Complete the feature:
  - Use `conversation.subscribeEvents` and `conversation.awaitTimeoutMs` in the worker/session code.
  - Add tests for expected behavior.
- B) Revert the surface area:
  - Remove `conversation` options and `execution: "conversation"` if it isn’t needed.

### 9) `OrchestratorContext.activeWorker` and `WorkerJob.steps`

These appear added but unused.

Choose:

- A) Wire them into actual behavior (UI, workflow reporting, task listing), OR
- B) Remove them to reduce maintenance.

### 10) Infinite Orchestra runner improvements

Validate and harden:

- directory traversal safety (paths resolved under project directory unless explicitly absolute)
- archiving behavior (don’t lose tasks on partial failures; include clear errors)
- what happens when planner creates malformed tasks
- cleanup of timer state on shutdown and on user activity (already partially done)

Add tests (DI-based, no mocks) for:

- ordering of tasks (task-01 before task-10, etc.)
- ENOENT handling
- archiving path format
- maxTasksPerCycle limiting
- planning invoked only when queue empty

## Tooling & Developer Experience (Medium Priority)

### 11) Replace deleted scripts or update docs that reference them

Scripts `scripts/biome.mjs`, `scripts/dev.mjs`, `scripts/loc.mjs`, `scripts/size-check.mjs` are deleted.

Actions:

- Remove/rewrite any references to these scripts across docs and project guidelines.
- Confirm new Biome invocation via `bunx @biomejs/biome` is the intended long-term approach.
- If `size:check`/`loc` are still desired, reintroduce them (prefer Bun/TS-based tooling consistent with repo standards).

### 12) Ensure `bun run check` matches project standards

The current change removed `size:check` from `check`.

Decide:

- Is this intended? If not, restore size checking (in a maintained way).

## Docker Stack Design (Medium Priority)

### 13) Confirm what “orchestrator container” actually runs

The compose file exposes port `5173` and claims it’s the control panel and orchestrator.

Decide:

- Does the container run only the control panel?
- Does it run the OpenCode orchestrator plugin as well?
- If both, define process management (one process vs supervisor, or separate services).

### 14) Validate and document Neo4j + Memory integration

If Neo4j is part of 24/7 mode:

- Ensure config points at `bolt://neo4j:7687` in container contexts and `bolt://localhost:7687` for local.
- Ensure environment variables are named consistently (`NEO4J_*`, keys, etc.).
- Provide a minimal “smoke test” instruction to verify memory actually connects.

## Acceptance Criteria (Definition of Done)

1. `bun run test` works from repo root.
2. `bun run lint`, `bun run format:check`, and `bun run typecheck` work.
3. `.opencode/orchestrator.json` is safe-by-default (no surprising autonomous runs).
4. If Docker/Compose is kept:
   - `bun run docker:start` brings up the stack without missing files.
   - orchestrator/control panel endpoints match documentation.
   - logs appear in Grafana (or the logging stack is removed from the docs).
5. Infinite Orchestra workflow can be enabled explicitly and:
   - writes only to queue/archive dirs
   - does not create untracked noise outside ignored paths
   - is observable via task reports (`task_list(view="workflow")`)

## Suggested Work Order

1. Fix `package.json` typo + verify root test scripts.
2. Decide: keep Docker stack vs revert; keep “supervisor” vs remove.
3. Align Dockerfile/compose/scripts/docs to chosen direction.
4. Add `.opencode/orchestra/` to `.gitignore`.
5. Make autonomous triggers opt-in + provide a separate “24/7 mode” config example.
6. Align logger output with promtail config (or drop promtail).
7. Finish-or-remove: `execution: "conversation"`, `activeWorker`, `WorkerJob.steps`.
8. Add/extend tests for the infinite orchestra runner and docker worker config parsing.

