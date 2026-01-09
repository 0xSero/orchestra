# Guide

## Architecture wiring

- OpenCode server: `http://127.0.0.1:4096` (default)
- Skills API: `http://127.0.0.1:4097` (default, if still used)
- Orchestrator events: `http://127.0.0.1:<bridge-port>/v1/events`

Desktop injects a window payload for the control panel:

```
window.__OPENCODE__.baseUrl
window.__OPENCODE__.skillsPort
window.__OPENCODE__.skillsBase
window.__OPENCODE__.orchestratorEventsUrl
```

The web app also supports query params for the same wiring:

```
?url=http://host:4096&skills=http://host:4097&events=http://host:14096
```

## Desktop plugin discovery

The desktop sidecar loads the orchestrator plugin from:

1) `packages/orchestrator/dist/index.js` (primary)
2) `packages/orchestrator/src/index.ts` (dev fallback)

You can override this with:

```
OPENCODE_DESKTOP_PLUGIN_PATH=/absolute/path/to/index.js
```

## Environment variables

Desktop/sidecar:
- `OPENCODE_DESKTOP_BASE_URL` (skip sidecar, connect to remote OpenCode server)
- `OPENCODE_DESKTOP_SKILLS_URL` (override skills API base)
- `OPENCODE_SKILLS_PORT` / `OPENCODE_SKILLS_API_PORT` (sidecar skills port)
- `OPENCODE_ORCH_BRIDGE_PORT` (orchestrator event bridge port)
- `OPENCODE_ORCH_BRIDGE_HOST` (bridge bind host, use `0.0.0.0` for Docker)
- `OPENCODE_CONFIG_CONTENT` (OpenCode config JSON, used internally by desktop)

## Release checklist

- `bun run lint`
- `bun run typecheck`
- `bun run test`
- `bun run build`
- Confirm the desktop bundle launches and the control panel shows a live dashboard.

## Worktrees

- See `docs/worktrees.md` for sandboxed 24/7 operation using git worktrees.
