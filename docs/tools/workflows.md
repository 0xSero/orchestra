# Workflow Tools

## list_workflows

Description: List available orchestrator workflows.

Parameters:
- format (markdown|json, optional)

Returns: table or JSON.

Built-in workflow IDs:
- roocode-boomerang
- bug-triage
- security-audit
- qa-regression
- spec-to-implementation
- data-digest

## run_workflow

Description: Run a named workflow with security limits.

Parameters:
- workflowId (string, required)
- task (string, required)
- autoSpawn (boolean, optional)
- attachments (array, optional)
- format (markdown|json, optional)

Returns: workflow report.
