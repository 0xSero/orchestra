## Task 00

### Goal
Initialize planning scaffolding: create the tasks directory and placeholder scope.md and rules.md to bootstrap the planning process.

### Before
- Repository exists in a clean state.
- Target fixture is present at `.tmp/test-fixture-lNbOB4` with package.json, build.js, verify.js, and dist folder absent.

### After
- Directory `tasks/` exists.
- `scope.md` and `rules.md` placeholders exist at repo root with proper headings.

### Acceptance criteria
- Files and directories exist: `tasks/`, `scope.md`, `rules.md`.
- Each placeholder contains at least a minimal header section.

### Files to touch
- `scope.md` (create placeholder)
- `rules.md` (create placeholder)
- create directory `tasks/` if not present

### Test plan
- Run a quick ls to confirm files exist; verify contents include the headings used here.
