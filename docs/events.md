# Orchestrator Events (v1)

The orchestrator emits a single, versioned event stream that the app and desktop should consume.
This is the source of truth for workers, workflows, memory writes, and errors.

## Transport

- Endpoint: `GET /v1/events` on the orchestrator bridge server.
- Format: Server-Sent Events (SSE).
- Auth: read access does not require a token; write endpoints remain protected.
- Each SSE frame includes `event: <type>` and `data: <json>`.
- Optional: set `OPENCODE_ORCH_BRIDGE_PORT` to pin the bridge server port.
- Optional: set `OPENCODE_ORCH_BRIDGE_HOST=0.0.0.0` when you need the bridge reachable outside the process (e.g. Docker port mapping).

## Read APIs

### `GET /v1/status`

Returns a snapshot of current workers and job summary.

```json
{
  "workers": [
    {
      "id": "vision",
      "name": "Vision",
      "status": "ready",
      "model": "opencode/gpt-5-nano",
      "port": 14097
    }
  ],
  "jobs": {
    "total": 5,
    "running": 1,
    "succeeded": 3,
    "failed": 0,
    "canceled": 1,
    "oldestRunningMs": 12000
  }
}
```

### `GET /v1/output`

Returns recent jobs and log buffer. Supports optional query params:
- `limit` (default: 50): Maximum number of jobs/logs to return
- `after` (unix ms): Only return items after this timestamp

```json
{
  "jobs": [
    {
      "id": "job-123",
      "workerId": "coder",
      "message": "Implement feature X",
      "status": "succeeded",
      "startedAt": 1730000000000,
      "finishedAt": 1730000005000,
      "durationMs": 5000,
      "responseText": "Feature implemented..."
    }
  ],
  "logs": [
    {
      "at": 1730000000000,
      "level": "info",
      "message": "Worker started"
    }
  ]
}
```

## Event Envelope

All events share a common envelope.

```json
{
  "version": 1,
  "id": "evt_...",
  "type": "orchestra.worker.status",
  "timestamp": 1730000000000,
  "data": {}
}
```

## Event Types

### `orchestra.worker.status`

Worker lifecycle and status changes.

```json
{
  "version": 1,
  "id": "evt_...",
  "type": "orchestra.worker.status",
  "timestamp": 1730000000000,
  "data": {
    "status": "ready",
    "previousStatus": "starting",
    "reason": "spawn",
    "worker": {
      "id": "vision",
      "name": "Vision",
      "status": "ready",
      "backend": "server",
      "model": "opencode/gpt-5-nano",
      "purpose": "Visual analysis",
      "whenToUse": "Use for images",
      "port": 14097,
      "sessionId": "...",
      "supportsVision": true,
      "supportsWeb": false,
      "lastActivity": "2025-02-10T18:00:00.000Z"
    }
  }
}
```

### `orchestra.worker.stream`

Streaming chunk from a worker.

```json
{
  "version": 1,
  "id": "evt_...",
  "type": "orchestra.worker.stream",
  "timestamp": 1730000000000,
  "data": {
    "chunk": {
      "workerId": "vision",
      "jobId": "job-123",
      "chunk": "partial output",
      "timestamp": 1730000000000,
      "final": false
    }
  }
}
```

### `orchestra.workflow.started`

Workflow run started.

```json
{
  "version": 1,
  "id": "evt_...",
  "type": "orchestra.workflow.started",
  "timestamp": 1730000000000,
  "data": {
    "runId": "run-...",
    "workflowId": "vision",
    "workflowName": "Vision",
    "task": "Analyze the attached image",
    "startedAt": 1730000000000
  }
}
```

### `orchestra.workflow.step`

Workflow step completed.

```json
{
  "version": 1,
  "id": "evt_...",
  "type": "orchestra.workflow.step",
  "timestamp": 1730000000000,
  "data": {
    "runId": "run-...",
    "workflowId": "vision",
    "workflowName": "Vision",
    "stepId": "analyze",
    "stepTitle": "Analyze image",
    "workerId": "vision",
    "status": "success",
    "startedAt": 1730000000000,
    "finishedAt": 1730000005000,
    "durationMs": 5000,
    "response": "short preview",
    "responseTruncated": false
  }
}
```

### `orchestra.workflow.carry.trimmed`

Workflow carry was trimmed to respect `maxCarryChars`.

```json
{
  "version": 1,
  "id": "evt_...",
  "type": "orchestra.workflow.carry.trimmed",
  "timestamp": 1730000000000,
  "data": {
    "runId": "run-...",
    "workflowId": "roocode-boomerang",
    "workflowName": "RooCode Boomerang",
    "stepId": "implement",
    "stepTitle": "Implement",
    "maxCarryChars": 24000,
    "droppedBlocks": 1,
    "truncatedSections": ["Artifacts", "Risks"]
  }
}
```

### `orchestra.workflow.completed`

Workflow run completed.

```json
{
  "version": 1,
  "id": "evt_...",
  "type": "orchestra.workflow.completed",
  "timestamp": 1730000000000,
  "data": {
    "runId": "run-...",
    "workflowId": "vision",
    "workflowName": "Vision",
    "status": "success",
    "startedAt": 1730000000000,
    "finishedAt": 1730000008000,
    "durationMs": 8000,
    "steps": {
      "total": 2,
      "success": 2,
      "error": 0
    }
  }
}
```

