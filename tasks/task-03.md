# task-03 — Add explicit model selection for boomerang workflows (OpenCode provider/models)

## Goal

Ensure “planner vs implementer” models are always selected using OpenCode’s configured providers/models (never invented names), and that this is configurable for both interactive runs and headless E2E.

## Before (current state)

- Worker prompt overrides already require full model ids (`provider/model`) and are converted to `{ providerID, modelID }` in:
  - `packages/orchestrator/src/workers/send.ts` (`buildWorkerPromptBody`)
- Workflow steps do not have a first-class model override; they rely on worker profile models.
- There is no boomerang-specific model configuration yet.

## After (desired state)

- The boomerang workflow(s) can be configured with two model ids:
  - `plannerModel` (OpenCode `provider/model`)
  - `implementerModel` (OpenCode `provider/model`)
- In E2E, both default to `opencode/gpt-5-nano` unless overridden by env.
- Model ids are validated against OpenCode providers/models (use the existing catalog + resolve logic).

## Scope (what to do in this task)

1. Decide the configuration surface for boomerang models:
   - Preferred: orchestrator config (`orchestrator.json`) under `workflows` (new section)
2. Parse + validate model ids using existing helpers:
   - `packages/orchestrator/src/models/catalog.ts` (`resolveModelRef`, `filterProviders`, `flattenProviders`)
3. Wire the resolved model ids into the worker profiles used by boomerang workflows:
   - Planner worker uses `plannerModel`
   - Implementer worker uses `implementerModel`
4. Add unit coverage for configuration parsing + validation (no mocks; inject fake providers list).

## Non-goals

- Implementing the boomerang workflow definition itself (next tasks).

## Acceptance criteria

- A boomerang workflow run uses the configured OpenCode model ids (validated via `task_list({ view: "models" })` in a real OpenCode run).
- Unit tests cover: valid model id, invalid model id with suggestions, missing model id behavior.

## Test plan

- `bun run lint`
- `bun run typecheck`
- `bun run test`

