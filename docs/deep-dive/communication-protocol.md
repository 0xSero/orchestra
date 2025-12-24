# Communication Protocol Deep Dive

This document covers worker communication, stream chunking, and orchestrator bridge behavior.

## Message Format

Workers receive prompts via `session.prompt` with structured parts. The orchestrator wraps user tasks with metadata:

```
<message-source from="orchestrator" jobId="none">
This message was sent by the orchestrator.
</message-source>

<orchestrator-sync>
IMPORTANT: Reply with your final answer as plain text.
</orchestrator-sync>
```

## Stream Chunk Protocol

Workers can stream partial output using the `stream_chunk` tool:

```
stream_chunk({ chunk: "Working...", jobId: "abc123" })
stream_chunk({ chunk: "Done.", jobId: "abc123", final: true })
```

The orchestrator bridge server accepts:
- `POST /v1/stream/chunk` for chunk ingestion
- `GET /v1/stream` for event stream consumption

## Worker-to-Worker Communication

- Worker messages can include a `from` field (source worker id).
- The orchestrator tags the message with `<message-source ...>` metadata.

## Bridge Server Architecture

```
worker -> stream_chunk -> bridge server -> orchestrator stream
```

The bridge server provides:
- authentication via token
- SSE stream aggregation
- event timestamps

## Error Handling

- Missing bridge tools result in a warning and fallback to plain-text output.
- Worker prompt timeouts return an error and reset worker status to ready.
- Health monitor marks unresponsive workers as dead.
