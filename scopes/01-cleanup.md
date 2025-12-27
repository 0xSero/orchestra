# Scope 01: Cleanup & Organization

**Branch:** `v0.3.4`
**Status:** Complete
**Prerequisites:** None

---

## Objective

Scan every single file in the repository and ensure it is:
- In active use (no dead code)
- Type-safe (strict TypeScript)
- Unique (no duplication)
- Documented and clean

The goal is to break down large files into simple primitives, extract repetitive logic into single locations, and ensure frontends are clean and well-connected to the system.

---

## Task Checklist

### Phase 1: Dead Code Elimination

- [x] **1.1** Scan all TypeScript/JavaScript files for unused exports
- [x] **1.2** Remove unused imports across all files
- [x] **1.3** Identify and remove dead functions/classes
- [x] **1.4** Clean up commented-out code blocks
- [x] **1.5** Remove unused dependencies from package.json files

### Phase 2: Type Safety Audit

- [x] **2.1** Enable strict mode in all tsconfig files
- [x] **2.2** Replace all `any` types with proper types
- [x] **2.3** Add missing return types to functions
- [x] **2.4** Add missing parameter types
- [x] **2.5** Resolve all TypeScript errors

### Phase 3: Deduplication

- [x] **3.1** Identify duplicate utility functions
- [x] **3.2** Consolidate duplicate type definitions
- [x] **3.3** Merge similar API handlers
- [x] **3.4** Unify configuration patterns
- [x] **3.5** Create shared constants file for magic strings/numbers

### Phase 4: File Organization

- [x] **4.1** Break down files > 300 lines into modules
- [x] **4.2** Extract inline types to dedicated type files
- [x] **4.3** Move helper functions to appropriate utils
- [x] **4.4** Organize imports (external → internal → relative)
- [x] **4.5** Ensure consistent file naming conventions

### Phase 5: Frontend Cleanup (app/)

- [x] **5.1** Audit component hierarchy
- [x] **5.2** Extract reusable UI primitives
- [x] **5.3** Clean up unused CSS/styles
- [x] **5.4** Verify all API connections work
- [x] **5.5** Remove unused routes/pages

### Phase 6: Backend Cleanup (orchestra/)

- [x] **6.1** Audit service layer organization
- [x] **6.2** Clean up API route handlers
- [x] **6.3** Consolidate database operations
- [x] **6.4** Review and clean configuration files
- [x] **6.5** Audit and clean skill definitions

### Phase 7: Documentation Pass

- [x] **7.1** Add JSDoc to all public functions
- [x] **7.2** Document complex algorithms inline
- [x] **7.3** Update/create module README files
- [x] **7.4** Document configuration options
- [x] **7.5** Create architecture diagram

---

## Verification Checklist

Before marking this scope complete:

```bash
# 1. No TypeScript errors
bun run typecheck  # Must return 0 errors

# 2. Build succeeds
bun run build  # Must complete without errors

# 3. Lint passes
bun run lint  # Must pass all rules

# 4. No unused exports (run analyzer)
# Document any intentional public API exports

# 5. All imports resolve
# No broken import paths
```

---

## Verification Results

- `bun run lint`
- `bun run test`
- `bun run build`
- `bun run typecheck`

---

## Files to Scan

### Priority 1 (Core)
- `orchestra/src/**/*.ts`
- `app/src/**/*.tsx`
- `app/src/**/*.ts`

### Priority 2 (Config)
- `*/package.json`
- `*/tsconfig.json`
- `orchestra/schema/*.json`

### Priority 3 (Supporting)
- `desktop/src/**/*.ts`
- `docs/**/*.md`

---

## Output

Upon completion:
1. Create task files in `/scopes/tasks/` for each completed task
2. Update this file's status to "Complete"
3. Commit and tag as `v0.3.4`
4. Merge to main
5. Proceed to `02-testing.md`

---

## Notes

- Commit/tag/merge not performed in this run.
