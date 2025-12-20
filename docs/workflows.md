# Workflows

Workflows are **multi-step orchestrations** that delegate to specialized workers and “boomerang” intermediate outputs back into the next step.

This plugin ships with one built-in workflow:

- **`roocode.boomerang.sequential`**: plan → implement → review → finalize

## Running workflows

Inside OpenCode:

```bash
list_workflows({ format: "markdown" })
run_workflow({ workflowId: "roocode.boomerang.sequential", task: "..." })
```

If command shortcuts are enabled (default), you can also run:

```text
orchestrator.workflows
orchestrator.boomerang
```

## Configuration

You can tune safety/performance knobs in `orchestrator.json` under `workflows`.

```json
{
  "workflows": {
    "enabled": true,
    "allow": ["roocode.boomerang.sequential"],
    "roocodeBoomerang": {
      "enabled": true,
      "maxSteps": 4,
      "perStepTimeoutMs": 120000,
      "maxTaskChars": 12000,
      "maxCarryChars": 24000
    }
  }
}
```

### Advanced: overriding steps

You can fully override the step sequence (prompt templates + profile routing):

```json
{
  "workflows": {
    "roocodeBoomerang": {
      "steps": [
        { "id": "plan", "profileId": "architect", "prompt": "Plan: {{task}}" },
        { "id": "implement", "profileId": "coder", "prompt": "Implement: {{task}}\nPlan:\n{{step:plan}}" }
      ]
    }
  }
}
```

## Resource usage (what we can and can’t measure)

`run_workflow` returns:

- **Per-step wall time** (ms)
- **Total wall time** (ms)
- **Request/response character counts** (a provider-agnostic proxy for payload size)

Token counts and dollar-cost are **provider-specific** and are not reliably available through the OpenCode SDK across providers. If your provider exposes token usage in responses, you can extend the workflow runner to record it.

