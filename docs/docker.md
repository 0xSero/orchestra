# Docker (Infinite Orchestra)

This repo can run OpenCode + the orchestrator plugin inside a resource-limited Docker stack.

## Run

```bash
# one-time (local config; gitignored)
cp docker/orchestra/orchestrator.local.json .opencode/orchestrator.local.json

docker compose --compatibility -f docker-compose.orchestra.yaml up --build -d
```

This starts:
- OpenCode + orchestrator: `http://localhost:4096` (override with `ORCHESTRA_OPENCODE_PORT`)
- Control panel (live dashboards): `http://localhost:5173` (override with `ORCHESTRA_CONTROL_PANEL_PORT`)
- Orchestrator events SSE: `http://localhost:14096/v1/events` (override with `ORCHESTRA_BRIDGE_PORT`)

The services mount:
- the repo to `/workspace`
- persistent state to `/data` (named volume `orchestra-data`)
- infinite orchestra queue to `/workspace/.opencode/orchestra` (named volume `orchestra-opencode-orchestra`)
- `.opencode/orchestrator.local.json` (template: `docker/orchestra/orchestrator.local.json`)

If `4096` or `5173` are already in use on your machine:

```bash
ORCHESTRA_OPENCODE_PORT=4097 ORCHESTRA_CONTROL_PANEL_PORT=5174 ORCHESTRA_BRIDGE_PORT=14096 \
  docker compose --compatibility -f docker-compose.orchestra.yaml up --build -d
```

## Configure Infinite Orchestra

Edit `.opencode/orchestrator.local.json` to adjust:
- `workflows.triggers.infiniteOrchestra.*` (enable/idle/cooldown)
- `workflows.infiniteOrchestra.queueDir` and `archiveDir` (defaults to `.opencode/orchestra/*`)

Restart the container after changes.

## Credentials

Pass provider credentials via env vars (example):

```bash
export OPENAI_API_KEY=...
export ANTHROPIC_API_KEY=...
export OPENROUTER_API_KEY=...
export ZHIPU_API_KEY=...
export MINIMAX_API_KEY=...
```
For OpenCode’s native providers (e.g. `zhipuai-coding-plan/*`, `minimax/*`), Docker won’t automatically inherit credentials you configured on the host (keychain/auth store); pass the env vars into Compose.

You can also log in inside the container (persisted in `/data`): `docker exec -it orchestra_1 opencode auth login`

If you already have host credentials saved in `~/.local/share/opencode/auth.json`, you can mount them read-only into the container:

```bash
export OPENCODE_HOST_AUTH_JSON="$HOME/.local/share/opencode/auth.json"
docker compose --compatibility \
  -f docker-compose.orchestra.yaml \
  -f docker-compose.orchestra.host-auth.yaml \
  up --build -d
```
