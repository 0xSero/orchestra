# Configuration Reference

Complete configuration guide for the Open Orchestra plugin with diagrams and detailed explanations.

## Configuration Resolution

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Configuration Priority Chain                     │
└─────────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────┐
  │  Project Config                        │
  │  .opencode/orchestrator.json or         │
  │  orchestrator.json (repo root)          │
  └──────────┬─────────────────────────────┘
             │ merges with
             ▼
  ┌─────────────────────┐
  │  Global Config      │  ← ~/.opencode/orchestrator.json
  │  (user-wide)        │
  └──────────┬──────────┘
             │ fallback to
             ▼
  ┌─────────────────────┐
  │  Built-in Defaults  │
  └─────────────────────┘
```

Environment variables override specific integrations (Neo4j/Linear/PostHog) and runtime knobs
like skills API port and vision prompt/timeout.

## Config File Locations

| Location | Purpose | Priority |
|----------|---------|----------|
| `.opencode/orchestrator.json` | Project-specific config | High |
| `orchestrator.json` | Project-specific config (repo root) | High |
| `~/.opencode/orchestrator.json` | User-wide defaults | Medium |
| Built-in defaults | Fallback values | Low |

## Full Configuration Schema

```typescript
interface OrchestratorConfigFile {
  // Core Settings
  $schema?: string;
  basePort?: number;                   // Default: 14096
  autoSpawn?: boolean;                 // Auto-spawn workers on startup
  startupTimeout?: number;             // Worker startup timeout (ms)
  healthCheckInterval?: number;        // Health check interval (ms)

  // Worker Management
  spawnOnDemand?: string[];            // Workers allowed for on-demand spawn
  spawnPolicy?: SpawnPolicyConfig;
  profiles?: Array<string | WorkerProfile>; // Profile overrides
  workers?: Array<string | WorkerProfile>;  // Auto-spawn list

  // Health Checks
  healthCheck?: HealthCheckConfig;
  warmPool?: WarmPoolConfig;

  // Model Selection
  modelSelection?: ModelSelectionConfig;
  modelAliases?: Record<string, string>;

  // UI/UX
  ui?: UIConfig;
  notifications?: NotificationsConfig;
  agent?: AgentConfig;
  commands?: CommandsConfig;
  pruning?: PruningConfig;

  // Features
  workflows?: WorkflowsConfig;
  memory?: MemoryConfig;
  security?: SecurityConfig;

  // Integrations
  integrations?: IntegrationsConfig;
  telemetry?: TelemetryConfig;
}
```

Note: the runtime config derives the `spawn` list from `workers` + `spawnPolicy`.

---

## Worker Profiles

### Profile Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│                        WorkerProfile                                 │
├─────────────────────────────────────────────────────────────────────┤
│  id: string              │ Unique identifier (e.g., "docs")        │
│  name: string            │ Human-readable name                      │
│  model: string           │ Model spec (e.g., "anthropic/claude...")│
│  purpose: string         │ What this worker specializes in          │
│  whenToUse: string       │ Routing hints for task delegation        │
├─────────────────────────────────────────────────────────────────────┤
│  Optional Fields                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  providerID?: string     │ Provider override                         │
│  systemPrompt?: string   │ Custom system prompt                      │
│  supportsVision?: bool   │ Can process images                        │
│  supportsWeb?: bool      │ Has web access                            │
│  temperature?: number    │ Model temperature setting                 │
│  injectRepoContext?: bool│ Inject repo context on launch             │
│  sessionMode?: string    │ child | isolated | linked                 │
│  forwardEvents?: string[]│ Linked-mode forwarded events              │
│  mcp?: {...}             │ MCP server forwarding                     │
│  env?: Record<...>       │ Env vars for worker                        │
│  envPrefixes?: string[]  │ Env var prefix passthrough                │
│  tags?: string[]         │ Keywords for routing                      │
│  tools?: Record<...>     │ Tool enable/disable map                   │
│  permissions?: {...}     │ Security constraints                      │
│  extends?: string        │ Inherit from another profile              │
│  compose?: string[]      │ Merge multiple profiles                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Skill Profiles (SKILL.md)

Profiles are defined as skills in `.opencode/skill/{id}/SKILL.md` files (project) or
`~/.opencode/skill/{id}/SKILL.md` (global, or `OPENCODE_SKILLS_HOME`):

```
.opencode/
└── skill/
    ├── memory/
    │   └── SKILL.md
    ├── research/
    │   └── SKILL.md
    ├── builder/
    │   └── SKILL.md
    └── reviewer/
        └── SKILL.md
