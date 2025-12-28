# Task 08: Remove Dead Code

## Goal
Delete unused code, reduce bundle size.

## Research Required
- Run coverage analysis
- Find unreachable code paths
- Identify deprecated features still present

## Pattern Reference (open-queue)
```
- Minimal boilerplate: only essential files included
- Graceful degradation over feature bloat
```

## Acceptance Criteria
- No unused exports
- No commented-out code blocks
- No orphaned files
- Bundle size measurably smaller

## Lifecycle
1. Research: Run `bun run build`, check output size
2. Test: Coverage report to find dead code
3. Implement: Delete unused code
4. Build: Compare before/after bundle size
5. Document: Note removals in changelog
