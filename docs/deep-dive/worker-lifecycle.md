# Worker Lifecycle Deep Dive

This document describes the worker lifecycle in v0.3.0, including spawn, health checks, and shutdown.

## Lifecycle States

```
starting -> ready -> busy -> ready
    |         |        |
    |         v        v
    +------> error   stopped
```

Notes:
- `starting` is set immediately after a spawn begins.
- `ready` indicates the worker has a live session and is idle.
- `busy` indicates a request is in-flight.
- `error` indicates failed spawn or health check failure.
- `stopped` means the worker was explicitly shut down.

## Spawn Sequence

```
1. resolve profile + model
2. spawn `opencode serve` (worker process)
3. connect to worker server
4. create worker session
5. inject system context + instructions
6. mark worker ready
```

## Health Checks

- The HealthMonitor runs on a configurable interval (default: 30s).
- A lightweight `session.list` call is used with a 3s timeout.
- Failures retry with exponential backoff.
- If all retries fail, the worker is marked dead and removed from the in-memory registry.

## Shutdown Protocol

```
1. signal received (SIGINT/SIGTERM)
2. orchestrator state set to shutting_down
3. send orchestrator_shutdown message to each worker
4. wait up to 5s for acknowledgement
5. SIGTERM worker process
```
