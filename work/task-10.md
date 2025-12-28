# Task 10: One-Command Install Experience

## Goal
Match open-queue's `bun x` install UX.

## Research Required
- Current install flow pain points
- What setup can be automated?
- How does open-queue achieve zero-config?

## Pattern Reference (open-queue)
```
bun x @0xsero/open-queue  # or: npx @0xsero/open-queue
# Zero-config installation: Single command auto-registers
```

## Acceptance Criteria
- `bun x open-orchestra` works
- Auto-adds to opencode.json
- Prints success message with next steps
- No manual file editing required

## Lifecycle
1. Research: Study `scripts/install.mjs`, open-queue's approach
2. Test: Try install on fresh project
3. Implement: Enhance install script
4. Build: Test in CI
5. Document: Update README install section
