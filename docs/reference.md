# Tool Reference

This is a compact index of the orchestrator tools and slash commands. Tools are injected by the plugin; commands are exposed in the OpenCode TUI.

## Tools

Worker lifecycle and routing:

- `spawn_worker` - Start a worker for a profile
- `stop_worker` - Stop a running worker
- `list_workers` - List active workers
- `list_profiles` - List available profiles
- `ask_worker` - Send a message to a worker
- `ask_worker_async` - Send a message and return a job id
- `await_worker_job` - Wait for an async job
- `delegate_task` - Auto-route a task to the best worker

Workflows:

- `list_workflows` - List available workflows
- `run_workflow` - Run a workflow by id

## Slash commands

- `/orchestrator.status` - Show workers and profiles
- `/orchestrator.spawn <profileId>` - Spawn a worker
- `/orchestrator.demo` - Run the demo workflow
- `/orchestrator.onboard [--mode council|multimodal|all]` - Run the 5-minute onboarding flow
- `/vision.analyze` - Analyze clipboard or file image (`--path`, `--prompt`, `--base64`, `--mime`, `--timeoutMs`)
- `/memory.record` - Record a memory entry (`key: value` or `<key> <value>`, `--tags`, `--scope`)
- `/memory.query` - Query memory (`<query>` or omit for recent, `--limit`, `--scope`)
