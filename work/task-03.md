# Task 03: Imperative Command Verbs

## Goal
Replace flag-style commands with imperative verbs for better UX.

## Research Required
- Audit all commands in orchestra
- Map current syntax to imperative alternatives
- Identify user intent behind each command

## Pattern Reference (open-queue)
```
/queue hold       # not: /queue --mode=hold
/queue immediate  # not: /queue --disable
/queue status     # not: /queue --status
```

## Acceptance Criteria
- Commands use verbs: `spawn`, `stop`, `status`, `list`
- No flags for primary actions
- Natural language feel

## Lifecycle
1. Research: Grep for command definitions
2. Test: Document current command UX
3. Implement: Refactor to imperative style
4. Build: Verify no breaking changes
5. Document: Update README
