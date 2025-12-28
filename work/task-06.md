# Task 06: State Visibility Commands

## Goal
Add clear status/state inspection commands for debugging.

## Research Required
- What state does orchestra track?
- How do users currently debug issues?
- What information is most useful?

## Pattern Reference (open-queue)
```
/queue status  # enables users to verify current mode
```

## Acceptance Criteria
- `/orchestra status` shows:
  - Active workers
  - Queue state
  - Connection health
- Output is human-readable
- Machine-parseable option available

## Lifecycle
1. Research: Identify all trackable state
2. Test: Mock status output, get feedback
3. Implement: Add status command
4. Build: Test with real workers
5. Document: Add to command reference
