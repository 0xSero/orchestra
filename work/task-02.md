# Task 02: Simplify Plugin Registration

## Goal
Reduce plugin registration boilerplate following open-queue's zero-config pattern.

## Research Required
- Analyze current plugin registration in `src/index.ts`
- Compare to open-queue's auto-registration approach
- Identify what can be inferred vs. required

## Pattern Reference (open-queue)
```
bun x @0xsero/open-queue  # single command auto-registers
```

## Acceptance Criteria
- Plugin can be installed with single command
- No manual `opencode.json` editing required
- Defaults work out of the box

## Lifecycle
1. Research: Read `src/index.ts`, `scripts/install.mjs`
2. Test: Verify current registration flow
3. Implement: Simplify registration
4. Build: `bun run build`
5. Lint: Check for unused code
