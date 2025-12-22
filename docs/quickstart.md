# Quickstart: Your First Worker in 5 Minutes

Get Open Orchestra running and interact with your first AI worker in under 5 minutes.

## Before You Begin (30 seconds)

Verify you have these installed:

```bash
# Check Bun runtime
bun --version
# Expected: 1.0.0 or higher

# Check OpenCode CLI
opencode --version
# Expected: Any recent version

# Check you have at least one AI provider configured
# Run this inside OpenCode:
list_models
# Expected: At least one model listed (e.g., anthropic/claude-sonnet-4-5)
```

**Don't have a provider configured?** Add one to your `~/.config/opencode/opencode.json`:

```json
{
  "provider": {
    "anthropic": {
      "apiKey": "your-api-key-here"
    }
  }
}
```

---

## Step 1: Install (30 seconds)

```bash
# Add to your project
bun add opencode-orchestrator

# Or install globally
bun add -g opencode-orchestrator
```

---

## Step 2: Enable the Plugin (1 minute)

Add the plugin to your OpenCode configuration:

```json
// opencode.json or ~/.config/opencode/opencode.json
{
  "plugin": ["opencode-orchestrator"]
}
```

Optionally, create a project-specific orchestrator config:

```json
// .opencode/orchestrator.json
{
  "$schema": "../node_modules/opencode-orchestrator/schema/orchestrator.schema.json",
  "autoSpawn": false
}
```

---

## Step 3: Verify Installation (30 seconds)

Start OpenCode and run:

```javascript
list_profiles
```

**Expected output:**

```text
Available Profiles:
- vision: Vision Analyst - Analyze images, screenshots, diagrams
- docs: Documentation Librarian - Research documentation, find examples
- coder: Code Implementer - Write and modify code
- architect: System Architect - Design systems, plan architecture (read-only)
- explorer: Code Explorer - Fast codebase searches
- memory: Memory Graph Curator - Manage persistent knowledge
```

If you see this list, the plugin is working.

---

## Step 4: Spawn Your First Worker (1 minute)

Let's spawn a documentation research worker:

```javascript
spawn_worker({ profileId: "docs" })
```

**Expected output:**

```text
Worker 'docs' spawned successfully
- Port: 14097
- Model: anthropic/claude-sonnet-4-5 (or your default)
- Status: ready
```

---

## Step 5: Talk to Your Worker (1 minute)

Send a message to the docs worker:

```javascript
ask_worker({ 
  workerId: "docs", 
  message: "What is the React useEffect hook and when should I use it?" 
})
```

**Expected output:**

The worker will respond with a detailed explanation of React's useEffect hook, including:
- What it does
- Common use cases
- Example code
- Best practices

---

## Step 6: Try Task Delegation (1 minute)

Instead of manually choosing a worker, let the orchestrator pick the best one:

```javascript
delegate_task({ 
  task: "Explain the difference between var, let, and const in JavaScript" 
})
```

The orchestrator will:
1. Analyze your task
2. Select the most appropriate worker (likely `docs` for explanations)
3. Send the task and return the response

---

## You Did It!

You've successfully:
- Installed Open Orchestra
- Spawned an AI worker
- Communicated with it directly
- Delegated a task automatically

---

## What's Next?

### Try Different Workers

```javascript
// Spawn a vision worker for image analysis
spawn_worker({ profileId: "vision" })

// Spawn an architect for system design
spawn_worker({ profileId: "architect" })

// See all running workers
list_workers
```

### Enable Auto-Spawn

Have workers start automatically when OpenCode loads:

```json
// .opencode/orchestrator.json
{
  "autoSpawn": true,
  "workers": ["docs", "coder"]
}
```

### Use Workflows

Run the built-in RooCode Boomerang workflow for plan-implement-review cycles:

```javascript
run_workflow({ 
  workflowId: "roocode-boomerang", 
  task: "Add input validation to the user registration form" 
})
```

---

## Quick Reference

| Tool | Purpose | Example |
|------|---------|---------|
| `list_profiles` | See available worker types | `list_profiles()` |
| `spawn_worker` | Start a worker | `spawn_worker({ profileId: "docs" })` |
| `list_workers` | See running workers | `list_workers()` |
| `ask_worker` | Send message to specific worker | `ask_worker({ workerId: "docs", message: "..." })` |
| `delegate_task` | Auto-route to best worker | `delegate_task({ task: "..." })` |
| `stop_worker` | Stop a worker | `stop_worker({ workerId: "docs" })` |

---

## Troubleshooting

### "No models available"

You need to configure at least one AI provider. See [Configuration](./configuration.md).

### "Worker failed to spawn"

Check that your provider credentials are valid:
```javascript
list_models
```

If no models appear, your provider isn't configured correctly.

### "Connection timeout"

The worker may have crashed. Try:
```javascript
stop_worker({ workerId: "docs" })
spawn_worker({ profileId: "docs" })
```

For more issues, see the [Troubleshooting Guide](./troubleshooting.md).

---

## Further Reading

- [Examples](./examples.md) - Real-world use cases
- [Configuration](./configuration.md) - Full configuration reference
- [Guide](./guide.md) - Profiles, workflows, and advanced features
- [Architecture](./architecture.md) - Deep dive into how it works
