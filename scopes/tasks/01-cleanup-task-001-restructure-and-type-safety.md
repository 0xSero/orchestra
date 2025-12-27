# Task 001: Restructure and Type Safety Pass

## Summary
- Split oversized modules into focused files across app and orchestra.
- Centralized shared constants/utilities and removed unused dependencies.
- Tightened TypeScript typings and fixed lint/test/typecheck issues.

## Execution
- CLEAN: `bun run lint:fix`
- TEST: `bun run test`
- BUILD: `bun run build`
- TYPECHECK: `bun run typecheck`
- DOCUMENT: updated module READMEs and scope docs