```

Each SKILL.md file has YAML frontmatter defining the profile:

```markdown
---
name: builder
description: Code implementation specialist
model: node:code
tools:
  read: true
  write: true
  bash: true
tags:
  - implementation
  - coding
---

You are a code implementation specialist...
```

**Model Selection**:
- Direct: `model: anthropic/claude-sonnet-4-20250514`
- Node tags: `model: node:code` (resolved via `modelSelection` in orchestrator.json)

Common optional fields: `supportsVision`, `supportsWeb`, `injectRepoContext`, `sessionMode`, `forwardEvents`,
`mcp`, `env`, `envPrefixes`, `tools`, `permissions`, `tags`, `extends`, `compose`.

### Profile Inheritance

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Profile Inheritance Flow                         │
└─────────────────────────────────────────────────────────────────────┘

  Skill Profile                      Custom Profile
  .opencode/skill/                   .opencode/skill/
  ┌───────────────┐                  ┌───────────────┐
  │ builder/      │                  │ my-builder/   │
  │ SKILL.md      │  ────extends──▶  │ SKILL.md      │
  │   model: ...  │                  │   extends:    │
  │   tools:...   │                  │     "builder" │
  └───────────────┘                  │   model: ...  │ ← override
                                     └───────────────┘
          │
          └──── Base fields inherited unless overridden
```

### Profile Composition

```json
{
  "profiles": [
    {
      "id": "full-stack",
      "compose": ["coder", "architect"],
      "name": "Full-Stack Developer",
      "purpose": "End-to-end development"
    }
  ]
}
```

Note: The default config includes a `glm47-vision-demo` profile used by `/orchestrator.onboard`.
Override its model or disable it via `profiles` overrides if needed.

---

## Spawn Policy

Controls when and how workers can be spawned.

### Policy Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│                      SpawnPolicyConfig                               │
├─────────────────────────────────────────────────────────────────────┤
│  default: {                                                          │
│    autoSpawn: true      │ Allow spawn at startup                    │
│    onDemand: true       │ Allow spawn via delegate_task/routing     │
│    allowManual: true    │ Allow spawn via spawn_worker tool         │
│    warmPool: false      │ Pre-spawn for fast availability           │
│    reuseExisting: true  │ Deprecated (ignored)                      │
│  }                                                                   │
├─────────────────────────────────────────────────────────────────────┤
│  profiles: {                                                         │
│    "vision": {          │ Per-profile overrides                     │
│      onDemand: true     │                                           │
│      autoSpawn: false   │                                           │
│    },                   │                                           │
│    "security": {        │                                           │
│      allowManual: false │ Disable manual spawn                      │
│    }                    │                                           │
│  }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Spawn Policy Flow

```
                    Spawn Request
                         │
                         ▼
              ┌──────────────────┐
              │  Check Policy    │
              │  for workerId    │
              └────────┬─────────┘
                       │
         ┌─────────────┼─────────────┐
         │             │             │
         ▼             ▼             ▼
   ┌──────────┐  ┌──────────┐  ┌──────────┐
   │ autoSpawn│  │ onDemand │  │  manual  │
   │ (startup)│  │(delegate)│  │  (tool)  │
   └────┬─────┘  └────┬─────┘  └────┬─────┘
        │             │             │
        ▼             ▼             ▼
   Check:        Check:        Check:
   spawnPolicy   spawnPolicy   spawnPolicy
   .autoSpawn    .onDemand     .allowManual
        │             │             │
        └─────────────┴─────────────┘
                      │
              ┌───────┴───────┐
              │               │
              ▼               ▼
         ┌────────┐      ┌────────┐
         │ ALLOW  │      │ DENY   │
         │ Spawn  │      │ Error  │
         └────────┘      └────────┘
```

