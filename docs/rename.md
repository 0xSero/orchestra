# Repository Rename: orchestra

This document describes how to safely rename the local directory from `opencode-boomerang` to `orchestra`.

## Prerequisites

- No uncommitted changes (clean working tree)
- All worktrees closed or synced
- IDE/editor closed (prevents file locks)

## Rename Steps

1. **Close editors and running processes**

   ```bash
   # Stop any running dev servers, OpenCode, or orchestrator
   # Close VS Code / Cursor / other editors with this workspace open
   ```

2. **Rename the directory**

   ```bash
   cd ~  # or parent of the repo
   mv opencode-boomerang orchestra
   ```

3. **Re-initialize dependencies**

   ```bash
   cd orchestra
   bun install
   ```

4. **Verify the setup**

   ```bash
   bun run check  # format, lint, typecheck, test, build
   ```

5. **Update editor/IDE workspace settings**

   - Re-open the project from the new `orchestra` directory
   - Update any saved workspace paths in your editor

## After Rename

- All internal paths are relative and will continue to work
- Git history is preserved (git tracks content, not folder names)
- Docker volumes remain attached to the named volumes, not the folder name

## Worktrees

If you have git worktrees pointing to the old path:

```bash
# List existing worktrees
git worktree list

# Remove stale worktrees
git worktree prune

# Re-create worktrees from the new location if needed
git worktree add ../orchestra-worktree-01 main
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `bun install` fails | Delete `node_modules` and `bun.lock`, then re-run `bun install` |
| Tests fail with path errors | Run `bun run check` to verify all paths are relative |
| Docker can't find volumes | Named volumes persist; restart Docker or recreate containers |
| Editor shows stale paths | Close and re-open the project from the new directory |
