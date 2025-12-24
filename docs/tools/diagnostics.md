# Diagnostics Tools

Note: `orchestrator_output`, `orchestrator_results`, and `orchestrator_diagnostics` are disabled by default. Enable them via `tools` in your `opencode.json` if needed.

## orchestrator_status

Description: Show effective configuration and profile mapping.

Parameters:
- format (markdown|json, optional)

Returns: config summary.

## orchestrator_output

Description: Show unified output (jobs + logs).

Parameters:
- format (markdown|json, optional)

Returns: output stream.

## orchestrator_results

Description: Show recent worker results.

Parameters:
- limit (number, optional)
- format (markdown|json, optional)

Returns: results list.

## orchestrator_diagnostics

Description: Show diagnostic details (health, runtime info, errors).

Parameters:
- format (markdown|json, optional)

Returns: diagnostics report.

## worker_trace

Description: Show recent messages from a worker session.

Parameters:
- workerId (string, required)
- limit (number, optional)
- format (markdown|json, optional)

Returns: message trace.
