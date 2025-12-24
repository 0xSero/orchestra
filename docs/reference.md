# Tool Reference

This is a compact index of the orchestrator tools. Core tools are injected by default; the rest are available for power users and UI flows.

## Core tools (default)

Worker lifecycle and routing:

- `spawn_worker` - Start a worker for a profile
- `stop_worker` - Stop a running worker
- `list_workers` - List active workers
- `list_profiles` - List available profiles
- `list_models` - List configured models from OpenCode
- `ask_worker` - Send a message to a worker
- `ask_worker_async` - Send a message and return a job id
- `await_worker_job` - Wait for an async job
- `get_worker_job` - Inspect a single job
- `list_worker_jobs` - List recent jobs
- `delegate_task` - Auto-route a task to the best worker

Orchestrator visibility:

- `orchestrator_status` - Show config and worker mappings
- `orchestrator_output` - Jobs + log tail for recent activity
- `orchestrator_results` - Inspect last worker outputs
- `orchestrator_diagnostics` - Process and memory diagnostics
- `list_workflows` - List registered workflows
- `run_workflow` - Run a workflow by id

Note: `orchestrator_output`, `orchestrator_results`, and `orchestrator_diagnostics` are disabled by default. Enable them via `tools` in your `opencode.json` if needed.

## UX tools

- `orchestrator_start` - Start docs worker, seed local docs, and enable passthrough
- `orchestrator_demo` - Quickstart walkthrough
- `orchestrator_dashboard` - Compact worker dashboard
- `orchestrator_help` - Usage guide
- `orchestrator_todo` - View orchestrator todo list
- `enable_docs_passthrough` - Send user messages to docs worker
- `worker_trace` - Trace recent worker activity
- `orchestrator_keybinds_macos` - Fix macOS keybind defaults
- `orchestrator.workflows` - Command shortcut for listing workflows
- `orchestrator.boomerang` - Command shortcut for the RooCode boomerang workflow

## Config tools

- `set_profile_model` - Persist a model override for a profile
- `reset_profile_models` - Clear saved profile overrides
- `set_autospawn` - Set auto-spawn list and toggle
- `set_orchestrator_agent` - Configure the injected orchestrator agent
- `autofill_profile_models` - Save last-used models into profiles

## Memory tools

- `memory_put` - Store a memory entry
- `memory_link` - Create a relationship between entries
- `memory_search` - Query memory
- `memory_recent` - List recent memory entries
