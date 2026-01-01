# Task 02 — Align Built-in Profiles With Documented Model Tags

## Goal

Make built-in worker profiles consistently use model tags (`node:*`) rather than hardcoded provider/model IDs, matching documented behavior and enabling dynamic selection based on user configuration.

## Why this task exists

Hardcoding a provider/model in built-in profiles prevents users from:

- Switching providers without editing orchestrator code
- Using `/connect` + their configured models as the source of truth
- Getting consistent behavior across environments

## Before (current state)

- Built-in `vision` profile hardcodes model:
  - `packages/orchestrator/src/config/profiles.ts:14` (vision profile)
  - `packages/orchestrator/src/config/profiles.ts:18` (`model: "zhipuai-coding-plan/glm-4.6v"`)
- Docs state built-in `vision` model tag is `node:vision`:
  - `docs/configuration.md:367` (built-in profiles table)

## After (expected state)

- Built-in `vision` profile uses `node:vision` (or `auto:vision`) consistently.
- Any doc references to the built-in profiles match code.

## Implementation steps

1. Change the built-in `vision` profile model tag:
   - Edit `packages/orchestrator/src/config/profiles.ts:18`
   - Set `model` to `node:vision`
2. Confirm the server backend can still resolve tags:
   - `packages/orchestrator/src/workers/backends/server.ts:41` (`isNodeTag`)
   - `packages/orchestrator/src/workers/backends/server.ts:60` (hydrate call)
3. Ensure docs remain accurate:
   - `docs/configuration.md:319` (tags table)
   - `docs/configuration.md:365` (profiles table)

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
git add packages/orchestrator/src/config/profiles.ts docs/configuration.md
git commit -m "refactor(orchestrator): use node:vision for built-in vision worker"
git push origin main
```

## Completion record (fill in when done)

- Commit: `HEAD`
- After references (update with final line numbers):
  - `packages/orchestrator/src/config/profiles.ts:18`
  - `docs/configuration.md:367`
