# Task 04: Reduce Configuration Surface

## Goal
Minimize required configuration, maximize sensible defaults.

## Research Required
- Audit `orchestrator.schema.json`
- Identify which fields are truly required vs. nice-to-have
- Find opportunities for inference

## Pattern Reference (open-queue)
```
- Environment variable: OPENCODE_MESSAGE_QUEUE_MODE=hold
- Default state is "off" (immediate mode)—opt-in safety
```

## Acceptance Criteria
- Config file optional for basic usage
- Environment variables for runtime overrides
- Smart defaults that "just work"

## Lifecycle
1. Research: Read schema, find all config touchpoints
2. Test: Try running with minimal/no config
3. Implement: Add defaults, make fields optional
4. Build: Ensure backwards compatibility
5. Document: Update config docs
