# Open Orchestra

Multi-agent orchestration plugin for [OpenCode](https://github.com/opencode-ai/opencode). Spawn, manage, and coordinate specialized AI workers from a single conversation.

## Quick Install

```bash
bun x open-orchestra
# or: npx open-orchestra
```

This zero-config setup will:
1. Add the plugin to your project OpenCode config
2. Create `orchestrator.json` with worker profiles
3. Optionally create example skill files

## Manual Installation

Add to your OpenCode config (`.opencode/opencode.json`, `opencode.json`, or `~/.config/opencode/opencode.json`):

```json
{
  "plugin": ["open-orchestra@0.2.4"]
}
```

Then create `orchestrator.json` (project: `.opencode/orchestrator.json`, global: `~/.config/opencode/orchestrator.json`):

```json
{
  "$schema": "https://unpkg.com/open-orchestra@0.2.4/schema/orchestrator.schema.json",
  "autoSpawn": true,
  "profiles": [
    {
      "id": "coder",
      "name": "Code Implementer",
      "model": "anthropic/claude-sonnet-4-20250514",
      "purpose": "Write and edit code"
    },
    {
      "id": "docs",
      "name": "Documentation Librarian",
      "model": "anthropic/claude-sonnet-4-20250514",
      "purpose": "Research docs and find examples",
      "supportsWeb": true
    }
  ],
  "workers": ["coder", "docs"]
}
```

## How It Works

1. **Ask the orchestrator** - It analyzes your request and delegates to specialized workers
2. **Workers execute** - Each worker has its own model, tools, and expertise
3. **Results return** - Summaries flow back to the main conversation

## Slash Commands

Imperative, verb-first commands (recommended):

```bash
/orchestrator status [json]
/orchestra status [json]
/orchestrator list
/orchestrator spawn <profileId>
/orchestrator stop <profileId|all>
/orchestrator onboard [council|multimodal|all]
/vision.analyze [--path <file>] [--prompt <text>]
/memory.record <key> <value> [--tags tag1,tag2]
/memory.query <query> [--limit 10]
```

## Worker Profiles

Define workers inline in `orchestrator.json` or as skills in `.opencode/skill/<id>/SKILL.md`:

```yaml
---
name: vision
description: Analyze images and screenshots
model: anthropic/claude-sonnet-4-20250514
supportsVision: true
tools:
  read: true
  write: false
---

You are a vision specialist. Describe images accurately and extract relevant details.
```

## Features

- **Multi-model orchestration** - Use different models for different tasks
- **Tool isolation** - Workers can have restricted tool access
- **Session modes** - `linked` (shared context), `child` (inherited), `isolated`
- **Memory integration** - Optional Neo4j-backed knowledge graph
- **Vision routing** - Automatic image analysis via vision-capable workers

## CLI Options

```bash
npx open-orchestra               # Zero-config setup (defaults, no prompts)
npx open-orchestra --yes         # Accept all defaults
npx open-orchestra --minimal     # Minimal config only
npx open-orchestra --interactive # Guided setup with prompts
npx open-orchestra --full        # Zero-config + example skills
npx open-orchestra --help       # Show help
```

## Configuration Reference

See the [full schema](./schema/orchestrator.schema.json) for all options.

| Field | Description |
|-------|-------------|
| `autoSpawn` | Auto-start workers on demand |
| `profiles` | Worker definitions |
| `workers` | Workers to pre-spawn |
| `memory.enabled` | Enable Neo4j memory graph |
| `integrations` | Neo4j, Linear, etc. |

## Environment Overrides

You can override common settings with environment variables (useful for CI or temporary tweaks):

```bash
OPENCODE_ORCH_AUTO_SPAWN=true
OPENCODE_ORCH_SPAWN_ON_DEMAND=vision,docs
OPENCODE_ORCH_BASE_PORT=15000
OPENCODE_ORCH_STARTUP_TIMEOUT_MS=60000
OPENCODE_ORCH_HEALTH_INTERVAL_MS=30000
OPENCODE_ORCH_COMMANDS=false
OPENCODE_ORCH_COMMAND_PREFIX=orch.
OPENCODE_ORCH_UI_TOASTS=false
OPENCODE_ORCH_UI_WAKEUP=false
OPENCODE_ORCH_UI_FIRST_RUN_DEMO=false
OPENCODE_ORCH_MEMORY=false
OPENCODE_ORCH_WORKFLOWS=false
OPENCODE_ORCH_PRUNING=true
OPENCODE_ORCH_TELEMETRY=true
```

## Troubleshooting

- "No worker available": add profiles to `orchestrator.json`, enable `autoSpawn`, or `/orchestrator spawn <id>`.
- "Spawning worker ... is disabled by spawnPolicy": update `spawnPolicy` to allow manual/on-demand spawning.
- "Worker ... did not become ready": check worker logs and increase `OPENCODE_ORCH_STARTUP_TIMEOUT_MS`.
- "Workflows are not enabled": set `workflows.enabled=true` or `OPENCODE_ORCH_WORKFLOWS=true`.
- "Missing Linear credentials": set `LINEAR_API_KEY` and `LINEAR_TEAM_ID` or configure `integrations.linear`.
- "projectId is required for project scope": run inside a project or set `OPENCODE_PROJECT_DIR`.

## License

MIT
