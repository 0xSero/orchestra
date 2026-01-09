# Git Worktrees

Git worktrees let you run autonomous workflows in an isolated checkout (without a full clone), keeping your main repo clean while experiments run 24/7.

## Quick start

Create a sandbox worktree + OpenCode session using the `open-trees` plugin:

```text
worktree_mode { "action": "on" }
worktree_make { "action": "start", "name": "orchestra-sandbox", "openSessions": true }
```

Or from OpenCode (orchestrator agent):

```text
task_start({ kind: "workflow", workflowId: "worktree-sandbox", task: "Create a sandbox worktree for 24/7 operation" })
```

To enable 24/7 triggers only in the sandbox, create `.opencode/orchestrator.local.json` inside the worktree:

```json
{
  "$schema": "../packages/orchestrator/schema/orchestrator.schema.json",
  "workflows": {
    "triggers": {
      "infiniteOrchestra": { "enabled": true, "idleMinutes": 30, "cooldownMinutes": 5 }
    }
  }
}
```

If you want a dedicated OpenCode server for the sandbox, run `opencode serve` from the worktree directory after linking the plugin.

## Recommended pattern

- Main repo: keep triggers disabled in `.opencode/orchestrator.json`.
- Worktree: enable triggers in `.opencode/orchestrator.local.json`.
- Run OpenCode from the worktree directory so `.opencode/*` paths stay inside that worktree.

## Dispatching workers into worktrees

You can define multiple worker profiles that all inherit from a base profile but run in different directories:

```json
{
  "profiles": [
    { "id": "coder-wt-01", "base": "coder", "directory": "../orchestra-worktree-01" },
    { "id": "coder-wt-02", "base": "coder", "directory": "../orchestra-worktree-02" }
  ]
}
```

Each `directory` is resolved relative to the orchestrator’s current project directory.

## Local config overlays

This repo supports gitignored local overlays:

- Orchestrator: `.opencode/orchestrator.local.json` (or legacy `orchestrator.local.json`)
- OpenCode: `.opencode/opencode.local.json` (or legacy `opencode.local.json`)

These are merged after the tracked project config and are the best place for worktree-specific 24/7 settings.
