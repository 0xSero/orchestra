# Orchestra Source

This directory contains the OpenCode orchestrator plugin runtime.

## Structure

- `api/` - API wrappers and skills/session routers.
- `commands/` - slash command handlers and demos.
- `communication/` - event bus and SSE streaming.
- `config/` - config parsing and defaults.
- `core/` - service container and lifecycle orchestration.
- `db/` - SQLite persistence for prefs and overrides.
- `memory/` - memory backends (file/neo4j) and graph helpers.
- `orchestrator/` - routing and delegation engine.
- `profiles/` - profile discovery and composition.
- `skills/` - SKILL.md loading and CRUD.
- `tools/` - OpenCode tool definitions.
- `ux/` - UX helpers (vision routing, repo context).
- `workers/` - worker spawn/send/session management.
- `workflows/` - built-in workflow engine.
