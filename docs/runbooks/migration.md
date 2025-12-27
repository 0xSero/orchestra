# Migration Runbook (v0.2.x -> v0.3.0)

## Breaking Changes

- Model resolution uses a stricter validation pipeline.
- New `healthCheck` and `warmPool` settings supersede older behavior.
- Profile inheritance (`extends`, `compose`) is now supported.

## Configuration Changes

- Add `healthCheck` block for heartbeat settings.
- Add `warmPool` block for pre-spawned workers.
- Add `modelSelection` and `modelAliases` for model resolution.
- Optional `permissions` per profile for granular tool access.

## Migration Steps

1. Update `orchestrator.json` with new fields (see configuration reference).
2. Replace `node:*` usages with `auto:*` if desired (both are supported).
3. Confirm profiles using vision have compatible models.
4. Use `profiles` overrides in `orchestrator.json` if you want pinned models.

## Deprecations

- `healthCheckInterval` remains supported but is superseded by `healthCheck.intervalMs`.
