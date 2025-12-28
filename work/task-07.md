# Task 07: Error Messages as Guides

## Goal
Transform error messages from technical dumps to actionable guidance.

## Research Required
- Collect all error paths in codebase
- Categorize by user-fixable vs. bug
- Write human-friendly alternatives

## Pattern Reference (open-queue)
```
- Problem-first README structure
- Known limitations disclosed upfront
- Natural language alternatives provided
```

## Acceptance Criteria
- Errors explain what went wrong
- Errors suggest how to fix
- No stack traces in user-facing output (unless --verbose)

## Lifecycle
1. Research: Grep for throw/error patterns
2. Test: Trigger each error path
3. Implement: Rewrite error messages
4. Build: Verify error handling works
5. Document: Add troubleshooting section
