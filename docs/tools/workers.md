# Worker Tools

## spawn_worker

Description: Spawn a new worker (or reuse an existing one) by profile id.

Parameters:
- profileId (string, required)
- model (string, optional) - override model id
- customId (string, optional)
- showToast (boolean, optional)

Returns: status message string.

Example:
```
spawn_worker({ profileId: "coder" })
```

Errors:
- Unknown profile
- Invalid model id
- Spawn failure

## ask_worker

Description: Send a synchronous message to a worker.

Parameters:
- workerId (string, required)
- message (string, required)
- attachments (array, optional)
- timeoutMs (number, optional)
- from (string, optional)

Returns: worker response text.

## ask_worker_async

Description: Start a worker task asynchronously. Returns a jobId.

Parameters:
- workerId (string, required)
- message (string, required)
- attachments (array, optional)
- timeoutMs (number, optional)
- from (string, optional)

Returns: JSON string with job metadata.

## await_worker_job

Description: Wait for an async worker job to finish.

Parameters:
- jobId (string, required)
- timeoutMs (number, optional)

Returns: JSON string with final job record.

## get_worker_job

Description: Fetch current status of a worker job.

Parameters:
- jobId (string, required)
- format (markdown|json, optional)

Returns: job status.

## list_workers

Description: List workers registered in the pool.

Parameters:
- workerId (string, optional)
- format (markdown|json, optional)

Returns: table or JSON.

## list_worker_jobs

Description: List recent jobs per worker.

Parameters:
- workerId (string, optional)
- limit (number, optional)
- format (markdown|json, optional)

Returns: table or JSON.

## ensure_workers

Description: Ensure a list of workers are running (spawn missing ones).

Parameters:
- profileIds (string[], required)

Returns: summary string.

## stop_worker

Description: Stop a running worker and unregister it.

Parameters:
- workerId (string, required)

Returns: status message string.

## delegate_task

Description: Route a task to a suitable worker and return the response.

Parameters:
- task (string, required)
- requiresVision (boolean, optional)
- autoSpawn (boolean, optional)
- workerId (string, optional)
- attachments (array, optional)

Returns: delegated response.

## find_worker

Description: Recommend a worker for a task.

Parameters:
- task (string, required)
- requiresVision (boolean, optional)

Returns: JSON recommendation.

## suggest_worker

Description: Suggest suitable profiles for a task description.

Parameters:
- purpose (string, required)
- limit (number, optional)
- format (markdown|json, optional)

Returns: ranked list.

## worker_trace

Description: Read recent session messages from a worker.

Parameters:
- workerId (string, required)
- limit (number, optional)
- format (markdown|json, optional)

Returns: trace output.

## enable_worker_agent

Description: Temporarily expose a worker profile as an OpenCode agent (writes `.opencode/agent/<agentId>.md`).

Parameters:
- workerId (string, required)
- agentId (string, optional, default: worker-<id>)
- mode (primary|subagent|all, optional)
- ttlMs (number, optional)
- force (boolean, optional)

Returns: status message.

## disable_worker_agent

Description: Disable a temporary worker agent (removes the generated agent file).

Note: OpenCode may cache agents for the current instance; removing a temp agent can require an OpenCode restart to fully unload it.

Parameters:
- agentId (string, optional)
- workerId (string, optional)

Returns: status message.

## list_worker_agents

Description: List temporary worker agents registered by the orchestrator.

Parameters:
- format (markdown|json, optional)

Returns: table or JSON.
