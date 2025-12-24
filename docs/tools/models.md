# Model Tools

## list_models

Description: List models available in the current OpenCode config.

Parameters:
- scope (configured|all, optional)
- providers (string[], optional)
- query (string, optional)
- limit (number, optional)
- format (markdown|json, optional)

Returns: table or JSON.

## Model Resolution Notes

- Profile models accept explicit `provider/model` IDs.
- Auto tags like `auto:vision` resolve at spawn-time.
- Aliases are configured via `modelAliases` in orchestrator config.
