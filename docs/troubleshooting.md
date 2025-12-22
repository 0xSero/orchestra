# Troubleshooting

This guide covers the most common issues you'll encounter with Open Orchestra and how to fix them.

## Quick Diagnostics

Before diving into specific issues, run these commands to get a health check:

```bash
# See all available models (verifies provider config)
list_models

# See running workers and their status
list_workers

# Get detailed diagnostics
orchestrator_diagnostics
```

---

## Common Issues

### 1. "No models available" or "Provider not configured"

**Symptoms:**
- `list_models` returns empty or errors
- Workers fail to spawn with model-related errors
- "No suitable model found for profile"

**Cause:** OpenCode doesn't have any AI providers configured.

**Solution:**

1. Check your OpenCode config file (`~/.config/opencode/opencode.json`):

```json
{
  "provider": {
    "anthropic": {
      "apiKey": "sk-ant-..."
    }
  }
}
```

2. Verify the API key is valid by running `list_models` in OpenCode.

3. If using environment variables, ensure they're set:
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

---

### 2. "Model not found" or Wrong Model Selected

**Symptoms:**
- Worker spawns but uses unexpected model
- "Could not resolve model tag"
- Vision worker doesn't support images

**Cause:** Model tags (`auto:vision`, `node:fast`) resolve based on your configured providers. If no matching model exists, fallback behavior may be unexpected.

**Solution:**

1. Check what models are available:
```
list_models
```

2. See what model a profile is using:
```
list_profiles({ format: "json" })
```

3. Override the profile model explicitly:
```
set_profile_model({ profileId: "vision", model: "anthropic/claude-sonnet-4-5" })
```

4. Or set it in your config:
```json
// .opencode/orchestrator.json
{
  "profiles": [
    {
      "id": "vision",
      "model": "openai/gpt-4o"
    }
  ]
}
```

**Model Tag Reference:**

| Tag | Meaning | Required Capability |
|-----|---------|---------------------|
| `auto` or `node` | Default model | None |
| `auto:vision` | Vision-capable model | Multimodal/image input |
| `auto:fast` | Fast/cheap model | None (prefers speed) |
| `auto:docs` | Web-capable model | Web browsing |

---

### 3. "Worker failed to spawn" or "Connection refused"

**Symptoms:**
- `spawn_worker` returns error
- "ECONNREFUSED" errors
- Worker status shows "error"

**Cause:** The worker process failed to start or crashed immediately.

**Solution:**

1. Check for port conflicts:
```json
// .opencode/orchestrator.json
{
  "basePort": 15000  // Try a different port range
}
```

2. Increase startup timeout:
```json
{
  "startupTimeout": 60000  // 60 seconds
}
```

3. Enable debug logging to see what's happening:
```bash
export OPENCODE_ORCH_DEBUG=1
```

4. Check system resources (memory, CPU):
```
orchestrator_diagnostics
```

5. Kill any orphan processes:
```bash
pkill -f "opencode serve"
```

---

### 4. "Worker not responding" or Timeout Errors

**Symptoms:**
- `ask_worker` hangs or times out
- "Request timeout" errors
- Worker shows "busy" indefinitely

**Cause:** Worker process crashed, is overloaded, or network issue.

**Solution:**

1. Check worker status:
```
list_workers
```

2. If stuck in "busy" state, stop and respawn:
```
stop_worker({ workerId: "docs" })
spawn_worker({ profileId: "docs" })
```

3. Increase request timeout in your call:
```
ask_worker({ 
  workerId: "docs", 
  message: "...", 
  timeout: 120000  // 2 minutes
})
```

4. Check worker health:
```
orchestrator_diagnostics
```

---

### 5. "Port already in use"

**Symptoms:**
- "EADDRINUSE" error
- Worker fails to spawn on specific port
- Multiple spawn attempts fail

**Cause:** Previous worker didn't clean up, or another process is using the port.

**Solution:**

1. Use dynamic port allocation (recommended):
```json
// .opencode/orchestrator.json
{
  "basePort": 0  // Let OS assign ports
}
```

2. Find and kill the process using the port:
```bash
# Find process on port 14097
lsof -i :14097

# Kill it
kill -9 <PID>
```

3. Stop all workers and restart:
```
stop_worker({ workerId: "all" })
```

---

### 6. "Session not found" or "Invalid session"

**Symptoms:**
- Worker was running but now errors
- "Session does not exist"
- Intermittent communication failures

**Cause:** Worker process died but registry still thinks it's alive.

**Solution:**

1. Force unregister the worker:
```
stop_worker({ workerId: "docs", force: true })
```

