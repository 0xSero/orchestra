# Open Orchestra (Plugin)

Multi-agent orchestration plugin for OpenCode. This package provides the orchestrator runtime, worker lifecycle, and tool bindings.

## Install (pin version)

OpenCode resolves plugin versions once. Pin a version explicitly:

```bash
bun add @open-orchestra/opencode-orchestrator@0.2.3
```

## Enable the plugin

```bash
mkdir -p .opencode/plugin
cat > .opencode/plugin/orchestrator.js <<'EOF'
export { OrchestratorPlugin as default } from "@open-orchestra/opencode-orchestrator";
EOF
```

Or via config:

```json
// opencode.json or ~/.config/opencode/opencode.json
{
  "plugin": ["@open-orchestra/opencode-orchestrator"]
}
```

## Minimal config

```json
// .opencode/orchestrator.json or orchestrator.json
{
  "$schema": "./node_modules/@open-orchestra/opencode-orchestrator/schema/orchestrator.schema.json",
  "autoSpawn": true,
  "workers": ["vision", "docs", "coder"]
}
```

## Skills → workers

Skills live in `.opencode/skill/<id>/SKILL.md` and map directly to worker profiles. `name` must match the folder ID.

```yaml
---
name: coder
description: Implementation specialist
model: anthropic/claude-opus-4-5
tools:
  Read: true
  Write: true
  Bash: true
---

You are a code implementation specialist. Focus on clean, testable changes.
```

## Subagent UX (3 steps)

1) Spawn: the orchestrator creates a worker session.
2) Focus: the UI switches to the subagent view with live updates.
3) Return: on completion, a summary is posted to the parent session.

## Build

```bash
bun run build
bun run package:check
```