Note: `reuseExisting` is accepted for backward compatibility but currently ignored.

---

## Model Selection

### Selection Modes

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Model Selection Modes                             │
├─────────────────────────────────────────────────────────────────────┤
│  Mode          │ Description                    │ Cost    │ Speed   │
├────────────────┼────────────────────────────────┼─────────┼─────────┤
│  performance   │ Best available models          │ High    │ Fast    │
│  balanced      │ Good quality/cost tradeoff     │ Medium  │ Medium  │
│  economical    │ Minimize costs                 │ Low     │ Slower  │
└─────────────────────────────────────────────────────────────────────┘
```

### Configuration

```json
{
  "modelSelection": {
    "mode": "balanced",
    "maxCostPer1kTokens": 0.015,
    "preferredProviders": ["anthropic", "openai"]
  },
  "modelAliases": {
    "fast": "anthropic/claude-3-5-haiku-20241022",
    "smart": "anthropic/claude-sonnet-4-20250514",
    "vision": "anthropic/claude-sonnet-4-20250514"
  }
}
```

---

## Health Check Configuration

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Health Check Flow                               │
└─────────────────────────────────────────────────────────────────────┘

    ┌─────────┐    intervalMs    ┌─────────────┐
    │ Worker  │◀────────────────│ Health Loop │
    │ Running │                  └──────┬──────┘
    └────┬────┘                         │
         │                              │
         │ /health                      │
         ▼                              │
    ┌─────────┐                         │
    │ Respond │   ──timeoutMs──▶   ┌────┴─────┐
    │  200 OK │                    │ Timeout? │
    └────┬────┘                    └────┬─────┘
         │                              │
         │                    ┌─────────┴─────────┐
         │                    │                   │
         ▼                    ▼                   ▼
    ┌─────────┐          ┌─────────┐        ┌──────────┐
    │ Healthy │          │  Retry  │────────│maxRetries│
    └─────────┘          │(count++)│        │ exceeded │
                         └─────────┘        └────┬─────┘
                                                 │
                                                 ▼
                                            ┌─────────┐
                                            │  Error  │
                                            │ Status  │
                                            └─────────┘
```

### Configuration

```json
{
  "healthCheck": {
    "enabled": true,
    "intervalMs": 30000,
    "timeoutMs": 3000,
    "maxRetries": 3
  }
}
```

---

## UI Configuration

### Options

```json
{
  "ui": {
    "toasts": true,                    // Show OpenCode toasts
    "injectSystemContext": true,       // Inject workers into prompt
    "systemContextMaxWorkers": 12,     // Max workers in context
    "defaultListFormat": "markdown",   // "markdown" | "json"
    "debug": false,                    // Debug logging
    "logToConsole": false,             // Console output
    "firstRunDemo": true,              // Run demo on first use
    "wakeupInjection": true            // Inject wakeup prompts
  }
}
```

### System Context Injection

```
┌─────────────────────────────────────────────────────────────────────┐
│                  System Context Injection                            │
└─────────────────────────────────────────────────────────────────────┘

    User Message                    System Prompt Modification
         │                                    │
         ▼                                    ▼
  ┌─────────────┐                   ┌─────────────────────┐
  │  "Fix the   │                   │ "Available workers: │
  │   tests"    │                   │  - coder: coding    │
  │             │                   │  - qa: testing      │
  └──────┬──────┘                   │  - reviewer: review │
         │                          │ Use spawn_worker,   │
         └──────────────────────────│ ask_worker, etc."   │
                                    └─────────────────────┘
                                              │
                                              ▼
                                    ┌─────────────────────┐
                                    │   LLM receives      │
                                    │   worker context    │
                                    │   for delegation    │
                                    └─────────────────────┘
```

