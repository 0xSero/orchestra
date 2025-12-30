# Orchestrator Events (v1)

The orchestrator emits a single, versioned event stream that the app and desktop should consume.
This is the source of truth for workers, workflows, memory writes, and errors.

## Transport

- Endpoint: `GET /v1/events` on the orchestrator bridge server.
- Format: Server-Sent Events (SSE).
- Auth: read access does not require a token; write endpoints remain protected.
- Each SSE frame includes `event: <type>` and `data: <json>`.
- Optional: set `OPENCODE_ORCH_BRIDGE_PORT` to pin the bridge server port.

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
