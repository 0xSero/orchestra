# Production Readiness

## Supported platforms

- macOS (Intel + Apple Silicon)
- Windows (x64)
- Linux (x64, arm64)

## Required environment

- Bun (>= 1.0)
- OpenCode CLI available as `opencode`
- Rust toolchain (desktop builds only)
- Optional: Neo4j if memory graph is enabled

## LOC budgets (directional)

These are directional targets to keep the codebase shrinking over time:

| Package/app | Budget (LOC) | Notes |
| --- | ---: | --- |
| `packages/orchestrator` | 4,000 | plugin runtime + tools |
| `apps/control-panel` | 3,000 | UI + context |
| `apps/desktop` | 1,500 | shell + Tauri wiring |

The CI LOC report is informational until the budgets are enforced.

## Troubleshooting matrix

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Desktop shows Offline | OpenCode not reachable | Set `OPENCODE_DESKTOP_BASE_URL` or start sidecar |
| No workers/workflows | Orchestrator plugin not loaded | Build plugin and verify plugin path |
| Memory panel empty | Events stream missing | Provide `?events=...` or set `OPENCODE_ORCH_BRIDGE_PORT` |
| Agent list empty | Skills API down | Provide `?skills=...` or set `OPENCODE_DESKTOP_SKILLS_URL` |

## Release steps

1) `bun run lint`
2) `bun run typecheck`
3) `bun run test`
4) `bun run build`
5) Launch the desktop bundle and verify:
   - Dashboard shows workers/workflows/memory
   - Chat can send a message
   - Errors surface in the UI

## Notes

- Runtime state lives under `.opencode/`; do not commit DBs or attachments.
- The desktop bundle loads the control panel build from `apps/control-panel/dist`.