---

## Memory Configuration

### Memory System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Memory Configuration                           │
└─────────────────────────────────────────────────────────────────────┘

                         MemoryConfig
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
    ┌─────────┐          ┌─────────┐         ┌─────────┐
    │ Storage │          │  Scope  │         │Injection│
    │ Options │          │ Options │         │ Options │
    └────┬────┘          └────┬────┘         └────┬────┘
         │                    │                   │
         │                    ▼                   │
         │           ┌─────────────────┐          │
         │           │    "project"    │          │
         │           │  or "global"    │          │
         │           └─────────────────┘          │
         │                                        │
         ▼                                        ▼
  ┌─────────────────┐                   ┌─────────────────┐
  │   File Store    │                   │  Auto-Inject    │
  │      or         │                   │  summaries to   │
  │   Neo4j Graph   │                   │  system prompt  │
  └─────────────────┘                   └─────────────────┘
```

### Full Memory Config

```json
{
  "memory": {
    "enabled": true,
    "autoSpawn": true,              // Auto-spawn memory worker
    "autoRecord": true,              // Record messages automatically
    "autoInject": true,              // Inject into prompts
    "scope": "project",              // "project" | "global"

    "maxChars": 2000,                // Max per message snippet

    "summaries": {
      "enabled": true,
      "sessionMaxChars": 2000,
      "projectMaxChars": 2000
    },

    "trim": {
      "maxMessagesPerSession": 60,
      "maxMessagesPerProject": 400,
      "maxMessagesGlobal": 2000,
      "maxProjectsGlobal": 25
    },

    "inject": {
      "maxChars": 2000,
      "maxEntries": 8,
      "includeMessages": false,
      "includeSessionSummary": true,
      "includeProjectSummary": true,
      "includeGlobal": true,
      "maxGlobalEntries": 3
    }
  }
}
```

---

## Workflow Configuration

### Workflow Engine Settings

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Workflow Execution Flow                           │
└─────────────────────────────────────────────────────────────────────┘

   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
   │  Step 1  │───▶│  Step 2  │───▶│  Step 3  │───▶│  Step N  │
   │ architect│    │  coder   │    │ reviewer │    │   ...    │
   └────┬─────┘    └────┬─────┘    └────┬─────┘    └──────────┘
        │               │               │
        │  {carry}      │  {carry}      │
        └───────────────┴───────────────┘
                        │
               Template Substitution
               {task} → initial task
               {carry} → previous output
```

### Configuration

```json
{
  "workflows": {
    "enabled": true,
    "roocodeBoomerang": {
      "enabled": true,
      "maxSteps": 4,
      "maxTaskChars": 12000,
      "maxCarryChars": 24000,
      "perStepTimeoutMs": 120000,
      "steps": [
        {
          "id": "plan",
          "title": "Planning",
          "workerId": "architect",
          "prompt": "Analyze: {task}",
          "carry": true
        },
        {
          "id": "implement",
          "title": "Implementation",
          "workerId": "coder",
          "prompt": "Based on plan: {carry}\n\nImplement: {task}",
          "carry": true
        },
        {
          "id": "review",
          "title": "Review",
          "workerId": "reviewer",
          "prompt": "Review implementation: {carry}",
          "carry": false
        }
      ]
    }
  }
}
```

---

## Security Configuration

### Workflow Security Limits

```json
{
  "security": {
    "workflows": {
      "maxSteps": 4,               // Prevent infinite loops
      "maxTaskChars": 12000,       // Limit input size
      "maxCarryChars": 24000,      // Limit context growth
      "perStepTimeoutMs": 120000   // 2 min per step
    }
  }
}
```

