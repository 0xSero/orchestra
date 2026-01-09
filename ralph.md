---
active: true
iteration: 2
max_iterations: 250
completion_promise: UI_REDESIGN_COMPLETE
started_at: "2026-01-09T13:21:46Z"
last_commit: a0f86c7
progress: 40%
---

## Iteration 1 Summary (Completed)
- ✅ Created AppShell with sidebar navigation
- ✅ Implemented collapsible Sessions section
- ✅ Built Drawer component for detail panels
- ✅ Added route redirects for backward compatibility
- ✅ Keyboard shortcuts working (Cmd+K, Cmd+1-7, Esc)
- ✅ TypeScript and build passing

## Iteration 2 Goals
- Create Kanban board for Tasks with drag & drop
- Implement issue CRUD with persistence
- Create Automation hub with tabs
- Merge Config into Settings
- Create Workers page

---

TASK: Redesign the Open Orchestra Control Panel UI to feel like OpenCode + Linear + a power-user dashboard

  Objective
  Redesign the current “blocky/ugly” control panel into a modular, modern, high-density, power-user interface. The new UI must closely 
  resemble:

  - OpenCode: left sidebar with collapsible session list, fast navigation, minimal chrome
  - Linear: kanban issues board, issue detail drawer, keyboard-first patterns
  - Dashboard: clear status overview (workers, tasks, memory, errors, connectivity)

  Hard requirements (must ship)

  1. Replace top navigation with a left sidebar app shell:

    - Sidebar contains: a collapsible “Sessions” section (OpenCode sessions), then a vertical list of all pages.
    - Sessions section must be collapsible and show session items; clicking session navigates to that session view.
    - Active page + active session are visually highlighted.
  2. Tasks page becomes a Kanban board (Linear-style):

    - Columns: Backlog, Todo, In Progress, In Review, Done (default).
    - Create Issue (title + description) from UI.
    - Drag & drop cards between columns.
    - Changes persist after refresh/restart.
    - Clicking an issue opens a right-side detail drawer showing full fields and activity.
  3. Merge Config + Settings into ONE Settings page:

    - Old routes still work via redirect and/or nav removal (no dead links).
    - Settings page has clear sections (e.g., Connections, Storage/SQLite, Worker Overrides, Preferences).
    - Connection status cards remain visible (OpenCode API, Skills/Agents API, Orchestrator Events).
  4. Consolidate Skills + Workflows + Prompts into ONE main page with 3 subpages:

    - New nav item: “Automation” (or similar).
    - Subpages: Automation > Skills, Automation > Workflows, Automation > Prompts.
    - Each subpage uses the same layout pattern: list/table left, detail drawer or detail panel on click, Create/Edit flows.
  5. Must be able to define and manage:

    - Workers (profiles + status visibility)
    - Workflows
    - Skills
    - Prompts
    - Tasks/Issues (kanban)
  6. Must be able to see:

    - All workers on device, their status, and last activation
    - Memory entries on device (search + filter + detail view)
    - Logs and errors (browse + filter; show recent errors on dashboard)
  7. The frontend must be fully modular:

    - Introduce a reusable UI component system (buttons/inputs/badges/tables/drawers/modals/tabs/sidebar).
    - Centralized design tokens (colors, spacing, typography), consistent across all pages.
    - Power-user density: compact tables, keyboard shortcuts where reasonable, fast navigation.

  Non-goals / constraints

  - Do not break existing orchestrator/task/session functionality.
  - Prefer reusing existing APIs and persistence mechanisms; add minimal backend only if strictly necessary for issue persistence.
  - No “big rewrite”: incremental refactor into an AppShell + redesigned pages.

  Deliverables

  - New AppShell layout with sidebar navigation + session list.
  - New Kanban Tasks board with issue CRUD + persistence + detail drawer.
  - New Settings page merging config/settings.
  - New Automation hub with Skills/Workflows/Prompts as subroutes.
  - Updated Dashboard showing workers, tasks, memory, errors, connection health.
  - Updated Memory + Observe/Logs experiences to match new design system.
  - End-to-end verification steps implemented as either Playwright (preferred) or documented manual checks.

  Completion criteria (must be true)

  - All pages are reachable from sidebar.
  - Sessions list is collapsible and navigates.
  - Kanban board supports create + drag/drop + persistence + detail drawer.
  - Settings merged; config route not duplicated; no dead nav items.
  - Automation hub exists with 3 subpages.
  - Dashboard, Workers, Memory, Logs/Errors are functional and redesigned.
  - Lint/tests/build pass.

  Output exactly: UI_REDESIGN_COMPLETE

  ---
  Detailed scope and verification checklist

  This is the “spec” you keep in your repo / hand to the agent. Every item has explicit verification steps.

  A. Information architecture and routing

  A1. New primary navigation structure

  Scope

  - Implement an AppShell layout:

    - Left sidebar (primary nav + sessions)
    - Top header (optional: breadcrumbs/search/actions)
    - Main content area
    - Optional right inspector/drawer region (used for issue details, workflow details, memory details, etc.)

  Acceptance criteria

  - The top horizontal nav in the screenshots is removed or hidden inside the new shell.
  - Navigation is stable and consistent across all pages.

  Verify

  1. Launch the app.
  2. Confirm there is a left sidebar that persists while navigating pages.
  3. Confirm there is no top nav bar containing the old “Dashboard / Tasks / Compose / Workflows / …”.

  A2. Route mapping (old → new)

  Scope

  - Keep compatibility: old routes should redirect to the new equivalents.

  Proposed mapping

  - /dashboard → /dashboard (unchanged)
  - /tasks → /tasks/board (kanban default)
  - /compose → /tasks/new (or /tasks/board with create modal)
  - /workflows → /automation/workflows
  - /skills → /automation/skills
  - /prompts → /automation/prompts
  - /config and /settings → /settings
  - /memory → /memory
  - /observe → /observe
  - /chat → /sessions (or /sessions/:id if session-specific)

  Verify

  1. Manually navigate to each old route in the browser location bar.
  2. Confirm it redirects to the new target.
  3. Confirm no route shows a blank page or 404.

  ---
  B. Sidebar navigation with collapsible OpenCode sessions

  B1. Sessions section

  Scope

  - Add a “Sessions” section at the top of the sidebar.
  - It must:

    - Load sessions from the configured OpenCode API base URL
    - Show session title (or fallback ID)
    - Show a status indicator (running/idle/error) if available
    - Be collapsible with a chevron caret
    - Support scrolling independently (sessions list shouldn’t push nav off-screen)

  Verify

  1. With OpenCode API reachable:

    - Sidebar shows a header “Sessions” with a chevron.
    - A list of sessions is visible.
  2. Click the chevron:

    - Sessions list collapses fully (only header remains).
    - Click again expands.
  3. Click a session:

    - The app navigates to a session view.
    - The clicked session is visually highlighted as active.

  B2. Page navigation list

  Scope

  - Under sessions: a vertical list of pages:

    - Dashboard
    - Tasks (Kanban)
    - Workers
    - Automation (with subitems or routes)
    - Memory
    - Observe (Logs/Errors)
    - Settings

  Verify

  1. Confirm all items exist in sidebar.
  2. Clicking each item navigates to the correct page.
  3. Active page is highlighted.

  ---
  C. Design system and “power user” UI foundations

  C1. Design tokens + component library

  Scope

  - Introduce a design system with:

    - Color tokens (background/surface/border/text/accent)
    - Spacing tokens
    - Typography scale (dense defaults, e.g., smaller body size)
    - Reusable components: Button, Input, Select, Badge, Tabs, Table, Card, Drawer/Sheet, Modal, Tooltip, Toast

  Hard requirement

  - Pages must be composed using shared UI components (not page-specific one-off styles).

  Verify (code-level)

  1. There is a centralized ui/ (or similar) component directory.
  2. At least these are reusable and used across pages:

    - Sidebar, NavItem
    - Drawer (right-side)
    - Table
    - Badge
    - Button, Input, Select
  3. Spot-check 2–3 pages: they use shared components, not duplicated markup.

  C2. Density and usability

  Scope

  - Compact layouts:

    - Tables are not huge, padding is tight, typography is optimized for scanning.
  - Keyboard affordances (minimum):

    - Ctrl/Cmd+K opens a command palette or focuses global search (choose one).
    - Esc closes drawers/modals.

  Verify

  1. Open an issue detail drawer → press Esc → drawer closes.
  2. Press Ctrl/Cmd+K:

    - A command palette opens or the global search focuses.
    - Typing “Tasks” (or similar) can navigate.

  ---
  D. Tasks as a Linear-style Kanban board

  D1. Kanban board layout

  Scope

  - Replace the current Tasks page (list of jobs) with:

    - Kanban board with default columns:

        - Backlog
      - Todo
      - In Progress
      - In Review
      - Done
    - Each column shows:

        - Title + item count
      - Scrollable cards region
    - Board supports horizontal scrolling if needed.

  Verify

  1. Go to Tasks.
  2. Confirm you see the 5 columns above.
  3. Confirm each column has a count (even if 0).

  D2. Issue CRUD

  Scope

  - “New Issue” button opens modal or inline composer.
  - Required fields:

    - Title (required)
    - Description (optional but supported)
  - Optional fields (recommended):

    - Priority
    - Assignee (worker)
    - Labels/tags
  - Created issue appears in Backlog by default.

  Verify

  1. Click New Issue.
  2. Enter title “Test Issue 1”.
  3. Save.
  4. Confirm card appears in Backlog immediately.

  D3. Drag & drop + persistence

  Scope

  - Drag cards between columns (mouse).
  - Persist state to on-device storage (SQLite or existing persistence layer).
  - Order in a column persists too (basic ordering is fine).

  Verify

  1. Create “Test Issue 1”.
  2. Drag it from Backlog → In Progress.
  3. Refresh/restart the app.
  4. Confirm “Test Issue 1” is still in In Progress.

  D4. Issue detail drawer (right-side)

  Scope

  - Clicking a card opens a right-side drawer showing:

    - Title, status, description
    - Metadata: created time, updated time
    - Optional: assignee, priority, labels
  - Drawer supports edit:

    - Update title/description
    - Change status (should move card on board)
    - Assign worker (if workers exist)

  Verify

  1. Click “Test Issue 1” card.
  2. Drawer opens on the right.
  3. Edit title to “Test Issue 1 (edited)” → Save.
  4. Confirm card updates on board.
  5. Change status in drawer (e.g., Done) → drawer closes or stays open; card moves to Done column.

  D5. Bridge to orchestration runs (minimum viable)

  Scope

  - Add “Start work” action on an issue:

    - If user selects a worker: start a worker task using that issue’s description.
    - If user selects a workflow: start that workflow run with issue content.
  - Store linkage: issue should display “Linked run/task id” and status if possible.

  Verify

  1. Open an issue drawer.
  2. Click “Start work”.
  3. Pick a worker/workflow (if available).
  4. Confirm a task/run is created and visible in:

    - Observe logs/events or
    - A “Runs” section inside the issue drawer.

  If orchestrator is disconnected, the UI must show a clear error toast and not silently fail.

  ---
  E. Settings page (merge config + settings)

  E1. Single settings page with sections

  Scope

  - Merge the current Config + Settings experiences into one page:

    - Connections
    - Storage / SQLite status
    - Worker profiles / overrides
    - Preferences (key/value)
  - Maintain connection health indicators + override base URLs.

  Verify

  1. Navigate to Settings.
  2. Confirm you can see:

    - Connection cards (OpenCode API, Skills/Agents API, Orchestrator Events)
    - SQLite status
    - Preferences editor
    - Worker profiles/overrides
  3. Navigate to /config:

    - It redirects to /settings (or shows same page).
  4. Confirm sidebar does not show both Config and Settings separately.

  ---
  F. Automation hub: Skills + Workflows + Prompts

  F1. One main page, three subpages

  Scope

  - Create “Automation” as main nav entry.
  - Subroutes/subpages:

    - /automation/skills
    - /automation/workflows
    - /automation/prompts
  - Each subpage:

    - List/table view
    - Search/filter
    - Create button
    - Click row → detail drawer/panel with edit

  Verify

  1. Click Automation → Workflows: see workflows list.
  2. Switch to Skills and Prompts via tabs/subnav.
  3. Confirm URL changes accordingly.
  4. Create one item in each category (or mock if backend not ready).
  5. Refresh/restart → created items persist (if persistence supported).

  F2. CRUD and schema validation (practical)

  Scope

  - If these entities are backed by JSON/YAML:

    - Provide editor with validation feedback (even basic “invalid JSON” is acceptable).
  - Save changes in a way that is reflected on reload.

  Verify

  1. Create new Prompt with invalid JSON/template → confirm error shown and Save disabled.
  2. Fix it → Save enabled → save succeeds.
  3. Reload → item persists and is correct.

  ---
  G. Workers and status visibility

  G1. Workers page and dashboard visibility

  Scope

  - Provide a dedicated Workers page (or Dashboard section) that shows:

    - Worker name/profile
    - Status: Ready/Busy/Error/Stopped
    - Last activation timestamp or “x minutes ago”
    - Current task summary (if busy)
    - Actions: open chat/session, view logs, etc.

  Verify

  1. Go to Workers page.
  2. Confirm list shows all workers with statuses.
  3. Confirm last activation is visible (absolute or relative).
  4. Click a worker → opens details drawer or page with more info.

  ---
  H. Memory browsing (on-device)

  H1. Memory page redesign

  Scope

  - Redesign Memory page with:

    - Summary counters (writes, keys, tags)
    - Search bar
    - Filter by tag/scope (if applicable)
    - Table with rows
    - Click row → detail drawer with full value, metadata

  Verify

  1. Go to Memory.
  2. Confirm search input exists and filters results.
  3. Click a memory entry → drawer opens with full content.
  4. Copy button copies value to clipboard (recommended; optional).

  ---
  I. Logs + Errors (Observe)

  I1. Logs/events/errors UX

  Scope

  - Observe page should feel like a power-user console:

    - Stream view (events/log lines)
    - Filters: level (info/warn/error), source (orchestrator/opencode), worker
    - Pause/resume stream
    - Error list/table with “recent errors” view

  Verify

  1. Go to Observe.
  2. Confirm filter controls exist.
  3. Trigger an error (disconnect one API) → see error appear.
  4. Pause stream → new lines stop.
  5. Resume → new lines continue.

  ---
  Global “Definition of Done” checklist

  These must all be true before outputting the completion promise:

  - Sidebar shell exists and replaces top nav.
  - Sessions list exists, is collapsible, and navigates correctly.
  - Tasks page is a kanban board with create + drag/drop + persistence.
  - Issue detail drawer exists and supports editing + status updates.
  - Config + Settings merged into one Settings page; no duplicate nav items; old route redirects.
  - Automation hub exists with Skills/Workflows/Prompts subpages and consistent UX.
  - Workers status + last activation visible.
  - Memory browsing redesigned with search + detail drawer.
  - Observe page supports logs/errors with filters and pause/resume.
  - UI uses modular component system + centralized tokens.
  - No dead links; app builds/runs cleanly.

  ---
  If you want, I can also write an even more “Ralph-friendly” version that is formatted as a strict checklist file (e.g.,
  TODO_UI_REDESIGN.md) where each checkbox maps to an automated Playwright test name (so “verifiable” becomes literally “green tests =
  done”).
  --iterations 200

  Extract and display completion promise if set