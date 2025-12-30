# Quickstart

## Quickstart (dev)

Prereqs: Bun, Rust toolchain (for desktop), and OpenCode sidecar binary if you want the desktop to spawn it.

1) Install deps:

```bash
bun install
```

2) Start plugin watch + control panel dev server:

```bash
bun run dev
```

3) Start the desktop app as well (optional):

```bash
bun run dev:desktop
```

4) Plugin-only loop (headless):

```bash
bun run dev:min
```

Notes:
- The desktop sidecar expects `../opencode` to exist for local builds, otherwise set `OPENCODE_DESKTOP_BASE_URL`.
- The control panel can connect to a remote server via query params:
  `http://localhost:5173/?url=http://localhost:4096&events=http://localhost:14096`.

## Quickstart (user)

1) Download the desktop app build (or build it locally):

```bash
bun run build
```

2) Launch the desktop app from the bundle output:

- macOS: `apps/desktop/src-tauri/target/bundles`
- Windows/Linux: the Tauri bundle output in the same folder

3) If you want to connect to a remote OpenCode server, set env vars before launching:

```bash
OPENCODE_DESKTOP_BASE_URL=http://your-host:4096 \
OPENCODE_DESKTOP_SKILLS_URL=http://your-host:4097 \
OPENCODE_ORCH_BRIDGE_PORT=14096 \
open apps/desktop/src-tauri/target/bundles/...
```

## Remote connection (app)

Open the control panel in a browser and provide base URLs:

```
http://localhost:5173/?url=http://remote-host:4096&skills=http://remote-host:4097&events=http://remote-host:14096
```

If you only have OpenCode running, omit `skills` and `events` and the UI will still load chat + sessions.