### Tool Permissions

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Tool Permissions Model                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌─────────────────────────────────────────────────┐               │
│   │                  Categories                      │               │
│   ├─────────────────────────────────────────────────┤               │
│   │  filesystem: "full" | "read" | "none"           │               │
│   │  execution:  "full" | "sandboxed" | "none"      │               │
│   │  network:    "full" | "localhost" | "none"      │               │
│   └─────────────────────────────────────────────────┘               │
│                                                                      │
│   ┌─────────────────────────────────────────────────┐               │
│   │                Per-Tool Config                   │               │
│   ├─────────────────────────────────────────────────┤               │
│   │  tools: {                                        │               │
│   │    "Write": { enabled: true, constraints: {} }, │               │
│   │    "Bash":  { enabled: false },                 │               │
│   │  }                                              │               │
│   └─────────────────────────────────────────────────┘               │
│                                                                      │
│   ┌─────────────────────────────────────────────────┐               │
│   │                  Path Rules                      │               │
│   ├─────────────────────────────────────────────────┤               │
│   │  paths: {                                        │               │
│   │    allowed: ["/project/src/**"],                │               │
│   │    denied:  ["/etc/**", "/home/**/.ssh/**"]     │               │
│   │  }                                              │               │
│   └─────────────────────────────────────────────────┘               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Context Pruning

Reduces context size by trimming completed tool outputs.

```json
{
  "pruning": {
    "enabled": true,
    "maxToolOutputChars": 1000,    // Truncate tool outputs
    "maxToolInputChars": 500,      // Truncate tool inputs
    "protectedTools": [            // Never prune these
      "task",
      "todowrite",
      "todoread"
    ]
  }
}
```

---

## Integrations

### Neo4j (Memory Graph)

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Neo4j Integration                               │
└─────────────────────────────────────────────────────────────────────┘

   Environment Variables (Highest Priority)
   ┌────────────────────────────────────────┐
   │ OPENCODE_NEO4J_URI=bolt://localhost... │
   │ OPENCODE_NEO4J_USERNAME=neo4j          │
   │ OPENCODE_NEO4J_PASSWORD=...            │
   │ OPENCODE_NEO4J_DATABASE=opencode       │
   └────────────────────────────────────────┘
                      │
                      ▼ fallback
   Config File
   ┌────────────────────────────────────────┐
   │ "integrations": {                      │
   │   "neo4j": {                           │
   │     "enabled": true,                   │
   │     "uri": "bolt://localhost:7687",    │
   │     "username": "neo4j",               │
   │     "password": "...",                 │
   │     "database": "opencode"             │
   │   }                                    │
   │ }                                      │
   └────────────────────────────────────────┘
