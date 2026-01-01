# Task 06 — Apply Model Choice at Prompt Time (Per-Message Override)

## Goal

Enable dynamic model switching by setting `session.prompt.body.model` on worker prompts, instead of relying solely on the worker’s server process default model.

This must also make **agent backend** workers respect `profile.model`.

## Why this task exists

- Server backend supports “default model at spawn”, but that is not enough for dynamic changes without respawn.
- Agent backend currently ignores `profile.model` entirely.
- OpenCode supports per-message model overrides (and this is the smallest-change path to dynamic switching).

## Before (current state)

- OpenCode SDK supports `body.model`:
  - `packages/orchestrator/node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts:2236`
- Orchestrator does not set `body.model`:
  - `packages/orchestrator/src/workers/send.ts:86` (session.prompt)
  - `packages/orchestrator/src/workers/send.ts:90` (agent only)
- Agent backend uses `sendWorkerPrompt` without any model override:
  - `packages/orchestrator/src/workers/backends/agent.ts:149`

## After (expected state)

- `sendWorkerPrompt(...)` accepts an optional `model` (canonical `provider/model` string).
- It parses/sends `{ providerID, modelID }` into `session.prompt.body.model`.
- Agent backend passes the worker’s resolved model into `sendWorkerPrompt`, so agent workers actually run using the intended model.

## Implementation steps

1. Extend `sendWorkerPrompt` input to accept `model?: string`:
   - `packages/orchestrator/src/workers/send.ts:52`
2. Parse `providerID/modelID` using existing helpers:
   - `packages/orchestrator/src/models/catalog.ts:20` (parseFullModelID)
3. Set `body.model` in the prompt request when `model` is present:
   - Update `packages/orchestrator/src/workers/send.ts:89`–`packages/orchestrator/src/workers/send.ts:93`
4. Update both backends to pass the model:
   - Server backend: `packages/orchestrator/src/workers/backends/server.ts:369` (sendWorkerPrompt call site)
   - Agent backend: `packages/orchestrator/src/workers/backends/agent.ts:149` (sendWorkerPrompt call site)
5. Add unit tests for prompt payload building (no mocks; test a helper function if extracted).

## Verification (must pass before proceeding)

```bash
bun run lint
bun run typecheck
bun run test:e2e
bun run build
```

Do not proceed until all commands pass and any task-introduced warnings/errors are eliminated.

## Git (must do before proceeding)

```bash
git add packages/orchestrator/src/workers/ packages/orchestrator/test/unit/
git commit -m "feat(orchestrator): support per-message model overrides for workers"
git push origin main
```

## Completion record (fill in when done)

- Commit: `HEAD`
- After references (update with final line numbers):
  - `packages/orchestrator/src/workers/send.ts:53`
  - `packages/orchestrator/src/workers/backends/agent.ts:151`
  - `packages/orchestrator/src/workers/backends/server.ts:369`
