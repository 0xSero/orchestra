# 24/7 Autonomous Operation Setup

This setup enables the OpenCode Boomerang orchestrator to run continuously and improve itself without manual intervention. It is opt-in by default and only runs when you explicitly enable the workflow triggers.

## Overview

The system uses two workflow triggers:

1. **Infinite Orchestra Workflow** - Continuously plans and executes small improvement tasks
2. **Self-Improve Workflow** - Analyzes performance and optimizes the orchestrator itself

## Quick Start

1. **Enable triggers (opt-in)**

Edit `.opencode/orchestrator.json`:

```json
{
  "workflows": {
    "triggers": {
      "infiniteOrchestra": {
        "enabled": true,
        "idleMinutes": 30,
        "cooldownMinutes": 5
      },
      "selfImproveOnIdle": {
        "enabled": true,
        "idleMinutes": 60
      }
    }
  }
}
```

2. **Start the orchestrator**

Start your OpenCode server with the orchestrator plugin enabled.

## How It Works

### Infinite Orchestra Cycle

1. **Planning Phase** (Architect):
   - Creates a bounded set of small, safe tasks
   - Each task has clear acceptance criteria and a test plan
   - Focuses on reliability, safety, and developer UX
   - Writes tasks to `.opencode/orchestra/tasks/task-00.md`, etc.

2. **Execution Phase** (Coder):
   - Executes tasks from the queue
   - Runs validation with `bun run check`
   - Archives completed tasks to `.opencode/orchestra/done/`
   - Stops on first failure

3. **Cooldown**:
   - Cooldown between cycles
   - Resets if user activity is detected

### Self-Improve Workflow

1. **Analyze** (Architect): Reviews recent performance and errors
2. **Propose** (Architect): Suggests specific improvements
3. **Implement** (Coder): Makes minimal, surgical changes
4. **Validate** (Coder): Runs the test suite and backs out on failures

## Monitoring

From OpenCode:

```bash
task_list({ view: "workflow", format: "markdown" })
```

## Task Queue

Tasks are persisted to disk:
- **Queue**: `.opencode/orchestra/tasks/task-NN.md`
- **Archive**: `.opencode/orchestra/done/task-NN-YYYY-MM-DD-HH-mm.md`

Example task file:

```markdown
# task-00

## Goal
Add periodic cleanup for idle sessions to prevent memory leaks

## Before
No cleanup of idle sessions causes memory accumulation over days

## After
Idle sessions are cleaned up every hour

## Acceptance criteria
- [ ] Sessions idle >2 hours are removed
- [ ] Active sessions are not affected
- [ ] Memory usage stabilizes over 24 hours

## Files to touch
- `packages/orchestrator/src/core/runtime.ts`

## Test plan
1. Run `bun run test:e2e session-cleanup`
2. Monitor memory for 24 hours
3. Verify active sessions persist
```

## Safety Features

1. **Small tasks only**: Each task is bounded and low-risk
2. **Validation required**: All changes must pass `bun run check`
3. **Bounded cycles**: Max tasks per cycle with cooldowns
4. **Queue isolation**: Tasks only read/write within the configured queue/archive directories

## Troubleshooting

### System not starting
Check your OpenCode server logs.

### Tasks failing
```bash
# Check task queue
ls -la .opencode/orchestra/tasks/

# Check archived tasks
ls -la .opencode/orchestra/done/
```

### System unresponsive
Restart your OpenCode server process.

## Stopping 24/7 Operation

Disable triggers in `.opencode/orchestrator.json` and restart your OpenCode server.

## Customization

To change the goal of the infinite orchestra:

```json
{
  "workflows": {
    "infiniteOrchestra": {
      "goal": "Focus specifically on improving test coverage and documentation"
    }
  }
}
```

To slow down the cycle:

```json
{
  "workflows": {
    "triggers": {
      "infiniteOrchestra": {
        "idleMinutes": 120,
        "cooldownMinutes": 30
      }
    },
    "infiniteOrchestra": {
      "maxTasksPerCycle": 1
    }
  }
}
```

To make it more aggressive:

```json
{
  "workflows": {
    "triggers": {
      "infiniteOrchestra": {
        "idleMinutes": 15,
        "cooldownMinutes": 2
      }
    },
    "infiniteOrchestra": {
      "maxTasksPerCycle": 4
    }
  }
}
```

## Limitations

1. **Task state is currently in-memory**: Running tasks can be lost on restart
2. **No persistence for running tasks**: If restarted during task execution, that task is lost
3. **Single instance**: Not designed for horizontal scaling
4. **Model rate limits**: Ensure your API keys have sufficient quotas

## Contributing

When running in 24/7 mode, the system will create task files and commit changes. Review these periodically to ensure they are aligned with your goals.
