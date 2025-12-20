# API Reference

This document provides comprehensive documentation for all 24+ tool APIs provided by Open Orchestra.

## Table of Contents

- [Worker Management](#worker-management)
- [Task Delegation](#task-delegation)
- [Workflows](#workflows)
- [Configuration](#configuration)
- [Memory (Neo4j)](#memory-neo4j)
- [Help](#help)

---

## Worker Management

### `spawn_worker`

Spawns a new worker with a specific profile.

**Parameters:**
```typescript
{
  profileId: string;        // Profile ID (built-in: vision, docs, coder, architect, explorer)
  model?: string;           // Override the model to use
  customId?: string;        // Custom ID for this worker instance
  showToast?: boolean;      // Show a toast notification in the UI
}
```

**Example:**
```bash
# Spawn with default settings
spawn_worker({ profileId: "vision" })

# Spawn with custom model
spawn_worker({ profileId: "coder", model: "anthropic/claude-sonnet-4-5" })

# Spawn with custom ID
spawn_worker({ profileId: "vision", customId: "ui-reviewer" })
```

### `stop_worker`

Stops and unregisters a running worker.

**Parameters:**
```typescript
{
  workerId: string;         // ID of the worker to stop
}
```

**Example:**
```bash
stop_worker({ workerId: "vision" })
```

### `ensure_workers`

Ensures a set of workers are running, spawning any that are missing.

**Parameters:**
```typescript
{
  profileIds: string[];     // Worker profile IDs to ensure are running
}
```

**Example:**
```bash
ensure_workers({ profileIds: ["vision", "docs", "coder"] })
```

### `list_workers`

Lists all available workers in the orchestrator registry with their status and capabilities.

**Parameters:**
```typescript
{
  format?: "markdown" | "json";   // Output format (default: markdown)
}
```

**Example:**
```bash
# Default markdown table
list_workers({})

# JSON output
list_workers({ format: "json" })
```

**Sample Output:**
| ID | Name | Status | Model | Vision | Web | Port | Purpose |
|----|------|--------|-------|---------|-----|------|---------|
| vision | Vision Analyst | ready | zhipuai/glm-4.6v | yes | no | 58187 | Analyze images, screenshots, diagrams |
| docs | Documentation Librarian | ready | anthropic/claude-sonnet-4-5 | no | yes | 58172 | Research documentation, find examples |
| coder | Code Implementer | busy | anthropic/claude-opus-4-5 | no | no | 58167 | Write, edit, and refactor code |

### `get_worker_info`

Get detailed information about a specific worker including its purpose, model, and current status.

**Parameters:**
```typescript
{
  workerId: string;         // ID of the worker to get info about
  format?: "markdown" | "json";   // Output format (default: markdown)
}
```

**Example:**
```bash
get_worker_info({ workerId: "vision" })
```

**Sample Output:**
```markdown
# Vision Analyst (vision)

- Status: ready
- Model: zhipuai/glm-4.6v
- Port: 58187
- Vision: yes
- Web: no

## Purpose
Analyze images, screenshots, diagrams, and visual content

## When to use
When you need to understand visual content like screenshots, architecture diagrams, UI mockups, error screenshots, or any image-based information
```

---

## Task Delegation

### `delegate_task`

Auto-routes a task to the best worker (optionally auto-spawning), runs it, and returns the response.

**Parameters:**
```typescript
{
  task: string;             // Task description to delegate
  requiresVision?: boolean; // If true, prefer a vision-capable worker
  autoSpawn?: boolean;      // If true, spawn a suitable worker if none exist
  workerId?: string;        // Force a specific worker ID
  attachments?: Array<{     // Optional attachments to forward
    type: "image" | "file";
    path?: string;
    base64?: string;
    mimeType?: string;
  }>;
}
```

**Example:**
```bash
# Auto-route with vision
delegate_task({ 
  task: "What's wrong with this error screenshot?", 
  requiresVision: true,
  attachments: [/*...*/]
})

# Force specific worker
delegate_task({ 
  task: "Research React hooks documentation", 
  workerId: "docs" 
})

# Auto-spawn if needed
delegate_task({ 
  task: "Analyze this architecture diagram",
  requiresVision: true,
  autoSpawn: true 
})
```

### `ask_worker`

Send a message to a specialized worker and get a response.

**Parameters:**
```typescript
{
  workerId: string;         // ID of the worker to message
  message: string;          // The message/question to send
  imageBase64?: string;     // Optional base64-encoded image (deprecated)
  attachments?: Array<{     // Preferred attachment format
    type: "image" | "file";
    path?: string;
    base64?: string;
    mimeType?: string;
  }>;
}
```

**Example:**
```bash
# Direct messaging
ask_worker({ 
  workerId: "docs", 
  message: "Find the official API docs for Express.js routing" 
})

# With image
ask_worker({ 
  workerId: "vision", 
  message: "Describe what you see in this diagram",
  attachments: [{
    type: "image",
    base64: "iVBORw0KGgoAAAANSUhEUgAA..."
  }]
})
```

### `find_worker`

Find the most suitable worker for a given task based on capabilities.

**Parameters:**
```typescript
{
  task: string;             // Description of the task
  requiresVision?: boolean; // Whether the task requires image analysis
}
```

**Example:**
```bash
# Find for vision task
find_worker({ 
  task: "Analyze this UI mockup", 
  requiresVision: true 
})

# Find for documentation task
find_worker({ 
  task: "Research best practices for authentication" 
})
```

**Sample Output:**
```json
{
  "recommendation": "docs",
  "name": "Documentation Librarian",
  "reason": "When you need to look up official documentation, find code examples, understand library APIs, or research best practices",
  "status": "ready"
}
```

---

## Workflows

Workflows are **structured multi-step runs** that coordinate workers in a deterministic sequence. They’re useful when you want **repeatable quality** and predictable resource usage.

### `list_workflows`

List available workflows (built-in).

**Parameters:**

```typescript
{
  format?: "markdown" | "json";
}
```

**Example:**

```bash
list_workflows({})
```

### `run_workflow`

Run a workflow and return a consolidated report.

**Parameters:**

```typescript
{
  workflowId: string;
  task: string;
  autoSpawn?: boolean;
  format?: "markdown" | "json";
  attachments?: Array<{
    type: "image" | "file";
    path?: string;
    base64?: string;
    mimeType?: string;
  }>;
}
```

**Example (Roocode boomerang):**

```bash
run_workflow({
  workflowId: "roocode.boomerang.sequential",
  task: "Implement feature X, ensure tests pass, update docs"
})
```

---

## Configuration

### `list_models`

List models available in your current OpenCode configuration.

**Parameters:**
```typescript
{
  scope?: "configured" | "all";  // Which providers to include
  query?: string;                // Filter by substring
  limit?: number;                // Max results (default: 40)
  format?: "markdown" | "json";  // Output format
}
```

**Example:**
```bash
# List all configured models
list_models({})

# Filter by provider
list_models({ query: "anthropic" })

# JSON output with limit
list_models({ 
  scope: "configured", 
  limit: 10, 
  format: "json" 
})
```

**Sample Output:**
| Model (provider/model) | Name | Ctx | Vision | Attach | Tools | Reason | Status |
|------------------------|------|-----|---------|--------|-------|--------|---------|
| anthropic/claude-opus-4-5 | Claude Opus 4.5 | 200k | no | yes | yes | no | configured |
| zhipuai/glm-4.6v | GLM-4.6 Vision | 128k | yes | yes | yes | no | configured |
| opencode/gpt-5-nano | GPT-5 Nano | 32k | no | yes | yes | no | configured |

### `list_profiles`

List all available worker profiles (built-in + custom from config).

**Parameters:**
```typescript
{
  format?: "markdown" | "json";   // Output format
}
```

**Example:**
```bash
list_profiles({ format: "markdown" })
```

**Sample Output:**
| ID | Name | Model | Vision | Web | Purpose |
|----|------|-------|---------|-----|---------|
| architect | System Architect | auto | no | no | Design systems, plan implementations |
| coder | Code Implementer | auto | no | no | Write, edit, and refactor code |
| docs | Documentation Librarian | auto:docs | no | yes | Research documentation, find examples |
| explorer | Code Explorer | auto:fast | no | no | Quickly search and navigate the codebase |
| memory | Memory Graph Curator | auto | no | yes | Maintain a Neo4j-backed memory graph |
| vision | Vision Analyst | auto:vision | yes | no | Analyze images, screenshots, diagrams |

### `set_profile_model`

Persistently set which model a worker profile uses (writes to orchestrator.json).

**Parameters:**
```typescript
{
  scope: "global" | "project";   // Where to write config
  profileId: string;             // Worker profile ID
  model: string;                 // Model ID (provider/model format)
  name?: string;                 // Required for brand-new profiles
  purpose?: string;               // Required for brand-new profiles
  whenToUse?: string;             // Required for brand-new profiles
  systemPrompt?: string;          // Optional system prompt
  temperature?: number;           // Optional temperature override
  supportsVision?: boolean;      // Mark as vision-capable
  supportsWeb?: boolean;         // Mark as web-capable
  tags?: string[];                // Optional matching tags
}
```

**Example:**
```bash
# Update existing profile
set_profile_model({
  scope: "project",
  profileId: "vision",
  model: "zhipuai/glm-4.6v"
})

# Create custom profile
set_profile_model({
  scope: "project",
  profileId: "ethers-expert",
  model: "anthropic/claude-sonnet-4-5",
  name: "Ethers.js Expert",
  purpose: "Blockchain and Web3 development",
  whenToUse: "When working with smart contracts or Ethers.js",
  supportsWeb: true,
  tags: ["web3", "blockchain", "ethers"]
})
```

### `set_autospawn`

Configure which workers auto-spawn on startup.

**Parameters:**
```typescript
{
  scope: "global" | "project";   // Where to write config
  autoSpawn: boolean;             // Enable/disable auto-spawn
  workers: string[];              // Profile IDs to auto-spawn
}
```

**Example:**
```bash
set_autospawn({
  scope: "project",
  autoSpawn: true,
  workers: ["vision", "docs", "coder"]
})
```

### `autofill_profile_models`

Populate worker profile models using your current OpenCode model and configured providers.

**Parameters:**
```typescript
{
  scope: "global" | "project";   // Where to write config
  profileIds?: string[];          // Which profile IDs to update
  setAgent?: boolean;             // Also set orchestrator agent model
  force?: boolean;                // Override existing models
  showToast?: boolean;            // Show toast notification
}
```

**Example:**
```bash
# First-time setup
autofill_profile_models({ 
  scope: "global",
  setAgent: true 
})

# Update specific profiles
autofill_profile_models({ 
  scope: "project",
  profileIds: ["vision", "docs"],
  force: true 
})
```

### `orchestrator_config`

Show the effective orchestrator configuration (merged global + project) and worker→model mapping.

**Parameters:**
```typescript
{
  format?: "markdown" | "json";   // Output format
}
```

**Example:**
```bash
orchestrator_config({ format: "markdown" })
```

**Sample Output:**
```markdown
# Orchestrator Config

- Global: /Users/user/.config/opencode/orchestrator.json
- Project: .opencode/orchestrator.json

- autoSpawn: true
- spawn: vision, docs, coder
- basePort: 14096
- startupTimeout: 30000ms

## Profiles (worker → model)
| ID | Name | Model | Vision | Web |
|----|------|-------|---------|-----|
| architect | System Architect | anthropic/claude-opus-4-5 | no | no |
| coder | Code Implementer | anthropic/claude-opus-4-5 | no | no |
| docs | Documentation Librarian | anthropic/claude-sonnet-4-5 | no | yes |
| explorer | Code Explorer | opencode/grok-code-fast | no | no |
| memory | Memory Graph Curator | anthropic/claude-opus-4-5 | no | yes |
| vision | Vision Analyst | zhipuai/glm-4.6v | yes | no |
```

### `set_orchestrator_agent`

Configure the injected orchestrator agent (name/model/mode) in orchestrator.json.

**Parameters:**
```typescript
{
  scope: "global" | "project";   // Where to write config
  enabled?: boolean;              // Enable/disable agent injection
  name?: string;                  // Agent name
  model?: string;                 // Agent model
  mode?: "primary" | "subagent";  // Agent mode
  color?: string;                 // Hex color
}
```

**Example:**
```bash
set_orchestrator_agent({
  scope: "project",
  enabled: true,
  name: "orchestrator",
  model: "anthropic/claude-opus-4-5",
  mode: "primary",
  color: "#6495ED"
})
```

---

## Memory (Neo4j)

The memory system provides a Neo4j-backed persistent knowledge graph for storing and retrieving project insights, decisions, and context.

### Environment Setup

```bash
export OPENCODE_NEO4J_URI=bolt://localhost:7687
export OPENCODE_NEO4J_USERNAME=neo4j
export OPENCODE_NEO4J_PASSWORD=your-password
export OPENCODE_NEO4J_DATABASE=opencode  # optional
```

### `memory_put`

Upsert a memory entry into Neo4j.

**Parameters:**
```typescript
{
  scope?: "project" | "global";   // Memory scope (default: project)
  key: string;                    // Stable key (e.g., 'architecture:db')
  value: string;                  // Memory content (concise, no secrets)
  tags?: string[];                // Optional tags
}
```

**Example:**
```bash
# Store architectural decision
memory_put({
  key: "architecture:database",
  value: "Using PostgreSQL with Drizzle ORM for type safety and migrations",
  tags: ["database", "orm", "architecture"]
})

# Store coding standard
memory_put({
  scope: "global",
  key: "preference:testing-style",
  value: "Use Jest with describe/it/expect pattern, arrange-act-assert structure",
  tags: ["testing", "standards"]
})
```

### `memory_link`

Create a relationship between two memory keys in Neo4j.

**Parameters:**
```typescript
{
  scope?: "project" | "global";   // Memory scope
  fromKey: string;                // Source key
  toKey: string;                  // Target key
  type?: string;                  // Relationship type (default: RELATES_TO)
}
```

**Example:**
```bash
# Link architecture to implementation
memory_link({
  fromKey: "architecture:database",
  toKey: "pattern:repository",
  type: "IMPLEMENTS"
})

# Link decision to rationale
memory_link({
  fromKey: "decision:use-postgres",
  toKey: "consideration:scalability"
})
```

### `memory_search`

Search memory graph entries by query.

**Parameters:**
```typescript
{
  scope?: "project" | "global";   // Memory scope
  query: string;                  // Search query
  limit?: number;                 // Max results (default: 10)
  format?: "markdown" | "json";   // Output format
}
```

**Example:**
```bash
# Search for database-related memories
memory_search({ 
  query: "database architecture" 
})

# Search with limit
memory_search({ 
  query: "testing",
  limit: 5,
  format: "json"
})
```

**Sample Output:**
- `architecture:database` (project) [database, orm, architecture]
  - Using PostgreSQL with Drizzle ORM for type safety and migrations
- `decision:use-postgres` (project) [database, decision]
  - Chose PostgreSQL over MongoDB for relational data integrity
- `pattern:repository` (project) [database, pattern]
  - Repository pattern with Drizzle, transaction support per request

### `memory_recent`

List recent memory entries.

**Parameters:**
```typescript
{
  scope?: "project" | "global";   // Memory scope
  limit?: number;                 // Max results (default: 10)
  format?: "markdown" | "json";   // Output format
}
```

**Example:**
```bash
memory_recent({ 
  scope: "project",
  limit: 10 
})
```

**Sample Output:**
- `architecture:auth` (project) - JWT with refresh tokens, 15min access token expiry
- `pattern:error-handling` (project) - Centralized error handler with custom error classes
- `decision:api-versioning` (project) - URL versioning (/v1/, /v2/) with backward compatibility

---

## Help

### `orchestrator_help`

Show help for using the orchestrator plugin (workers, profiles, delegation).

**Parameters:** None

**Example:**
```bash
orchestrator_help()
```

**Output:**
```markdown
# Orchestrator

## Quick start
- `list_models({})` to see your available OpenCode models
- `autofill_profile_models({ scope: 'global' })` to auto-populate profile→model mapping from your current model
- `list_profiles({})` to see what you can spawn
- `spawn_worker({ profileId: 'vision' })` (or `docs`, `coder`, `architect`, `explorer`)
- `list_workers({})` to see running workers
- `delegate_task({ task: '...', requiresVision: true })` to auto-route + run

## Direct messaging
- `ask_worker({ workerId: 'docs', message: 'Find official API docs for ...' })`

## Tips
- Vision tasks: screenshots, diagrams, OCR
- Docs tasks: citations, examples, API lookups
- Coder tasks: implement changes, run commands
```

---

## Common Patterns

### 1. Initial Setup

```bash
# 1. See available models
list_models({})

# 2. Auto-configure profiles
autofill_profile_models({ scope: "global" })

# 3. Check configuration
orchestrator_config({})

# 4. Auto-spawn essential workers
ensure_workers({ profileIds: ["vision", "docs", "coder"] })
```

### 2. Daily Workflow

```bash
# Check what's running
list_workers({})

# Quick task delegation
delegate_task({ 
  task: "Review this PR and check for issues",
  attachments: [/* PR diff */]
})

# Direct research
ask_worker({ 
  workerId: "docs",
  message: "Find the official React Server Components documentation"
})
```

### 3. Memory Management

```bash
# Store important decisions
memory_put({
  key: "decision:microservices",
  value: "Adopting microservices for better scalability and team autonomy",
  tags: ["architecture", "decision"]
})

# Link related concepts
memory_link({
  fromKey: "decision:microservices",
  toKey: "pattern:api-gateway"
})

# Retrieve context
memory_search({ query: "microservices architecture" })
```