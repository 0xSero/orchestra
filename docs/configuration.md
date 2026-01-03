# Configuration Reference

Complete reference for all Open Orchestra configuration options.

## Configuration Files

Open Orchestra reads configuration from multiple locations, merged in order (later overrides earlier):

| Location | Scope | Purpose |
|----------|-------|---------|
| Built-in defaults | Global | Sensible defaults for all options |
| `~/.config/opencode/orchestrator.json` | Global | User preferences across all projects |
| `.opencode/orchestrator.json` | Project | Project-specific settings |
| `orchestrator.json` (root) | Project | Legacy location (still supported) |

**Recommended:** Use `.opencode/orchestrator.json` for project configs.

---

## Quick Start Configs

### Minimal Config

```json
{
  "$schema": "../node_modules/opencode-orchestrator/schema/orchestrator.schema.json",
  "autoSpawn": false
}
```

### Auto-Spawn Common Workers

```json
{
  "$schema": "../node_modules/opencode-orchestrator/schema/orchestrator.schema.json",
  "autoSpawn": true,
  "workers": ["docs", "coder"]
}
```

### Full Featured Config

```json
{
  "$schema": "../node_modules/opencode-orchestrator/schema/orchestrator.schema.json",
  "basePort": 14096,
  "autoSpawn": true,
  "startupTimeout": 30000,
  "healthCheckInterval": 30000,
  "ui": {
    "toasts": true,
    "debug": false
  },
  "workflows": {
    "enabled": true
  },
  "workers": ["docs", "coder", "vision"]
}
```

---

## Configuration Options

### Core Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `$schema` | string | - | JSON Schema for editor autocomplete |
| `basePort` | number | `14096` | Starting port for worker allocation (use `0` for dynamic) |
| `autoSpawn` | boolean | `true` | Auto-start workers when plugin loads |
| `startupTimeout` | number | `30000` | Max time (ms) to wait for worker startup |
| `healthCheckInterval` | number | `30000` | Interval (ms) between health checks |

**Example:**
```json
{
  "basePort": 0,
  "autoSpawn": true,
  "startupTimeout": 45000
}
```

### UI Settings

