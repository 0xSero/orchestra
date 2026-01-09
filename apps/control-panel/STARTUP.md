# Control Panel Startup Guide

## Overview

The Open Orchestra Control Panel is a web-based dashboard for monitoring and managing OpenCode orchestrator operations. It displays real-time data about workers, tasks, workflows, memory, and skills.

## Prerequisites

1. **OpenCode CLI** installed and accessible in your PATH
2. **Bun** runtime (for development)
3. **Orchestrator plugin** configured (see `.opencode/orchestrator.json`)

## Quick Start

### 1. Start OpenCode Server

The control panel requires an OpenCode server running with the orchestrator plugin.

```bash
# In this project directory
opencode
```

This will:
- Start the OpenCode server on port **4096** (default)
- Load the orchestrator plugin from `.opencode/orchestrator.json`
- Start the skills/agents API on port **4097** (default)
- Begin streaming orchestrator events

### 2. Start the Control Panel

In a new terminal:

```bash
# From the control-panel directory
bun run dev

# Or from the project root
bun run --cwd apps/control-panel dev
```

The control panel will open at `http://localhost:3000`

## What You'll See

### When OpenCode is Running ✅

- **Dashboard**: Live stats, worker status, active workflows
- **Tasks**: Real-time job monitoring with progress tracking
- **Workers**: All configured workers with status and last activity
- **Memory**: Memory writes from the orchestrator
- **Workflows**: Active and historical workflow runs
- **Skills**: Discovered skills from all sources
- **Automation**: Manage workflows, skills, and prompts
- **Chat**: Interact with worker sessions

### When OpenCode is NOT Running ❌

The dashboard will display:
- **Connection error banner** with startup instructions
- **Empty data** in all views (workers, tasks, etc.)
- **"Not Connected" status indicators**

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  OpenCode CLI (port 4096)                          │
│  ├── Orchestrator Plugin                           │
│  ├── Skills/Agents API (port 4097)                 │
│  └── Event Stream (/v1/events)                     │
└─────────────────────────────────────────────────────┘
                        │
                        │ WebSocket + HTTP
                        ↓
┌─────────────────────────────────────────────────────┐
│  Control Panel (port 3000)                         │
│  ├── Dashboard                                     │
│  ├── Tasks Monitor                                 │
│  ├── Worker Manager                                │
│  ├── Workflow Runner                               │
│  └── Memory Browser                                │
└─────────────────────────────────────────────────────┘
```

## Data Flow

### Workers
- Source: OpenCode orchestrator runtime
- Updated via: Event stream (`orchestra.worker.status`)
- Displays: name, status, model, capabilities, last activity

### Tasks/Jobs
- Source: Orchestrator job queue
- Updated via: Event stream (`orchestra.job.created`, `orchestra.job.progress`, `orchestra.job.completed`)
- Displays: running tasks, completed tasks, progress, duration

### Workflows
- Source: Orchestrator workflow engine
- Updated via: Event stream (`orchestra.workflow.started`, `orchestra.workflow.step`, `orchestra.workflow.completed`)
- Displays: active runs, step timeline, skills used

### Memory
- Source: Orchestrator memory system
- Updated via: Event stream (`orchestra.memory.written`)
- Displays: recent writes, searchable entries, full data

### Skills
- Source: OpenCode skills API + orchestrator events
- Updated via: HTTP polling + event stream (`orchestra.skill.load.*`)
- Displays: discovered skills, load events, usage stats

## Configuration

### OpenCode Connection

The control panel auto-connects to:
- **OpenCode API**: `http://localhost:4096` (default)
- **Skills API**: `http://localhost:4097` (default)
- **Events Stream**: `http://localhost:4096/v1/events` (default)

Override via:
- **Query params**: `?url=http://custom:port&skills=http://custom:port`
- **localStorage**: Set `opencode.baseUrl` and `opencode.skillsBase`
- **Window globals**: Set `window.__OPENCODE__` object

### Orchestrator Plugin

Edit `.opencode/orchestrator.json` to configure:
- Worker profiles (vision, docs, coder, etc.)
- Workflow settings
- Memory behavior
- Auto-spawn policies
- Telemetry

## Troubleshooting

### "OpenCode Server Not Connected"

**Symptoms:**
- Red error banner on dashboard
- No workers, tasks, or workflows shown
- Empty data in all pages

**Solution:**
1. Check if OpenCode is running: `ps aux | grep opencode`
2. Start OpenCode in project directory: `opencode`
3. Verify port 4096 is not in use: `lsof -i :4096`
4. Check OpenCode logs for errors

### "Skills Not Loading"

**Symptoms:**
- Skills page shows "Loading..." or empty
- No skill events in observability

**Solution:**
1. Verify skills API is running on port 4097
2. Check `.opencode/` directory for skill configurations
3. Ensure orchestrator plugin loaded successfully
4. Look for skill load errors in OpenCode logs

### "Workflows Not Running"

**Symptoms:**
- Workflow list is empty
- Workflow triggers not firing

**Solution:**
1. Check `.opencode/orchestrator.json` → `workflows.enabled: true`
2. Verify workflow files exist in `.opencode/orchestra/`
3. Check orchestrator logs for workflow loading errors
4. Ensure worker profiles are configured correctly

### "Tasks Are Empty"

**Symptoms:**
- Tasks page shows no jobs
- Job counts are zero

**Solution:**
1. Tasks are populated when work is assigned to workers
2. Try running a workflow or triggering a task
3. Check if orchestrator is receiving job requests
4. Verify OpenCode server is connected (see above)

## Development

### Project Structure

```
apps/control-panel/
├── src/
│   ├── components/     # Reusable UI components
│   ├── context/        # State management (OpenCode SDK)
│   ├── lib/            # Utilities and helpers
│   └── pages/          # Page components
├── public/             # Static assets
└── package.json        # Dependencies and scripts
```

### Key Technologies

- **SolidJS**: Reactive UI framework
- **TypeScript**: Type safety
- **Tailwind CSS**: Styling with Warm Paper design system
- **Vite**: Build tool and dev server
- **OpenCode SDK**: Connection to OpenCode server
- **Vitest**: Testing framework (170 tests)

### Available Scripts

```bash
bun run dev          # Start dev server (port 3000)
bun run build        # Build for production
bun run preview      # Preview production build
bun run typecheck    # Run TypeScript checks
bun run test         # Run all tests
bun run test:watch   # Run tests in watch mode
```

## Pages Reference

| Page | Route | Purpose |
|------|-------|---------|
| **Dashboard** | `/` or `/dashboard` | Overview of system status |
| **Tasks** | `/tasks` | Monitor orchestrator jobs |
| **Board** | `/board` | Kanban-style issue board (offline) |
| **Workers** | `/workers` | View all workers and their status |
| **Memory** | `/memory` | Browse orchestrator memory writes |
| **Chat** | `/chat` | Interact with worker sessions |
| **Automation** | `/automation` | Hub for workflows/skills/prompts |
| **Workflows** | `/automation/workflows` | Run and monitor workflows |
| **Skills** | `/automation/skills` | Discover and inspect skills |
| **Prompts** | `/automation/prompts` | Manage prompt templates |
| **Observe** | `/observe` | View logs and events |
| **Settings** | `/settings` | Configure connections and preferences |

## Support

- **Issues**: Report bugs or request features on GitHub
- **Documentation**: See `/docs` directory in project root
- **Configuration**: Check `.opencode/orchestrator.json` for plugin settings
