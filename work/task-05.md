# Task 05: Slim Down Exports

## Goal
Reduce public API surface to essential exports only.

## Research Required
- Audit `src/index.ts` exports
- Check what consumers actually use
- Identify internal-only code exposed publicly

## Pattern Reference (open-queue)
```
- Modular structure: clear separation of concerns
- Only essential files included in package
```

## Acceptance Criteria
- Export only what users need
- Internal utilities stay internal
- Clean, minimal public API

## Lifecycle
1. Research: Map all exports and their consumers
2. Test: Check if removing exports breaks anything
3. Implement: Remove unnecessary exports
4. Build: Verify package size reduced
5. Document: Update API reference
