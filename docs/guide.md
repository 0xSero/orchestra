# Guide

This guide covers configuration, profile loading, and common workflows for Open Orchestra.

## Quick start

1. Enable the plugin in your OpenCode config.
2. Add a project config at `.opencode/orchestrator.json`.
3. Spawn only the workers you need.

```json
// opencode.json or ~/.config/opencode/opencode.json
{
  "plugin": ["opencode-orchestrator"]
}
```

```json
// .opencode/orchestrator.json
{
  "$schema": "../node_modules/opencode-orchestrator/schema/orchestrator.schema.json",
  "autoSpawn": true,
  "workers": ["vision", "docs", "coder"]
}
```

## Config locations

Preferred locations (keep it simple):

- Global defaults: `~/.config/opencode/orchestrator.json`
- Project overrides: `.opencode/orchestrator.json`

Legacy support (avoid if possible):

- `orchestrator.json` in the project root is still read, but it is deprecated in docs.

## Profile loading rules

Profiles are loaded in a single pass and grouped so it is easy to reason about:

1. Built-in profiles load first.
2. `profiles` entries override or extend built-ins.
3. `workers` entries decide which profiles auto-spawn.
   - Strings reference existing profile IDs.
   - Full profile objects are merged in and then auto-spawned.

The `workers` list is de-duplicated and only keeps IDs that resolve to valid profiles.

## Model tags

Profiles can reference concrete model IDs or use tags for auto-selection:

- `node` or `auto` -> use the current default model
- `node:vision` or `auto:vision` -> pick a vision-capable model
- `node:docs` or `auto:docs` -> pick a web-capable model
- `node:fast` or `auto:fast` -> pick a fast model

## Examples

Minimal config (auto-spawn a few built-ins):

```json
{
  "$schema": "../node_modules/opencode-orchestrator/schema/orchestrator.schema.json",
  "basePort": 14096,
  "autoSpawn": true,
  "startupTimeout": 30000,
  "healthCheckInterval": 30000,
  "workflows": { "enabled": true },
  "workers": ["vision", "docs", "coder"]
}
```

Custom profiles mixed with built-ins:

```json
{
  "$schema": "../node_modules/opencode-orchestrator/schema/orchestrator.schema.json",
  "basePort": 14096,
  "autoSpawn": true,
  "startupTimeout": 45000,
  "workers": [
    {
      "id": "vision",
      "name": "Vision Analyst",
      "model": "openrouter/meta-llama/llama-3.2-11b-vision-instruct",
      "purpose": "Analyze images, screenshots, diagrams, and visual content",
      "whenToUse": "When you need to understand visual content",
      "supportsVision": true
    },
    {
      "id": "ethers-docs",
      "name": "Ethers.js Specialist",
      "model": "anthropic/claude-sonnet-4-5",
      "purpose": "Expert in Ethers.js library for Ethereum development",
      "whenToUse": "When working with Ethers.js or smart contracts",
      "supportsWeb": true,
      "systemPrompt": "You are an Ethers.js expert. Focus on v5/v6 differences and contract interactions."
    },
    "coder"
  ]
}
```

OpenCode config with an orchestrator agent:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-sonnet-4-5",
  "plugin": ["opencode-orchestrator"],
  "agent": {
    "orchestrator": {
      "description": "Main orchestrator that coordinates specialized workers",
      "model": "anthropic/claude-opus-4-5",
      "prompt": "You are an orchestrator agent. Use worker tools to delegate tasks.",
      "mode": "primary"
    }
  }
}
```

## Workflows

Built-in workflows are available for multi-step runs:

- `list_workflows` - list registered workflows
- `run_workflow` - run a workflow by id
- `orchestrator.workflows` - command shortcut for listing workflows
- `orchestrator.boomerang` - command shortcut for the RooCode boomerang workflow

Example:

```bash
run_workflow({ workflowId: "roocode-boomerang", task: "Add workflow tools and docs" })
```

Security limits live in config:

```json
{
  "workflows": {
    "enabled": true,
    "roocodeBoomerang": { "maxSteps": 4 }
  },
  "security": {
    "workflows": { "maxSteps": 4, "maxTaskChars": 12000, "maxCarryChars": 24000, "perStepTimeoutMs": 120000 }
  }
}
```

## Debug logging

To enable debug logs:

- Set `ui.debug` in `orchestrator.json`, or
- Export `OPENCODE_ORCH_DEBUG=1`

Recent logs are buffered and visible via `orchestrator.diagnostics`.

## Troubleshooting

- Worker won't respond: verify provider credentials in `opencode.json` and set a concrete model via `set_profile_model`.
- Model selection feels wrong: run `list_models`, then pin profiles to explicit `provider/model` IDs.
- Need internal logs: enable `ui.debug` or `OPENCODE_ORCH_DEBUG=1`, then check `orchestrator.diagnostics`.

## Memory (optional)

The memory system stores durable knowledge in Neo4j. Set these variables if you want it enabled:

```
OPENCODE_NEO4J_URI=bolt://localhost:7687
OPENCODE_NEO4J_USERNAME=neo4j
OPENCODE_NEO4J_PASSWORD=your-password
OPENCODE_NEO4J_DATABASE=opencode
```

Memory tools:

- `memory_put` to store facts or decisions
- `memory_search` to retrieve entries
- `memory_recent` to review recent updates

## Performance tips

- Keep `autoSpawn` small. Start with `docs` or `coder` and add others later.
- Prefer `node:*` tags so profiles resolve to the last-known working models.
- Avoid parallel spawning unless you have plenty of headroom.
