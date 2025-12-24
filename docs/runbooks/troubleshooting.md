# Troubleshooting Runbook

## Worker will not spawn

1. Check orchestrator output:
   - `orchestrator_output({ format: "markdown" })` (enable in `opencode.json` tools if disabled)
2. Verify model is valid:
   - `list_models({})`
3. Confirm worker profile exists:
   - `list_profiles({})`
4. Inspect running workers:
   - `list_workers({ format: "json" })`
5. Clear stale processes if needed.

## Model not found

1. Confirm provider credentials in `opencode.json`.
2. Run `list_models({})` and verify model id.
3. If using alias, check `modelAliases` in `orchestrator.json`.
4. If using `auto:*`, verify capability requirements (vision/tools/reasoning).

## Session timeout

1. Check health monitor settings (`healthCheck` in config).
2. Inspect worker logs for prompt timeouts.
3. Increase timeout in `ask_worker` or profile settings.

## Memory not recording

1. Verify `memory.enabled` and `memory.autoRecord` are true.
2. If using Neo4j, confirm connectivity.
3. Use `memory_recent` to check stored entries.
