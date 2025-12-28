# Orchestra Task Lifecycle Rules

## Task Workflow (Sequential)

Every task follows this exact sequence:

### 1. Branch
```bash
git checkout -b task-XX-description
```
- One branch per task
- Branch from `main`

### 2. Research
- Read relevant source files in `src/`
- Check existing tests in `test/`
- Understand the problem before coding

### 3. Implement
- Make changes following project conventions
- TypeScript strict mode, ESM modules, Bun runtime

### 4. Write Tests
- Add tests for new functionality
- Update tests for changed behavior
- Tests go in `test/`

### 5. Run Tests
```bash
bun run test
```
- All tests must pass before proceeding

### 6. Debug
- If tests fail, fix and re-run
- Iterate until green

### 7. Typecheck
```bash
bun run typecheck
```
- Zero type errors required

### 8. Build
```bash
bun run build
```
- Must complete without errors

### 9. Lint (Manual)
- Check for unused code
- Verify naming conventions
- Review error handling

### 10. Commit & PR
```bash
git add .
git commit -m "task-XX: description"
git push -u origin task-XX-description
```

---

## Quick Reference

| Step | Command | Must Pass |
|------|---------|-----------|
| Clean | `bun run clean` | - |
| Test | `bun run test` | ✓ |
| Typecheck | `bun run typecheck` | ✓ |
| Build | `bun run build` | ✓ |

---

## Task Files

Tasks are defined in `work/task-XX.md`. Work them in sequence.
