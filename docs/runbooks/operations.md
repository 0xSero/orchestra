# Operations Runbook

## Scaling workers

- Increase `workers` auto-spawn list in `orchestrator.json`.
- Allow on-demand spawn via `spawnOnDemand` and `spawnPolicy`.
- Use `/orchestrator.spawn` or `spawn_worker` to start workers manually.

## Managing warm pools

- Configure `warmPool.enabled` and per-profile sizes.
- Use idle timeout to reclaim resources.

## Monitoring health

- Health checks run via `healthCheck` settings.
- Dead workers are pruned automatically.

## Cleaning stale workers

- Use `list_workers` or `/orchestrator.status` to inspect entries.
- Stop workers with `stop_worker` if needed.