Control the user interface behavior.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ui.toasts` | boolean | `true` | Show desktop notifications for worker events |
| `ui.injectSystemContext` | boolean | `true` | Add worker info to system prompt |
| `ui.systemContextMaxWorkers` | number | `12` | Max workers shown in context |
| `ui.defaultListFormat` | string | `"markdown"` | Output format: `"markdown"` or `"json"` |
| `ui.debug` | boolean | `false` | Enable debug logging |
| `ui.logToConsole` | boolean | `false` | Log to console (not recommended) |

**Example:**
```json
{
  "ui": {
    "toasts": true,
    "debug": false,
    "defaultListFormat": "markdown"
  }
}
```

### Agent Settings

Configure the orchestrator agent injected into OpenCode.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `agent.enabled` | boolean | `true` | Enable orchestrator agent |
| `agent.name` | string | `"orchestrator"` | Agent name |
| `agent.model` | string | - | Model to use (default: your default model) |
| `agent.prompt` | string | - | Custom system prompt (overrides `prompts/orchestrator.md`) |
| `agent.mode` | string | `"primary"` | `"primary"` or `"subagent"` |
| `agent.color` | string | - | Agent color in UI |
| `agent.tools` | object | - | Tool allow/deny overrides (OpenCode `tools.*`) |
| `agent.permission` | object | - | Permission overrides (OpenCode `permission.*`) |
| `agent.applyToBuild` | boolean | `false` | Also override the built-in `build` agent model |

**Example:**
```json
{
  "agent": {
    "enabled": true,
    "name": "orchestrator",
    "model": "anthropic/claude-sonnet-4-5",
    "mode": "primary",
    "tools": {
      "bash": false,
      "edit": false
    }
  }
}
```

### Workflow Settings

Configure the workflow engine and built-in workflows.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `workflows.enabled` | boolean | `true` | Enable workflow engine |
| `workflows.definitions` | array | `[]` | Custom workflow definitions (id/name/description/steps) |
| `workflows.triggers.visionOnImage.enabled` | boolean | `true` | Auto-run vision workflow when a message contains images |
| `workflows.triggers.visionOnImage.workflowId` | string | `vision` | Workflow ID to run for vision |
| `workflows.triggers.visionOnImage.autoSpawn` | boolean | `true` | Auto-spawn missing workers |
| `workflows.triggers.visionOnImage.blocking` | boolean | `false` | Run synchronously (blocks the message) |
| `workflows.triggers.memoryOnTurnEnd.enabled` | boolean | `true` | Auto-run memory workflow at turn end |
| `workflows.triggers.memoryOnTurnEnd.workflowId` | string | `memory` | Workflow ID to run for memory |
| `workflows.triggers.memoryOnTurnEnd.autoSpawn` | boolean | `true` | Auto-spawn missing workers |
| `workflows.triggers.memoryOnTurnEnd.blocking` | boolean | `false` | Run synchronously (blocks the message) |
| `workflows.boomerang.plannerModel` | string | `opencode/gpt-5-nano` | Planner model (provider/model) |
| `workflows.boomerang.implementerModel` | string | `opencode/gpt-5-nano` | Implementer model (provider/model) |
| `workflows.roocodeBoomerang.enabled` | boolean | `true` | Enable RooCode Boomerang workflow |
| `workflows.roocodeBoomerang.maxSteps` | number | `4` | Maximum steps in workflow |
| `workflows.roocodeBoomerang.maxTaskChars` | number | `12000` | Max characters in task |
| `workflows.roocodeBoomerang.maxCarryChars` | number | `24000` | Max characters carried between steps |
| `workflows.roocodeBoomerang.perStepTimeoutMs` | number | `120000` | Timeout per step (ms) |

**Example:**
```json
{
  "workflows": {
    "enabled": true,
    "triggers": {
      "visionOnImage": { "enabled": true, "workflowId": "vision" },
      "memoryOnTurnEnd": { "enabled": true, "workflowId": "memory" }
    },
    "boomerang": {
      "plannerModel": "opencode/gpt-5-nano",
      "implementerModel": "opencode/gpt-5-nano"
    },
    "roocodeBoomerang": {
      "enabled": true,
      "maxSteps": 4,
      "perStepTimeoutMs": 180000
    }
  }
}
```

### Security Settings

Enforce limits on workflow execution.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `security.workflows.maxSteps` | number | `4` | Global max workflow steps |
| `security.workflows.maxTaskChars` | number | `12000` | Global max task size |
| `security.workflows.maxCarryChars` | number | `24000` | Global max carry size |
| `security.workflows.perStepTimeoutMs` | number | `120000` | Global step timeout |

**Example:**
```json
{
  "security": {
    "workflows": {
      "maxSteps": 6,
      "maxTaskChars": 20000,
      "perStepTimeoutMs": 300000
    }
  }
}
```

### Pruning Settings (Context Management)

DCP-inspired context pruning to prevent token overflow.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pruning.enabled` | boolean | `false` | Enable context pruning |
| `pruning.maxToolOutputChars` | number | `12000` | Truncate tool outputs over this size |
| `pruning.maxToolInputChars` | number | `4000` | Truncate tool inputs over this size |
| `pruning.protectedTools` | string[] | `["task", "todowrite", "todoread"]` | Tools exempt from pruning |

**Example:**
```json
{
  "pruning": {
    "enabled": true,
    "maxToolOutputChars": 8000,
    "maxToolInputChars": 3000,
    "protectedTools": ["task", "todowrite"]
  }
}
```

### Notification Settings

Configure idle notifications.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `notifications.idle.enabled` | boolean | `false` | Enable idle notifications |
| `notifications.idle.title` | string | - | Notification title |
| `notifications.idle.message` | string | - | Notification message |
| `notifications.idle.delayMs` | number | `1500` | Delay before showing (ms) |

**Example:**
```json
{
  "notifications": {
    "idle": {
      "enabled": true,
      "title": "Task Complete",
      "message": "Your worker has finished",
      "delayMs": 2000
    }
  }
}
```

