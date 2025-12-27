# Scopes Workflow Rules

## Overview

This directory contains sequential scopes of work for the opencode-boomerang project. Each scope must be completed fully before moving to the next.

## Execution Rules

### 1. Sequential Completion
- Scopes **MUST** be executed in order: `01-cleanup` → `02-testing` → `03-integration` → `04-production`
- A scope is only complete when ALL tasks within it pass
- No skipping ahead - each scope builds on the previous

### 2. Version Control
- Each scope gets its own version branch:
  - `01-cleanup` → `v0.3.4`
  - `02-testing` → `v0.3.5`
  - `03-integration` → `v0.3.6`
  - `04-production` → `v0.3.7`
- When AI generates experimental work, create branches: `exp/<scope>/<task-name>`

### 3. Task Completion Flow

For **every task**, execute this sequence in order:

```
1. CLEAN    → Remove dead code, organize imports, simplify
2. TEST     → Write/update tests, verify coverage
3. BUILD    → Ensure compilation succeeds
4. TYPECHECK→ Zero TypeScript errors
5. DOCUMENT → Update relevant docs/comments
```

### 4. Task File Management

- Each completed task creates a new sequenced task file
- Format: `<scope>-task-<number>-<name>.md`
- Example: `01-cleanup-task-001-remove-dead-imports.md`
- Task files go in `/scopes/tasks/` directory

### 5. No Complaints Policy

Continue working through issues without complaints:
- If something breaks, fix it
- If tests fail, make them pass
- If types error, resolve them
- Document blockers but keep moving

### 6. Completion Criteria

A scope is **DONE** when:
- [ ] All tasks in the scope are complete
- [ ] All tests pass with 100% coverage of touched code
- [ ] Build succeeds with zero errors
- [ ] TypeScript reports zero errors
- [ ] Documentation is updated
- [ ] Branch is merged and tagged

## Directory Structure

```
/scopes/
├── rules.md                    # This file
├── 01-cleanup.md              # Scope 1: Cleanup & Organization
├── 02-testing.md              # Scope 2: Comprehensive Testing
├── 03-integration.md          # Scope 3: System Integration
├── 04-production.md           # Scope 4: Production Readiness
└── tasks/                     # Generated task files
    ├── 01-cleanup-task-001-*.md
    ├── 01-cleanup-task-002-*.md
    └── ...
```

## Commands Reference

```bash
# Clean
bun run lint --fix
bun run format

# Test
bun test
bun test --coverage

# Build
bun run build

# Typecheck
bun run typecheck
# or
tsc --noEmit

# All at once
bun run clean && bun test && bun run build && tsc --noEmit
```
