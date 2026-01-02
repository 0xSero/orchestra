# Engineering Standards

These standards apply to every task in this repository. If a change violates them, the task is not done even if CI is green.

## Stability-first engineering

- No behavior changes without tests.
- Prefer additive + compatibility layers over "big bang" rewrites.
- Every refactor must have a rollback path (usually: keep old code behind a flag until parity is proven).

## One source of truth per concept

- OpenCode config: `opencode.json` or `~/.config/opencode/opencode.json`.
- OpenCode agents: `.opencode/agent/*.md` (or agent JSON in `opencode.json`).
- OpenCode skills: `.opencode/skill/<name>/SKILL.md` (loaded via the built-in `skill()` tool).
- Orchestrator plugin config: `orchestrator.json` or `.opencode/orchestrator.json`.
- "Skill" is never a synonym for "agent profile".

## Align to OpenCode's documented contracts

We build on the OpenCode docs for plugins, agents, skills, permissions, and the SDK TUI API.

Hard rules from the docs:

- Skills frontmatter recognizes only: `name`, `description`, `license`, `compatibility`, `metadata`.
- Agents can be configured via markdown with frontmatter like `description`, `mode`, `model`, `temperature`, `tools`, `permission`.
- SDK TUI supports `tui.appendPrompt`, `tui.openHelp`, `tui.openSessions`, `tui.openThemes`, `tui.openModels`, `tui.submitPrompt`, `tui.clearPrompt`, `tui.executeCommand`, `tui.showToast`.

## Minimalism with explicit boundaries

- Every new layer must reduce total complexity (LOC + concepts).
- Prefer deleting code over adding indirection.
- If introducing a server/port/API, it must have a crisp contract, auth story, and tests.

## Production checks

Every task completes only when these pass locally and in CI:

1. `audit`
2. `format:check`
3. `lint`
4. `typecheck`
5. `test`
6. `build`

Run them together with `bun run check`.

## Repo naming rules

- "Skill" means OpenCode skill content (`.opencode/skill/<name>/SKILL.md`).
- "Agent" means OpenCode agent configuration (`.opencode/agent/*.md`).
- "Worker profile" means orchestrator-owned worker definitions (`orchestrator.json`).
- "Worker kind" means `server`, `agent`, or `subagent` in `orchestrator.json`.
- "Execution mode" means `foreground` or `background` in `orchestrator.json`.
- "Workflow" means orchestrator multi-step execution (plugin-owned).
- If it configures model/tools/permissions, it is an agent/profile, not a skill.
