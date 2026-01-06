# Project Rules and Guidelines

This document captures all style choices, conventions, and rules for OpenCode Boomerang project.

## Core Principles

### 1. Always Use Bun
- **Package manager**: Bun (not npm, yarn, or pnpm)
- **Runtime**: Bun runtime for all scripts
- **Commands**: `bun run`, `bun install`, `bun test`, `bun build`
- **Example**:
  ```bash
  bun install          # Install dependencies
  bun run dev:min      # Watch orchestrator build
  bun run test         # Run tests
  bun run typecheck    # Type check
  ```

### 2. No Shell Scripts
- **Rule**: Do not create shell scripts (.sh, .bash)
- **Alternative**: Use Bun JavaScript/TypeScript files or bun scripts
- **Rationale**: Cross-platform compatibility, better tooling integration
- **Example**:
  ```bash
  # Bad: build.sh
  # Good: bun run build
  ```

### 3. Workflow-Based Operations
- **Rule**: Use workflows instead of scripts for complex operations
- **Implementation**: Defined in `packages/orchestrator/src/workflows/`
- **Example**: Prefer workflows for multi-step operations

## Code Style

### 4. No Comments (Unless Requested)
- **Rule**: Do not add comments to code
- **Rationale**: Code should be self-documenting
- **Exception**: Only add comments when explicitly requested by user
- **Example**:
  ```typescript
  // Bad:
  // Increment the counter
  counter++;

  // Good:
  counter++;
  ```

### 5. Minimal Changes
- **Rule**: Prefer surgical, minimal changes over sweeping refactors
- **Rationale**: Small changes are easier to review, test, and revert
- **Example**: Change only the function that needs fixing, not the entire module

### 6. Follow Existing Patterns
- **Rule**: Use existing code style and conventions
- **Rationale**: Consistency across codebase
- **Check**: Review adjacent code before making changes
- **Example**: If nearby code uses `const`, use `const` not `let`

## Testing

### 7. NEVER DELETE TESTS
- **Rule**: Test files are never deleted, even if they fail
- **CRITICAL**: This is a hard rule
- **When tests fail**:
  1. Examine why the test fails
  2. The test may be correct and the implementation wrong
  3. Only adjust expectations if implementation is intentionally different
- **Example**:
  ```bash
  # Never do this:
  rm test/broken-test.ts

  # Instead:
  # Fix the implementation or understand why test fails
  ```

### 8. No Mocks
- **Rule**: Use dependency injection instead of mocking
- **Rationale**: Mocks break on implementation changes, DI is more stable
- **Example**:
  ```typescript
  // Good: Inject fake dependencies
  await runWorkflow({...}, {
    resolveWorker: async (id) => id,
    sendToWorker: async (msg) => ({ success: true, response: "ok" }),
  });

  // Bad: Mock external dependencies
  vi.mock("some-external-module", () => ({ ... }))
  ```

### 9. Test Coverage Goals
- All exported functions must have unit tests
- Pure functions are easiest to test
- Stateful components use injected fakes for isolation

## Code Quality

### 10. Always Use TypeScript
- **Rule**: Write in TypeScript, not JavaScript
- **Rationale**: Type safety, better IDE support
- **Example**: Create `.ts` files, not `.js` files

### 11. Lint and Format
- **Lint**: `bun run lint`
- **Format**: `bun run format`
- **Check**: `bun run check` (runs all checks)
- **Tool**: Biome (configured in `biome.json`, run via `bunx @biomejs/biome`)

### 12. Type Check Before Commit
- **Rule**: Always run `bun run typecheck` before committing
- **Fix**: Fix all type errors before pushing

## Project Structure

### 13. Monorepo Structure
- **Root**: Workspace configuration
- **packages/**: Shared packages (orchestrator)
- **apps/**: Applications (control-panel, desktop)
- **Workspaces**: Managed by Bun

### 14. Dependencies
- **Workspace deps**: Use `"workspace:*"` for internal deps
- **Example**: `@opencode-ai/app: workspace:*`
- **Install**: `bun install` from root

## Documentation

### 17. Clear Documentation
- **Rule**: Document the "why", not just the "what"
- **Rationale**: Context is valuable for future developers

### 18. README Requirements
- Project README should be clear and comprehensive
- Include setup instructions
- Include examples
- Include architecture overview

## Development Workflow

### 19. Before Starting Work
1. Pull latest changes: `git pull`
2. Install dependencies: `bun install`
3. Check status: `bun run check`

### 20. While Working
1. Make changes
2. Type check: `bun run typecheck`
3. Test: `bun run test`
4. Commit often

### 21. Before Committing
1. Type check: `bun run typecheck`
2. Test: `bun run test`
3. Lint: `bun run lint`
4. Format: `bun run format`

### 22. Commit Messages
- Be clear and concise
- Explain "why", not just "what"
- Use conventional commits if applicable
- **Example**:
  ```
  fix: resolve memory leak in worker pool
  
  Workers were not being properly cleaned up, causing memory to grow
  indefinitely. Added explicit cleanup in stopWorker function.
  ```

## Error Handling

### 23. Graceful Failure
- Use try-catch appropriately
- Provide clear error messages
- Log errors appropriately
- Never crash silently

### 24. Log Levels
- **debug**: Detailed diagnostic info
- **info**: General informational messages
- **warn**: Warning messages (not errors)
- **error**: Error conditions

## Security

### 25. No Secrets in Code
- **Rule**: Never commit API keys, passwords, or tokens
- **Use**: Environment variables
- **File**: `.env` (in `.gitignore`)
- **Example**: `.env.example` for template

## Performance

### 26. Avoid Unnecessary Builds
- Use `--watch` mode for development
- Only build what changed
- Use incremental builds

### 27. Optimize Dependencies
- Keep dependencies minimal
- Remove unused dependencies
- Keep dev and prod deps separate

## Key Files Reference

| File | Purpose |
|------|---------|
| `AGENTS.md` | AI agent guidelines |
| `rules.md` | Project rules |
| `STYLE.md` | Style guide |
| `package.json` | Workspace and scripts |
| `bun.lock` | Dependency lockfile |
| `tsconfig.json` | TypeScript config |

## Common Commands Cheat Sheet

```bash
# Development
bun run dev:min              # Watch orchestrator build
bun run build              # Build all packages
bun run test               # Run all tests
bun run typecheck          # Type check
bun run lint              # Lint code
bun run format            # Format code
bun run check             # Run all checks

# Workspaces
cd packages/orchestrator && bun run test
cd apps/control-panel && bun run dev

# Type checking
bun run typecheck              # All packages
bun run typecheck:plugin       # Orchestrator only
bun run typecheck:desktop      # Desktop only
bun run typecheck:control-panel # Control panel only
```

## Violation Process

If you break a rule:
1. Acknowledge the violation
2. Fix the violation immediately
3. Document why (if needed)
4. Add to this file to prevent future violations

Remember: These rules exist to maintain code quality, consistency, and developer experience.
