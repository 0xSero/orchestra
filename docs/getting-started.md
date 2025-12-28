# Getting Started

This guide walks through a minimal Open Orchestra setup with version pinning, plugin enablement, and a starter skill.

## 1) Install (pin the version)

OpenCode resolves plugin versions once, so pin the package version explicitly:

```bash
bun add @open-orchestra/opencode-orchestrator@0.2.3
```

## 2) Enable the plugin

Use either a plugin entry file or config-based plugins.

**Plugin entry file (recommended):**

```bash
mkdir -p .opencode/plugin
cat > .opencode/plugin/orchestrator.js <<'EOF'
export { OrchestratorPlugin as default } from "@open-orchestra/opencode-orchestrator";
EOF
```

**Config-based plugins:**

```json
// opencode.json or ~/.config/opencode/opencode.json
{
  "plugin": ["@open-orchestra/opencode-orchestrator"]
}
```

## 3) Add minimal orchestrator config

```json
// .opencode/orchestrator.json or orchestrator.json
{
  "$schema": "./node_modules/@open-orchestra/opencode-orchestrator/schema/orchestrator.schema.json",
  "autoSpawn": true,
  "workers": ["vision", "docs", "coder"]
}
```

## 4) Skills map to workers

Each skill folder becomes a worker profile. The folder name and `name` field must match, and the orchestrator uses that ID in `workers` and `spawnOnDemand` lists.

```bash
mkdir -p .opencode/skill/coder
cat > .opencode/skill/coder/SKILL.md <<'EOF'
---
name: coder
description: Code implementation specialist
model: anthropic/claude-opus-4-5
tools:
  read: true
  write: true
  bash: true
---

You are a code implementation specialist. Focus on clean, testable changes.
EOF
```

Global skills can live in `~/.opencode/skill/<id>/SKILL.md` and are merged with project skills.

## Next steps

- Copy ready-made configs and skills from `examples/`.
- See `docs/configuration.md` for the full schema and advanced settings.