### Memory Settings (Neo4j)

Configure the optional persistent memory system.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `memory.enabled` | boolean | `true` | Enable memory features |
| `memory.autoSpawn` | boolean | `true` | Auto-spawn memory worker |
| `memory.autoRecord` | boolean | `true` | Auto-record conversations |
| `memory.scope` | string | `"project"` | `"project"` or `"global"` |
| `memory.maxChars` | number | `2000` | Max characters per memory entry |

**Environment Variables:**
```bash
OPENCODE_NEO4J_URI=bolt://localhost:7687
OPENCODE_NEO4J_USERNAME=neo4j
OPENCODE_NEO4J_PASSWORD=your-password
OPENCODE_NEO4J_DATABASE=opencode
```

**Example:**
```json
{
  "memory": {
    "enabled": true,
    "autoRecord": false,
    "scope": "project"
  }
}
```

### Telemetry Settings

Optional analytics (disabled by default).

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `telemetry.enabled` | boolean | `false` | Enable PostHog telemetry |
| `telemetry.apiKey` | string | - | PostHog API key |
| `telemetry.host` | string | `"https://us.i.posthog.com"` | PostHog host |

**Example:**
```json
{
  "telemetry": {
    "enabled": false
  }
}
```

### Commands Settings

Configure command injection.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `commands.enabled` | boolean | `true` | Inject orchestrator commands |
| `commands.prefix` | string | `"orchestrator."` | Command prefix |

---

## How to change worker model from the TUI

1. Run `orchestrator.models` to list available `provider/model` IDs.
2. Run `orchestrator.worker-model <workerId> <model>` to apply the model to a worker.
   Example: `orchestrator.worker-model docs openai/gpt-5` or `orchestrator.worker-model vision node:vision`
3. Run `orchestrator.workers` to confirm the worker's model and resolution reason.

---

## Model Tags

Model tags let you specify capabilities instead of specific models. Open Orchestra resolves these tags based on your configured providers.

### Available Tags

| Tag | Alias | Resolves To | Use Case |
|-----|-------|-------------|----------|
| `auto` | `node` | Your default model | General tasks |
| `auto:vision` | `node:vision` | Vision-capable model | Image analysis |
| `auto:fast` | `node:fast` | Fast/cheap model | Quick lookups |
| `auto:docs` | `node:docs` | Web-capable model | Documentation research |

### How Resolution Works

1. Open Orchestra reads your OpenCode provider configuration
2. Each provider lists its available models with capabilities
3. Tags are matched against model capabilities:
   - `:vision` requires multimodal/image support
   - `:fast` prefers models marked as fast
   - `:docs` requires web browsing capability
4. First matching model is selected
5. If no match, falls back to default model

### Override Model for a Profile

**Override in config (recommended):**
```json
{
  "profiles": [
    {
      "id": "vision",
      "model": "openai/gpt-4o"
    }
  ]
}
```

### See Available Models

```
task_list({ view: "models" })
```

---

## Profiles

Profiles define worker types with their capabilities and configuration.

### Built-in Profiles

| ID | Name | Model Tag | Vision | Web | Tools |
|----|------|-----------|--------|-----|-------|
| `vision` | Vision Analyst | `node:vision` | Yes | No | Full |
| `docs` | Documentation Librarian | `node:docs` | No | Yes | Full |
| `coder` | Code Implementer | `node` | No | No | Full |
| `architect` | System Architect | `node` | No | No | **Read-only** |
| `explorer` | Code Explorer | `node:fast` | No | No | Full |
| `memory` | Memory Graph Curator | `node` | No | Yes | Full |

Built-in profile prompts are stored under `packages/orchestrator/prompts/workers/` and referenced by `promptFile`.

### Custom Profile Example

```json
{
  "profiles": [
    {
      "id": "react-expert",
      "name": "React Specialist",
      "model": "anthropic/claude-sonnet-4-5",
      "purpose": "Expert in React development and best practices",
      "whenToUse": "When working with React components, hooks, or state management",
      "supportsVision": false,
      "supportsWeb": true,
      "promptFile": "workers/react-expert.md",
      "tags": ["react", "frontend", "typescript"]
    }
  ]
}
```

