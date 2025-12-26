# Configuration Reference

Complete configuration guide for Open Orchestra with diagrams and detailed explanations.

## Configuration Resolution

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Configuration Priority Chain                     │
└─────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────┐
  │   Environment Vars   │  ← Highest priority (secrets, overrides)
  └──────────┬──────────┘
             │
             ▼
  ┌─────────────────────┐
  │  Project Config     │  ← .opencode/orchestrator.json
  │  (local to repo)    │
  └──────────┬──────────┘
             │ merges with
             ▼
  ┌─────────────────────┐
  │  Global Config      │  ← ~/.opencode/orchestrator.json
  │  (user-wide)        │
  └──────────┬──────────┘
             │ fallback to
             ▼
  ┌─────────────────────┐
  │  Built-in Defaults  │  ← Lowest priority
  └─────────────────────┘
```

## Config File Locations

| Location | Purpose | Priority |
|----------|---------|----------|
| `.opencode/orchestrator.json` | Project-specific config | High |
| `~/.opencode/orchestrator.json` | User-wide defaults | Medium |
| Built-in defaults | Fallback values | Low |

## Full Configuration Schema

```typescript
interface OrchestratorConfig {
  // Core Settings
  basePort: number;                    // Default: 4097
  autoSpawn: boolean;                  // Auto-spawn workers on startup
  startupTimeout: number;              // Worker startup timeout (ms)
  healthCheckInterval: number;         // Health check interval (ms)

  // Worker Management
  spawn: string[];                     // Workers to auto-spawn
  spawnOnDemand?: string[];            // Workers allowed for on-demand spawn
  profiles: Record<string, WorkerProfile>;
  spawnPolicy?: SpawnPolicyConfig;

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
│  systemPrompt?: string   │ Custom system prompt                     │
│  supportsVision?: bool   │ Can process images                       │
│  supportsWeb?: bool      │ Has web access                           │
│  temperature?: number    │ Model temperature setting                │
│  tags?: string[]         │ Keywords for routing                     │
│  tools?: Record<...>     │ Tool enable/disable map                  │
│  permissions?: {...}     │ Security constraints                     │
│  extends?: string        │ Inherit from another profile             │
│  compose?: string[]      │ Merge multiple profiles                  │
└─────────────────────────────────────────────────────────────────────┘
```

### Built-in Profiles

| ID | Name | Purpose | Vision | Web |
|----|------|---------|--------|-----|
| `vision` | Vision | Image analysis, screenshots, diagrams | ✓ | - |
| `docs` | Documentation | README, technical docs, comments | - | - |
| `coder` | Coder | Code implementation, refactoring | - | - |
| `architect` | Architect | System design, architecture | - | - |
| `explorer` | Explorer | Codebase navigation, discovery | - | - |
| `memory` | Memory | Long-term context management | - | - |
| `reviewer` | Reviewer | Code review, PR feedback | - | - |
| `qa` | QA | Testing, quality assurance | - | - |
| `security` | Security | Security analysis, vulnerabilities | - | - |
| `product` | Product | Product specs, user stories | - | - |
| `analyst` | Analyst | Data analysis, insights | - | - |

### Profile Inheritance

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Profile Inheritance Flow                         │
└─────────────────────────────────────────────────────────────────────┘

  Built-in Profile                    Custom Profile
  ┌───────────────┐                  ┌───────────────┐
  │   "coder"     │                  │   "my-coder"  │
  │   id: coder   │  ────extends──▶  │   extends:    │
  │   model: ...  │                  │     "coder"   │
  │   purpose:... │                  │   model: ...  │ ← override
  └───────────────┘                  └───────────────┘
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
    "timeoutMs": 5000,
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
    "systemContextMaxWorkers": 5,      // Max workers in context
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
    "autoRecord": true,              // Record messages automatically
    "autoInject": true,              // Inject into prompts
    "scope": "project",              // "project" | "global"

    "maxChars": 2000,                // Max per message snippet

    "summaries": {
      "enabled": true,
      "sessionMaxChars": 4000,
      "projectMaxChars": 8000
    },

    "trim": {
      "maxMessagesPerSession": 100,
      "maxMessagesPerProject": 500,
      "maxMessagesGlobal": 2000,
      "maxProjectsGlobal": 20
    },

    "inject": {
      "maxChars": 4000,
      "maxEntries": 10,
      "includeMessages": true,
      "includeSessionSummary": true,
      "includeProjectSummary": true,
      "includeGlobal": false,
      "maxGlobalEntries": 5
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
      "maxSteps": 6,
      "maxTaskChars": 4000,
      "maxCarryChars": 8000,
      "perStepTimeoutMs": 300000,
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
      "maxSteps": 10,              // Prevent infinite loops
      "maxTaskChars": 10000,       // Limit input size
      "maxCarryChars": 20000,      // Limit context growth
      "perStepTimeoutMs": 600000   // 10 min per step
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
      "Read",
      "Glob",
      "Grep"
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
- `orchestrator.spawn` - Spawn a worker
- `orchestrator.list` - List workers
- `orchestrator.demo` - Run demo workflow

---

## Notifications

```json
{
  "notifications": {
    "idle": {
      "enabled": true,
      "title": "Workers Idle",
      "message": "All workers are idle and ready",
      "delayMs": 5000
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

  "basePort": 4097,
  "autoSpawn": true,

  "profiles": [
    "docs",
    "coder",
    {
      "id": "custom-reviewer",
      "extends": "reviewer",
      "model": "anthropic/claude-sonnet-4-20250514",
      "temperature": 0.3
    }
  ],

  "workers": ["docs", "coder", "custom-reviewer"],

  "spawnOnDemand": ["vision", "architect"],

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
| `POSTHOG_API_KEY` | PostHog telemetry key |
| `VITE_OPENCODE_BASE_URL` | Frontend API base URL |
| `OPENCODE_ORCHESTRATOR_WORKER` | Set to "1" in worker processes |

---

## Frontend App Configuration

The control panel app connects to OpenCode via the SDK.

```bash
# Set when OpenCode isn't at /api
VITE_OPENCODE_BASE_URL=http://localhost:4096
```

Run the app:

```bash
cd app
bun install
bun run dev
```
