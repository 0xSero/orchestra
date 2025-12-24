# Operations Runbook

## Scaling workers

- Increase `workers` auto-spawn list in `orchestrator.json`.
- Use `ensure_workers` to spawn on demand.

## Managing warm pools

- Configure `warmPool.enabled` and per-profile sizes.
- Use idle timeout to reclaim resources.

## Monitoring health

- Health checks run via `healthCheck` settings.
- Dead workers are pruned automatically.

## Cleaning stale workers

- Use `list_workers` or `orchestrator_diagnostics` (enable in `opencode.json` tools if disabled) to inspect entries.
- Stop workers with `stop_worker` if needed.
