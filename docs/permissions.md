# Permissions and tools

The orchestrator aligns with OpenCode permissions and tools. All access control is expressed through OpenCode primitives so it is explicit and inspectable.

## Global permissions (OpenCode)

Configure defaults in `opencode.json`:

```json
{
  "permission": {
    "edit": "allow",
    "bash": "ask",
    "skill": "ask",
    "webfetch": "deny",
    "doom_loop": "ask",
    "external_directory": "ask"
  }
}
```

## Per-agent overrides (OpenCode)

Agents can override permissions and tool enablement in frontmatter:

```yaml
---
tools:
  skill: false
permission:
  skill:
    "internal-*": "deny"
    "*": "allow"
---
```

## Orchestrator agent defaults

The plugin injects an orchestrator agent with explicit tool booleans:

- `bash`: false
- `edit`: false
- `skill`: false
- `webfetch`: false

This keeps the orchestrator focused on delegation rather than direct execution. Override with `agent.tools` or `agent.permission` in `orchestrator.json` if needed.

## Worker tool policies

Worker profiles can restrict tools via the `tools` map in their profile definition. Built-in defaults:

- `docs`: `write=false`, `edit=false`
- `architect`: `write=false`, `edit=false`, `bash=false`
- `explorer`: `write=false`, `edit=false`
- `vision`, `coder`, `memory`: no tool restrictions by default

Update worker tool policies in `orchestrator.json` or by editing the built-in profile definitions.