### `orchestra.memory.written`

Memory write or link created.

```json
{
  "version": 1,
  "id": "evt_...",
  "type": "orchestra.memory.written",
  "timestamp": 1730000000000,
  "data": {
    "action": "put",
    "scope": "project",
    "projectId": "...",
    "taskId": "...",
    "key": "decision:use-neo4j",
    "tags": ["decision", "memory"]
  }
}
```

### `orchestra.skill.load.started`

Skill load attempt started (tool `skill`).

```json
{
  "version": 1,
  "id": "evt_...",
  "type": "orchestra.skill.load.started",
  "timestamp": 1730000000000,
  "data": {
    "sessionId": "...",
    "callId": "...",
    "skillName": "docs-research",
    "worker": { "id": "docs", "kind": "subagent" },
    "workflow": { "runId": "run-...", "stepId": "step-..." },
    "source": "in-process",
    "timestamp": 1730000000000
  }
}
```

### `orchestra.skill.load.completed`

Skill load completed successfully.

```json
{
  "version": 1,
  "id": "evt_...",
  "type": "orchestra.skill.load.completed",
  "timestamp": 1730000000000,
  "data": {
    "sessionId": "...",
    "callId": "...",
    "skillName": "docs-research",
    "worker": { "id": "docs", "kind": "subagent" },
    "workflow": { "runId": "run-...", "stepId": "step-..." },
    "source": "in-process",
    "timestamp": 1730000000000,
    "durationMs": 1200,
    "outputBytes": 512
  }
}
```

### `orchestra.skill.load.failed`

Skill load failed (best-effort detection).

```json
{
  "version": 1,
  "id": "evt_...",
  "type": "orchestra.skill.load.failed",
  "timestamp": 1730000000000,
  "data": {
    "sessionId": "...",
    "callId": "...",
    "skillName": "docs-research",
    "worker": { "id": "docs", "kind": "subagent" },
    "workflow": { "runId": "run-...", "stepId": "step-..." },
    "source": "in-process",
    "timestamp": 1730000000000,
    "durationMs": 1200,
    "outputBytes": 128
  }
}
```

### `orchestra.skill.permission`

Permission resolution for a skill tool call.

```json
{
  "version": 1,
  "id": "evt_...",
  "type": "orchestra.skill.permission",
  "timestamp": 1730000000000,
  "data": {
    "sessionId": "...",
    "permissionId": "...",
    "callId": "...",
    "status": "deny",
    "pattern": "docs-*",
    "skillName": "docs-research",
    "worker": { "id": "docs", "kind": "subagent" },
    "source": "in-process",
    "timestamp": 1730000000000
  }
}
```

### `orchestra.job.created`

Job created and started.

```json
{
  "version": 1,
  "id": "evt_...",
  "type": "orchestra.job.created",
  "timestamp": 1730000000000,
  "data": {
    "jobId": "job-123",
    "workerId": "coder",
    "message": "Implement feature X",
    "sessionId": "session-...",
    "requestedBy": "orchestrator",
    "startedAt": 1730000000000
  }
}
```

### `orchestra.job.progress`

Job progress update.

```json
{
  "version": 1,
  "id": "evt_...",
  "type": "orchestra.job.progress",
  "timestamp": 1730000000000,
  "data": {
    "jobId": "job-123",
    "workerId": "coder",
    "message": "Step 2 of 4",
    "percent": 50,
    "updatedAt": 1730000000000
  }
}
```

### `orchestra.job.completed`

Job completed successfully.

```json
{
  "version": 1,
  "id": "evt_...",
  "type": "orchestra.job.completed",
  "timestamp": 1730000000000,
  "data": {
    "jobId": "job-123",
    "workerId": "coder",
    "message": "Implement feature X",
    "startedAt": 1730000000000,
    "finishedAt": 1730000005000,
    "durationMs": 5000,
    "responsePreview": "Feature X implemented...",
    "responseLength": 1024
  }
}
```

### `orchestra.job.failed`

Job failed with error.

```json
{
  "version": 1,
  "id": "evt_...",
  "type": "orchestra.job.failed",
  "timestamp": 1730000000000,
  "data": {
    "jobId": "job-123",
    "workerId": "coder",
    "message": "Implement feature X",
    "error": "Worker timeout",
    "startedAt": 1730000000000,
    "finishedAt": 1730000010000,
    "durationMs": 10000
  }
}
```

### `orchestra.job.canceled`

Job canceled.

```json
{
  "version": 1,
  "id": "evt_...",
  "type": "orchestra.job.canceled",
  "timestamp": 1730000000000,
  "data": {
    "jobId": "job-123",
    "workerId": "coder",
    "message": "Implement feature X",
    "reason": "User requested cancellation",
    "startedAt": 1730000000000,
    "finishedAt": 1730000003000,
    "durationMs": 3000
  }
}
```

### `orchestra.error`

Error event with context.

```json
{
  "version": 1,
  "id": "evt_...",
  "type": "orchestra.error",
  "timestamp": 1730000000000,
  "data": {
    "message": "Worker failed to spawn",
    "source": "worker",
    "workerId": "vision"
  }
}
```

## Versioning

- `version` increments only on breaking changes.
- Consumers must ignore unknown fields and unknown event types.