### Profile Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Unique identifier |
| `name` | string | No | Display name |
| `model` | string | No | Model ID or tag |
| `providerID` | string | No | Specific provider |
| `purpose` | string | No | What this profile does |
| `whenToUse` | string | No | When to use this profile |
| `promptFile` | string | No | Prompt file relative to `packages/orchestrator/prompts` |
| `systemPrompt` | string | No | Custom system prompt (overrides `promptFile`) |
| `port` | number | No | Fixed port (not recommended) |
| `supportsVision` | boolean | No | Has vision capability |
| `supportsWeb` | boolean | No | Has web browsing |
| `temperature` | number | No | Model temperature |
| `tags` | string[] | No | Searchable tags |
| `tools` | object | No | Tool restrictions |

### Extending Built-in Profiles

Override specific properties of a built-in profile:

```json
{
  "profiles": [
    {
      "id": "vision",
      "model": "openai/gpt-4o",
      "temperature": 0.2
    }
  ]
}
```

---

## Workers

The `workers` array specifies which profiles to auto-spawn when the plugin loads.

### String References

Reference built-in profiles by ID:

```json
{
  "workers": ["docs", "coder", "vision"]
}
```

### Inline Definitions

Define profiles directly in the workers array:

```json
{
  "workers": [
    "docs",
    {
      "id": "my-custom-worker",
      "name": "Custom Worker",
      "model": "anthropic/claude-sonnet-4-5",
      "purpose": "A custom worker for my project"
    }
  ]
}
```

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `OPENCODE_ORCH_DEBUG` | Set to `1` to enable debug logging |
| `OPENCODE_NEO4J_URI` | Neo4j connection URI |
| `OPENCODE_NEO4J_USERNAME` | Neo4j username |
| `OPENCODE_NEO4J_PASSWORD` | Neo4j password |
| `OPENCODE_NEO4J_DATABASE` | Neo4j database name |
| `POSTHOG_API_KEY` | PostHog API key (alternative to config) |

---

## Full Example Config

```json
{
  "$schema": "../node_modules/opencode-orchestrator/schema/orchestrator.schema.json",
  
  "basePort": 0,
  "autoSpawn": true,
  "startupTimeout": 45000,
  "healthCheckInterval": 30000,
  
  "ui": {
    "toasts": true,
    "debug": false,
    "defaultListFormat": "markdown"
  },
  
  "agent": {
    "enabled": true,
    "mode": "primary"
  },
  
  "workflows": {
    "enabled": true,
    "roocodeBoomerang": {
      "enabled": true,
      "maxSteps": 4
    }
  },
  
  "security": {
    "workflows": {
      "maxSteps": 6,
      "maxTaskChars": 20000
    }
  },
  
  "pruning": {
    "enabled": false
  },
  
  "memory": {
    "enabled": false
  },
  
  "telemetry": {
    "enabled": false
  },
  
  "profiles": [
    {
      "id": "vision",
      "model": "openai/gpt-4o"
    },
    {
      "id": "my-expert",
      "name": "Domain Expert",
      "model": "anthropic/claude-sonnet-4-5",
      "purpose": "Expert in my specific domain",
      "systemPrompt": "You are an expert in..."
    }
  ],
  
  "workers": ["docs", "coder", "my-expert"]
}
```

---

## Validation

The JSON Schema at `schema/orchestrator.schema.json` provides:
- Editor autocomplete
- Type validation
- Documentation on hover

Reference it in your config:
```json
{
  "$schema": "../node_modules/opencode-orchestrator/schema/orchestrator.schema.json"
}
```

---

## Related Documentation

- [Quickstart](./quickstart.md) - Get started quickly
- [Examples](./examples.md) - Real-world use cases
- [Troubleshooting](./troubleshooting.md) - Fix common issues
- [Guide](./guide.md) - Detailed usage guide