2. Clear the device registry (cross-session persistence):
```
orchestrator_device_registry({ action: "clear" })
```

3. Respawn:
```
spawn_worker({ profileId: "docs" })
```

---

### 7. "delegate_task returned empty" or "No suitable worker"

**Symptoms:**
- `delegate_task` returns no response
- "Could not find suitable worker"
- Task seems to go nowhere

**Cause:** No running worker matches the task requirements.

**Solution:**

1. Check what workers are running:
```
list_workers
```

2. Spawn the needed worker type:
```
# For vision tasks
spawn_worker({ profileId: "vision" })

# For documentation research
spawn_worker({ profileId: "docs" })

# For code tasks
spawn_worker({ profileId: "coder" })
```

3. Be explicit about requirements:
```
delegate_task({ 
  task: "Analyze this screenshot", 
  requiresVision: true 
})
```

---

### 8. "Memory tools not working" or Neo4j Errors

**Symptoms:**
- `memory_put` or `memory_search` fails
- "Neo4j connection refused"
- "Memory system not available"

**Cause:** Neo4j is optional and not configured.

**Solution:**

1. Memory is optional. If you don't need it, don't use memory tools.

2. If you want memory, set up Neo4j:
```bash
# Using Docker
docker run -d \
  --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password \
  neo4j:latest
```

3. Configure the connection:
```bash
export OPENCODE_NEO4J_URI=bolt://localhost:7687
export OPENCODE_NEO4J_USERNAME=neo4j
export OPENCODE_NEO4J_PASSWORD=password
```

4. Or in config:
```json
// .opencode/orchestrator.json
{
  "memory": {
    "enabled": true
  }
}
```

---

### 9. "Workers not auto-spawning"

**Symptoms:**
- Expected workers to start automatically
- `autoSpawn` is `true` but nothing happens
- Have to manually spawn every time

**Cause:** `autoSpawn` is enabled but `workers` array is empty or invalid.

**Solution:**

1. Check your config has both settings:
```json
// .opencode/orchestrator.json
{
  "autoSpawn": true,
  "workers": ["docs", "coder", "vision"]
}
```

2. Verify profile IDs are valid:
```
list_profiles
```

3. Check for config loading errors:
```
orchestrator_status
```

---

### 10. "Debug spam in terminal" or Noisy Output

**Symptoms:**
- Too many log messages
- Terminal cluttered with debug output
- Want cleaner experience

**Cause:** Debug logging is enabled.

**Solution:**

1. Disable debug mode:
```bash
unset OPENCODE_ORCH_DEBUG
```

2. Or in config:
```json
// .opencode/orchestrator.json
{
  "ui": {
    "debug": false,
    "logToConsole": false
  }
}
```

3. View logs on-demand instead:
```
orchestrator_diagnostics
```

---

## Debug Mode

When you need more information to diagnose an issue:

### Enable Debug Logging

**Option 1: Environment Variable**
```bash
export OPENCODE_ORCH_DEBUG=1
opencode
```

**Option 2: Config File**
```json
// .opencode/orchestrator.json
{
  "ui": {
    "debug": true
  }
}
```

### View Diagnostic Information

```
orchestrator_diagnostics
```

This shows:
- Worker processes and their status
- Memory usage
- Recent errors
- Configuration state

### Trace Worker Activity

```
worker_trace({ workerId: "docs" })
```

Shows recent messages sent to/from a specific worker.

---

## Getting More Help

### Check Documentation

- [Quickstart](./quickstart.md) - Basic setup
- [Configuration](./configuration.md) - All config options
- [Examples](./examples.md) - Working examples
- [Guide](./guide.md) - Detailed usage guide

### File an Issue

If you've tried the solutions above and still have problems:

1. Gather diagnostic info:
```
orchestrator_diagnostics
```

2. Check your config:
```
orchestrator_status
```

3. File an issue at: [GitHub Issues](https://github.com/0xSero/open-orchestra/issues)

Include:
- Open Orchestra version (`package.json`)
- OpenCode version
- Your OS
- Diagnostic output
- Steps to reproduce

---

## Quick Fixes Cheatsheet

| Problem | Quick Fix |
|---------|-----------|
| No models | Add provider to `opencode.json` |
| Wrong model | `set_profile_model({ profileId: "...", model: "..." })` |
| Worker stuck | `stop_worker({ workerId: "...", force: true })` |
| Port conflict | Set `"basePort": 0` in config |
| Can't spawn | `pkill -f "opencode serve"` then retry |
| No auto-spawn | Add IDs to `workers` array in config |
| Need logs | `export OPENCODE_ORCH_DEBUG=1` |
| Clear state | `orchestrator_device_registry({ action: "clear" })` |