```

### Linear Integration

```json
{
  "integrations": {
    "linear": {
      "enabled": true,
      "apiKey": "lin_api_...",        // or LINEAR_API_KEY env
      "teamId": "TEAM-123",
      "apiUrl": "https://api.linear.app",
      "projectPrefix": "PROJ"
    }
  }
}
```

### Monitoring

```json
{
  "integrations": {
    "monitoring": {
      "enabled": true,
      "port": 9090,
      "metricsPath": "/metrics"
    }
  }
}
```

---

## Telemetry

```json
{
  "telemetry": {
    "enabled": true,
    "apiKey": "phc_...",              // or POSTHOG_API_KEY env
    "host": "https://us.i.posthog.com"
  }
}
```

---

## Agent Injection

Inject a custom agent into OpenCode's agent system.

```json
{
  "agent": {
    "enabled": true,
    "name": "orchestrator",
    "model": "anthropic/claude-sonnet-4-20250514",
    "prompt": "You are an orchestration agent...",
    "mode": "primary",               // "primary" | "subagent"
    "color": "#6366f1",
    "applyToBuild": false            // Override build agent too?
  }
}
```

---

## Command Shortcuts

```json
{
  "commands": {
    "enabled": true,
    "prefix": "orchestrator."        // Command name prefix
  }
}
```

Generated commands:
- `orchestrator.status` - Show workers and profiles
- `orchestrator.spawn` - Spawn a worker
- `orchestrator.demo` - Run demo workflow
- `orchestrator.onboard` - Run the 5-minute onboarding flow
- `vision.analyze` - Analyze clipboard or file image
- `memory.record` - Record a memory entry
- `memory.query` - Query memory entries

---

## Notifications

```json
{
  "notifications": {
    "idle": {
      "enabled": true,
      "title": "Workers Idle",
      "message": "All workers are idle and ready",
      "delayMs": 1500
    }
  }
}
```

---

## Warm Pool

Pre-spawn workers for fast availability.

```json
{
  "warmPool": {
    "enabled": true,
    "profiles": {
      "coder": {
        "size": 2,                   // Keep 2 ready
        "idleTimeoutMs": 300000      // 5 min idle timeout
      },
      "vision": {
        "size": 1,
        "idleTimeoutMs": 600000
      }
    }
  }
}
```

---

## Complete Example

```json
{
  "$schema": "./schema/orchestrator.schema.json",

  "basePort": 14096,
  "autoSpawn": true,

  // Profiles are loaded from .opencode/skill/{id}/SKILL.md
  // Config overrides can be specified here:
  "profiles": [
    {
      "id": "builder",
      "temperature": 0.3
    },
    {
      "id": "custom-reviewer",
      "extends": "reviewer",
      "model": "anthropic/claude-sonnet-4-20250514"
    }
  ],

  // Workers to auto-spawn (must exist as skills)
  "workers": ["memory", "builder", "custom-reviewer"],

  "spawnOnDemand": ["vision", "research"],

  "spawnPolicy": {
    "default": {
      "autoSpawn": true,
      "onDemand": true,
      "allowManual": true
    },
    "profiles": {
      "security": {
        "allowManual": false
      }
    }
  },

  "modelSelection": {
    "mode": "balanced"
  },

  "ui": {
    "toasts": true,
    "injectSystemContext": true,
    "debug": false
  },

  "memory": {
    "enabled": true,
    "scope": "project",
    "autoRecord": true,
    "autoInject": true
  },

  "workflows": {
    "enabled": true
  },

  "integrations": {
    "neo4j": {
      "enabled": true
    }
  }
}
```

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `OPENCODE_NEO4J_URI` | Neo4j connection URI |
| `OPENCODE_NEO4J_USERNAME` | Neo4j username |
| `OPENCODE_NEO4J_PASSWORD` | Neo4j password |
| `OPENCODE_NEO4J_DATABASE` | Neo4j database name |
| `LINEAR_API_KEY` | Linear API key |
| `LINEAR_TEAM_ID` | Linear team ID |
| `LINEAR_API_URL` | Linear API URL override |
| `LINEAR_PROJECT_PREFIX` | Linear project prefix |
| `POSTHOG_API_KEY` | PostHog telemetry key |
| `OPENCODE_SKILLS_PORT` | Skills/DB/Sessions API port (default 4097) |
| `OPENCODE_SKILLS_API_PORT` | Alias for `OPENCODE_SKILLS_PORT` |
| `OPENCODE_SKILLS_HOME` | Alternate home for global skills directory |
| `OPENCODE_VISION_PROMPT` | Override vision analysis prompt |
| `OPENCODE_VISION_TIMEOUT_MS` | Override vision timeout (ms) |
| `OPENCODE_ORCHESTRATOR_WORKER` | Set to "1" in worker processes |
| `VITE_SKILLS_API_BASE` | Control panel base URL for skills/DB API |

---

## Frontend App Configuration

The control panel connects to OpenCode at `http://localhost:4096` and to the Skills/DB API at
`http://localhost:4097` by default. Override the skills API base with `VITE_SKILLS_API_BASE`. To change
the OpenCode base URL, pass a custom `baseUrl` into `OpenCodeProvider` or update `app/src/context/opencode.tsx`.

```bash
# Override the Skills/DB API base
VITE_SKILLS_API_BASE=http://localhost:4097
```

Run the app:

```bash
cd app
bun install
bun run dev
```
