# Troubleshooting Runbook

## Worker will not spawn

1. Check current workers and profiles:
   - `/orchestrator.status`
   - `list_profiles({})`
2. Try spawning manually:
   - `/orchestrator.spawn <profileId>` or `spawn_worker({ profileId: "<id>" })`
3. Verify spawn policy allows it (`spawnPolicy` in `orchestrator.json`).
4. Confirm the profile exists in `.opencode/skill/<id>/SKILL.md` or in `orchestrator.json` overrides.

## Model not found

1. Confirm provider credentials in `opencode.json`.
2. Verify the model string in SKILL.md or `orchestrator.json` profile overrides.
3. If using aliases, check `modelAliases` in `orchestrator.json`.
4. If using `auto:*`, verify provider capability requirements (vision/tools/reasoning).

## Session timeout

1. Check health monitor settings (`healthCheck` in config).
2. Inspect worker logs for prompt timeouts.
3. Increase timeouts:
   - `startupTimeout` for worker boot time.
   - `workflows.roocodeBoomerang.perStepTimeoutMs` (and `security.workflows` caps) for workflows.
   - `OPENCODE_VISION_TIMEOUT_MS` for vision routing.

## Memory not recording

1. Verify `memory.enabled` and `memory.autoRecord` are true.
2. If using Neo4j, confirm connectivity.
3. Use `/memory.query` (without a query) to list recent entries.
