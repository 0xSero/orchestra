# OpenBoard

OpenBoard is a dashboard application for monitoring and managing the OpenCode orchestration system.

## Status

This is currently a **scaffold/placeholder** setup. The actual OpenBoard source code should be transplanted here when available.

## Development

```bash
# Install dependencies (from repo root)
bun install

# Run dev server
cd apps/openboard && bun run dev

# Run tests
bun run test:openboard

# Type check
bun run typecheck:openboard

# Build
bun run build:openboard
```

## Integration

OpenBoard is designed to consume the same orchestrator bridge client APIs as the main control-panel application. Once fully implemented, it will provide:

- Real-time orchestrator event visualization
- Task management and monitoring
- Workflow status tracking
- Worker pool management

## Next Steps

1. Import actual OpenBoard source code
2. Configure API connections to orchestrator bridge
3. Wire up orchestrator bridge client using DI
4. Add comprehensive integration tests
