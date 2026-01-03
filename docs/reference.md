# Tool Reference

This is a compact index of the orchestrator tools. The default orchestrator allowlist is the Task API only; see `tools.md` for the complete inventory and trim rationale.

## Default orchestrator tool budget (5)

These are the only tools enabled for the orchestrator agent by default:

- `task_start` - Start a worker/workflow task (async; returns `taskId`)
- `task_await` - Wait for a task to finish (returns final job record)
- `task_peek` - Inspect task status without waiting
- `task_list` - List recent tasks
- `task_cancel` - Cancel a running task (best-effort)

## Registered tool surface (5 total)

These are the only tool IDs registered by the orchestrator plugin:

- `task_start` - Start a worker/workflow/op task (async; returns `taskId`)
- `task_await` - Wait for a task to finish (returns final job record)
- `task_peek` - Inspect task status without waiting
- `task_list` - List recent tasks (plus other views)
- `task_cancel` - Cancel a running task (best-effort)

## Task primitives

Everything else is routed through the Task API:

- `task_start` kinds: `worker`, `workflow`, `op` (plus `auto`)
- `task_start` ops: `memory.put`, `memory.link`, `memory.done` (memory workflow writes)
- `task_list` views: `tasks` (default), `workers`, `profiles`, `models`, `workflows`, `status`, `output`

Legacy tool IDs have been removed from registration; see `tools.md` for the historical list and replacements.

## Boomerang workflows

Configure the planner and implementer models using provider/model IDs:

```json
{
  "workflows": {
    "boomerang": {
      "plannerModel": "opencode/gpt-5-nano",
      "implementerModel": "opencode/gpt-5-nano"
    }
  }
}
```

Run the planner pass to generate `scope.md`, `rules.md`, and the full `tasks/` queue:

```ts
task_start({
  kind: "workflow",
  workflowId: "boomerang-plan",
  task: "Target directory: packages/orchestrator\nGoal: generate a full boomerang task queue.",
  autoSpawn: true,
});

task_await({ taskId: "<returned taskId>" });
```

Drain the queue to execute tasks in FIFO order:

```ts
task_start({
  kind: "workflow",
  workflowId: "boomerang-run",
  task: "Execute tasks/ in order until the queue is drained.",
  autoSpawn: true,
});

task_await({ taskId: "<returned taskId>" });
```

Boomerang E2E tests write run bundles under `packages/orchestrator/test-runs/run-*/` with `meta.json`, `events.jsonl`, `orchestrator.log.jsonl`, `workers/*/messages.json`, and `summary.json`.

If a model or provider is missing, use `task_list({ view: "models" })` to list valid provider/model IDs and update the workflow config accordingly.

## Runtime guardrails (orchestrator self-correction)

The orchestrator injects small runtime nudges to keep async flows on the Task API path:

- Pending task reminders: when tasks are still running for the session, a system reminder includes the exact `task_await` call to use.
- Legacy tool correction: when legacy tools or denied tool calls are detected, a session notice reminds the Task API path (`task_start` → `task_await`).
- Carry trim warnings: if workflow carry is trimmed by `security.workflows.maxCarryChars`, a warning is recorded in the log buffer and emitted as `orchestra.workflow.carry.trimmed`.

Use `task_list({ view: "output" })` to see the log buffer, or subscribe to the events stream (`docs/events.md`).

## UX shortcuts

The built-in command shortcuts (e.g., `orchestrator.status`, `orchestrator.output`) are now implemented via `task_list(...)` and do not require additional tool IDs.
