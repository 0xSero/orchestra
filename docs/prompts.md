# Prompts

This plugin treats prompts as content files instead of inline strings. The orchestrator and worker prompts live under `packages/orchestrator/prompts/` and are loaded at runtime.

## Prompt map

- Orchestrator agent prompt: `packages/orchestrator/prompts/orchestrator.md`
- Worker prompts: `packages/orchestrator/prompts/workers/<id>.md`
  - `vision` -> `packages/orchestrator/prompts/workers/vision.md`
  - `docs` -> `packages/orchestrator/prompts/workers/docs.md`
  - `coder` -> `packages/orchestrator/prompts/workers/coder.md`
  - `architect` -> `packages/orchestrator/prompts/workers/architect.md`
  - `explorer` -> `packages/orchestrator/prompts/workers/explorer.md`
  - `memory` -> `packages/orchestrator/prompts/workers/memory.md`

## How prompts are selected

- The orchestrator agent uses `packages/orchestrator/prompts/orchestrator.md` by default.
- `agent.prompt` in `orchestrator.json` overrides the default orchestrator prompt.
- Worker profiles reference prompt files via `promptFile` (relative to `packages/orchestrator/prompts`).
- `systemPrompt` on a profile overrides `promptFile` when both are present.

## TUI UX touchpoints

The orchestrator uses the OpenCode SDK TUI APIs to reduce confusion and make state visible:

- `tui.openHelp()` is used by onboarding tools (first-run flows) to surface built-in docs.
- `tui.openModels()` is used when no configured model is available.
- `tui.showToast()` is used for worker spawn/failed events and workflow completion.

## Glossary alignment

- **Agents** are OpenCode agents (`opencode.json` or `.opencode/agent/*.md`).
- **Skills** are OpenCode skills (`.opencode/skill/<name>/SKILL.md`).
- **Worker profiles** are orchestrator-owned config entries and should not be called "skills".
