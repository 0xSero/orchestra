# Memory System Deep Dive

This document describes the memory subsystem. The default backend is file-based; Neo4j is optional for graph storage.

## High-Level Flow

```
message -> memory auto-record -> graph
message -> memory injection -> system prompt
```

## Neo4j Schema (Conceptual, optional)

- Node types: Project, Session, Message, Entity, Decision
- Relationships:
  - Project HAS_SESSION Session
  - Session HAS_MESSAGE Message
  - Message MENTIONS Entity
  - Project HAS_DECISION Decision

## Auto-Recording

- Controlled by `memory.autoRecord` and `memory.maxChars`.
- Avoids secrets and sensitive content.
- Supports per-project and global scopes.

## Memory Injection

- Controlled by `memory.autoInject` and `memory.inject.*`.
- Injects summaries and relevant entries into system prompt.
- Configurable max entries and max character limits.

## Query Patterns

- Recent messages by session
- Key decisions by project
- Global knowledge lookup

## Performance Considerations

- Trim policies cap message counts to prevent growth.
- Summaries reduce token usage.
