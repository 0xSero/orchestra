# Task 09: Consolidate File Structure

## Goal
Reorganize files for clearer mental model.

## Research Required
- Map current file structure
- Identify unclear or deeply nested paths
- Find files that should be colocated

## Pattern Reference (open-queue)
```
.opencode/  (config)
src/        (logic)
command/    (CLI interface)
bin/        (executables)
```

## Acceptance Criteria
- Max 2 levels deep for common paths
- Related files colocated
- Clear naming: what it is, not what it does

## Lifecycle
1. Research: Draw current file tree
2. Test: Propose new structure, get feedback
3. Implement: Move files, update imports
4. Build: Ensure nothing breaks
5. Document: Update contributing guide
