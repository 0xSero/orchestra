# Boomerang Workflow Rules

These rules are the operational contract for any human or AI worker executing `tasks/task-XX.md` in this repo.

## 1) Branching

- Start each task on a fresh branch from the current main branch.
- Branch format: `boomerang/task-XX-short-slug`.

## 2) Implement exactly the task

- Do exactly what `tasks/task-XX.md` asks.
- Prefer reuse and code reduction over adding new surface area.
- Avoid unrelated refactors.

## 3) Code style (hard)

- Follow `docs/standards.md` and repo `AGENTS.md` rules (stability-first, minimal changes, no mocks, no comment additions).
- TypeScript conventions:
  - ESM modules (`import`/`export`), `import type` for type-only imports.
  - Prefer `"node:*"` specifiers for Node built-ins.
  - Keep exports small and testable (pure functions where possible; DI for stateful code).
  - Avoid `any` unless you’re crossing SDK/tool boundaries; keep `any` localized.
- Formatting/lint:
  - Use Biome via `bun run lint` (and `bun run format` only when needed).
  - Do not hand-format; match existing style (2-space indent, double quotes, semicolons).

## 4) Verify, commit, push (hard)

- Never delete tests.
- No mocks. Use dependency injection and/or real fakes.
- Run the full suite locally before finishing a task:
  - `bun run audit`
  - `bun run format:check`
  - `bun run size:check` (PR-only gate in CI; may skip locally)
  - `bun run lint`
  - `bun run typecheck`
  - `bun run test`
  - `bun run build`
  - Or run everything at once: `bun run check`
- Commit and push the branch after the suite passes:
  - `git status`
  - `git commit -am "task-XX: <short summary>"` (or stage + commit as appropriate)
  - `git push -u origin HEAD`

## 5) E2E model policy (hard)

- E2E tests default to `opencode/gpt-5-nano`.
- Allow overrides only via `OPENCODE_ORCH_E2E_MODEL` when explicitly set (and document why).

## 5.1) Production model intent (hard requirement: OpenCode model IDs)

- Do not invent model names. Only use models that exist in OpenCode’s configured providers/models.
- Any model reference must be either:
  - A full `provider/model` string (preferred), or
  - An OpenCode `ModelRef` object `{ providerID, modelID }` (when calling `client.session.prompt`).
- The workflow’s “planner” and “implementer” steps map to two configured model IDs:
  - Planner = “XHIGH” quality tier (your chosen `provider/model` in OpenCode).
  - Implementer = “codex-xhigh” quality tier (your chosen `provider/model` in OpenCode).

## 6) Queue semantics (hard)

- Task files are generated upfront as a complete queue under `tasks/`.
- Tasks are executed strictly in order (FIFO), one task per model turn.
- When running interactively, use Open Queue (https://github.com/0xSero/open-queue) semantics: messages must not interrupt an active run; they wait until idle.

## 7) Workflow output contracts

- Workflow steps must follow the headings in `packages/orchestrator/prompts/snippets/workflow-handoff-schema.md`.
- When authoring `tasks/task-XX.md`, include:
  - **Before** (current state, file references)
  - **After** (desired state)
  - **Acceptance criteria** (verifiable)
  - **Files to touch** (expected)
  - **Test plan** (commands + what to look for)

## 8) Visibility and run artifacts (hard for workflow E2E tests)

- Workflow E2E tests must create `test-runs/run-{workflow}-{timestamp}/` (gitignored).
- The run must record:
  - Orchestrator events
  - Orchestrator log buffer
  - Worker transcripts including tool parts/tool calls
  - A quantified summary (counts + timings + warnings/errors)
- Never commit `test-runs/` contents.

## 9) Documentation

- If a task changes behavior/config, update docs in `docs/` accordingly.
- Prefer documenting “why” and operational steps (how to run/verify) over re-stating code.
