# Troubleshooting

## Desktop fails to start the sidecar

Symptoms:
- "Startup Failed" dialog
- Empty dashboard or Offline status

Fixes:
- Ensure `../opencode` exists and `apps/desktop/scripts/predev.ts` can build it.
- Or set `OPENCODE_DESKTOP_BASE_URL` to a running OpenCode server.
- If the server is running elsewhere, verify the port is reachable.

## Orchestrator plugin not found

Symptoms:
- OpenCode server starts but no orchestrator events appear.

Fixes:
- Build the plugin: `bun run --cwd packages/orchestrator build`
- Verify `packages/orchestrator/dist/index.js` exists.
- Use `OPENCODE_DESKTOP_PLUGIN_PATH=/absolute/path/to/index.js` to override.

## Control panel shows Offline

Symptoms:
- Connection status reads "Offline"
- No sessions or workers appear

Fixes:
- Confirm OpenCode is running at `http://127.0.0.1:4096`
- For remote, open the app with `?url=http://host:4096`
- In desktop, set `OPENCODE_DESKTOP_BASE_URL`

## Memory or workflow events missing

Symptoms:
- Workers show up but memory/workflow cards stay empty

Fixes:
- Ensure the orchestrator event stream is configured.
- Provide `?events=http://host:14096` or set `OPENCODE_ORCH_BRIDGE_PORT`.
- In Docker, also set `OPENCODE_ORCH_BRIDGE_HOST=0.0.0.0` and publish the bridge port.
- Verify the events endpoint responds at `/v1/events`.

## Skills API unavailable

Symptoms:
- Agent profiles fail to load

Fixes:
- Confirm the skills API is running at `http://127.0.0.1:4097`.
- In the browser, pass `?skills=http://host:4097`.
- In desktop, set `OPENCODE_DESKTOP_SKILLS_URL`.

## Ports already in use

Symptoms:
- Sidecar fails to bind or OpenCode cannot start

Fixes:
- Stop the process holding the port.
- Use `OPENCODE_PORT`, `OPENCODE_SKILLS_PORT`, or `OPENCODE_ORCH_BRIDGE_PORT` to move ports.
