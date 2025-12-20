# Configuration Guide

This guide covers all aspects of configuring Open Orchestra, from basic setup to advanced customization.

## Table of Contents

- [Configuration Overview](#configuration-overview)
- [Configuration Files](#configuration-files)
- [Profile Configuration](#profile-configuration)
- [Built-in Profiles](#built-in-profiles)
- [Custom Profiles](#custom-profiles)
- [Model Resolution](#model-resolution)
- [Advanced Configuration](#advanced-configuration)
- [Configuration Examples](#configuration-examples)

---

## Configuration Overview

Open Orchestra uses a layered configuration system:

1. **Global config** - `~/.config/opencode/orchestrator.json`
2. **Project config** - `.opencode/orchestrator.json` (preferred)
3. **Fallback** - `orchestrator.json` in project root

Configs are deeply merged with project settings taking precedence over global settings.

### Configuration Schema

```json
{
  "$schema": "./node_modules/opencode-orchestrator/schema/orchestrator.schema.json",
  "basePort": 14096,
  "autoSpawn": true,
  "startupTimeout": 30000,
  "healthCheckInterval": 30000,
  
  "ui": {
    "toasts": true,
    "injectSystemContext": true,
    "systemContextMaxWorkers": 12,
    "defaultListFormat": "markdown"
  },
  
  "agent": {
    "enabled": true,
    "name": "orchestrator",
    "model": "provider/model",
    "mode": "primary",
    "color": "#6495ED"
  },
  
  "pruning": {
    "enabled": false,
    "maxToolOutputChars": 12000,
    "maxToolInputChars": 4000,
    "protectedTools": ["task", "todowrite", "todoread"]
  },
  
  "workflows": {
    "enabled": true,
    "allow": ["roocode.boomerang.sequential"],
    "roocodeBoomerang": {
      "enabled": true,
      "maxSteps": 4,
      "perStepTimeoutMs": 120000,
      "maxTaskChars": 12000,
      "maxCarryChars": 24000
    }
  },

  "security": {
    "blockSecretsInMemory": true,
    "attachments": {
      "allowFileAttachments": false,
      "maxFileBytes": 10485760,
      "maxBase64Chars": 14680064,
      "maxAttachments": 8
    }
  },
  
  "profiles": [...],
  "workers": [...]
}
```

---

## Configuration Files

### 1. OpenCode Plugin Configuration

First, add the orchestrator to your OpenCode config:

```json
// ~/.config/opencode/opencode.json or project opencode.json
{
  "plugin": ["opencode-orchestrator"]
}
```

### 2. Global Configuration

Create global defaults:

```json
// ~/.config/opencode/orchestrator.json
{
  "$schema": "./node_modules/opencode-orchestrator/schema/orchestrator.schema.json",
  "autoSpawn": true,
  "workers": ["vision", "docs"],
  "profiles": [
    {
      "id": "global-vision",
      "name": "Global Vision Worker",
      "model": "auto:vision",
      "purpose": "Global vision analysis settings",
      "whenToUse": "Use for all projects unless overridden"
    }
  ]
}
```

### 3. Project Configuration

Create project-specific settings:

```json
// .opencode/orchestrator.json (recommended)
{
  "$schema": "../../node_modules/opencode-orchestrator/schema/orchestrator.schema.json",
  "autoSpawn": true,
  "workers": ["vision", "docs", "coder", "explorer"],
  "basePort": 15000,
  
  "profiles": [
    {
      "id": "project-coder",
      "model": "anthropic/claude-opus-4-5",
      "systemPrompt": "You are working on a Next.js project with TypeScript. Follow the existing patterns."
    }
  ],
  
  "agent": {
    "enabled": true,
    "name": "project-orchestrator"
  }
}
```

---

## Profile Configuration

Profiles define worker types, their models, capabilities, and behavior.

### Profile Fields

```typescript
interface WorkerProfile {
  id: string;              // Unique identifier
  name: string;            // Display name
  model: string;           // Model ID or "auto:*" tag
  purpose: string;         // One-line description
  whenToUse: string;       // Usage guidance
  
  // Optional overrides
  systemPrompt?: string;   // Custom system prompt
  temperature?: number;    // Temperature 0-2
  supportsVision?: boolean; // Vision capability
  supportsWeb?: boolean;   // Web access
  tags?: string[];         // Search tags
  
  // Spawning
  port?: number;          // Fixed port (optional)
  startupTimeout?: number; // Startup timeout
}
```

### Model Tags

Instead of specific models, you can use tags:

- `auto` - Use current/default model
- `auto:vision` - Auto-select best vision model
- `auto:docs` - Auto-select model with web access
- `auto:fast` - Auto-select fastest model

---

## Built-in Profiles

Open Orchestra includes 6 built-in profiles:

### Vision Analyst
```json
{
  "id": "vision",
  "name": "Vision Analyst",
  "model": "auto:vision",
  "purpose": "Analyze images, screenshots, diagrams, and visual content",
  "whenToUse": "When you need to understand visual content",
  "supportsVision": true
}
```

### Documentation Librarian
```json
{
  "id": "docs",
  "name": "Documentation Librarian",
  "model": "auto:docs",
  "purpose": "Research documentation, find examples, explain APIs",
  "whenToUse": "When you need to look up official documentation",
  "supportsWeb": true
}
```

### Code Implementer
```json
{
  "id": "coder",
  "name": "Code Implementer",
  "model": "auto",
  "purpose": "Write, edit, and refactor code with full tool access",
  "whenToUse": "When you need to actually write or modify code"
}
```

### System Architect
```json
{
  "id": "architect",
  "name": "System Architect",
  "model": "auto",
  "purpose": "Design systems, plan implementations, review architecture",
  "whenToUse": "When you need to plan a complex feature"
}
```

### Code Explorer
```json
{
  "id": "explorer",
  "name": "Code Explorer",
  "model": "auto:fast",
  "purpose": "Quickly search and navigate the codebase",
  "whenToUse": "When you need to quickly find files"
}
```

### Memory Graph Curator
```json
{
  "id": "memory",
  "name": "Memory Graph Curator",
  "model": "auto",
  "purpose": "Maintain a Neo4j-backed memory graph",
  "whenToUse": "When you want to record durable project knowledge",
  "supportsWeb": true
}
```

---

## Custom Profiles

You can extend Open Orchestra with custom profiles for specific domains.

### Example 1: Web3 Expert

```json
{
  "profiles": [
    {
      "id": "web3-expert",
      "name": "Web3 Expert",
      "model": "anthropic/claude-opus-4-5",
      "purpose": "Smart contract development and Web3 integration",
      "whenToUse": "When working with blockchain, DeFi, or NFTs",
      "supportsWeb": true,
      "tags": ["web3", "blockchain", "smart-contracts", "solidity"],
      "systemPrompt": "You are a Web3 expert specializing in Solidity, Ethers.js, and DeFi protocols. Always consider gas optimization and security best practices.",
      "temperature": 0.1
    }
  ]
}
```

### Example 2: DevOps Specialist

```json
{
  "profiles": [
    {
      "id": "devops",
      "name": "DevOps Specialist",
      "model": "anthropic/claude-sonnet-4-5",
      "purpose": "CI/CD pipelines, Docker, Kubernetes, and infrastructure",
      "whenToUse": "When setting up deployment or infrastructure",
      "tags": ["devops", "docker", "kubernetes", "cicd"],
      "systemPrompt": "You are a DevOps specialist. Focus on security, scalability, and maintainability. Provide complete, ready-to-use configurations.",
      "supportsWeb": true
    }
  ]
}
```

### Example 3: Database Expert

```json
{
  "profiles": [
    {
      "id": "db-expert",
      "name": "Database Expert",
      "model": "anthropic/claude-opus-4-5",
      "purpose": "Database design, queries, and optimization",
      "whenToUse": "When designing schemas or optimizing queries",
      "tags": ["database", "sql", "optimization"],
      "systemPrompt": "You are a database expert. Consider normalization, indexing strategies, and query performance. Suggest EXPLAIN plans when relevant."
    }
  ]
}
```

---

## Model Resolution

Open Orchestra automatically resolves model references:

### Resolution Order

1. **Explicit model** - `"anthropic/claude-opus-4-5"`
2. **Auto tag** - `"auto:vision"` picks best vision model
3. **Current model** - Uses last used model in session
4. **Fallback** - Defaults to `"opencode/gpt-5-nano"`

### Auto Model Selection

Based on provider capabilities:

```typescript
// Vision model selection
const visionModel = catalog
  .filter(m => m.capabilities?.input?.image)
  .sort((a, b) => (b.limit?.context || 0) - (a.limit?.context || 0))[0];

// Web model selection  
const webModel = catalog
  .filter(m => m.capabilities?.attachment?.web)
  .sort((a, b) => b.name.localeCompare(a.name))[0];

// Fast model selection
const fastModel = catalog
  .sort((a, b) => (a.limit?.rpm || 0) - (b.limit?.rpm || 0))[0];
```

### Setting Models via API

```bash
# Set specific model
set_profile_model({
  scope: "project",
  profileId: "vision",
  model: "zhipuai/glm-4.6v"
})

# Auto-configure all profiles
autofill_profile_models({
  scope: "global",
  setAgent: true,
  force: false
})
```

---

## Advanced Configuration

### UI Settings

```json
{
  "ui": {
    "toasts": true,                    // Show toast notifications
    "injectSystemContext": true,       // Inject worker info into chat
    "systemContextMaxWorkers": 12,     // Max workers to show in context
    "defaultListFormat": "markdown"   // Default output format
  }
}
```

### Agent Configuration

```json
{
  "agent": {
    "enabled": true,               // Enable agent injection
    "name": "orchestrator",        // Agent name
    "model": "provider/model",      // Agent model
    "mode": "primary",            // "primary" or "subagent"
    "color": "#6495ED"            // UI color
  }
}
```

### Context Pruning

For long sessions, enable context pruning:

```json
{
  "pruning": {
    "enabled": true,
    "maxToolOutputChars": 12000,  // Truncate outputs > 12KB
    "maxToolInputChars": 4000,     // Truncate inputs > 4KB
    "protectedTools": [            // Never prune these
      "task",
      "todowrite", 
      "todoread"
    ]
  }
}
```

### Port Configuration

```json
{
  "basePort": 14096,           // Base port for dynamic allocation
  "startupTimeout": 30000,     // Worker startup timeout (ms)
  "healthCheckInterval": 30000 // Health check interval (ms)
}
```

---

## Configuration Examples

### 1. Minimal Setup

```json
{
  "autoSpawn": true,
  "workers": ["vision", "coder"]
}
```

### 2. Web Development Project

```json
{
  "$schema": "./node_modules/opencode-orchestrator/schema/orchestrator.schema.json",
  "autoSpawn": true,
  "workers": ["vision", "docs", "coder", "explorer"],
  
  "profiles": [
    {
      "id": "react-expert",
      "model": "anthropic/claude-opus-4-5",
      "systemPrompt": "You are a React/Next.js expert. Follow modern patterns, use TypeScript, and prioritize accessibility.",
      "tags": ["react", "nextjs", "typescript"]
    },
    {
      "id": "css-specialist",
      "model": "anthropic/claude-sonnet-4-5",
      "systemPrompt": "You are a CSS specialist. Use modern CSS, Tailwind CSS, and responsive design principles.",
      "tags": ["css", "tailwind", "design"]
    }
  ],
  
  "agent": {
    "enabled": true,
    "name": "dev-assistant"
  }
}
```

### 3. Data Science Project

```json
{
  "autoSpawn": true,
  "workers": ["docs", "coder"],
  "basePort": 15000,
  
  "profiles": [
    {
      "id": "python-expert",
      "model": "anthropic/claude-opus-4-5",
      "purpose": "Python data science and ML development",
      "whenToUse": "For pandas, NumPy, scikit-learn, PyTorch work",
      "systemPrompt": "You are a Python data science expert. Use type hints, write docstrings, and include example usage.",
      "supportsWeb": true,
      "temperature": 0.2
    },
    {
      "id": "sql-analyst",
      "model": "anthropic/claude-sonnet-4-5",
      "purpose": "SQL queries and database analysis",
      "whenToUse": "For complex SQL queries and database optimization",
      "systemPrompt": "Write efficient, readable SQL. Consider indexing strategies and query plans."
    }
  ],
  
  "pruning": {
    "enabled": true,
    "maxToolOutputChars": 8000
  }
}
```

### 4. Enterprise Configuration

```json
{
  "$schema": "./node_modules/opencode-orchestrator/schema/orchestrator.schema.json",
  "autoSpawn": false,
  "basePort": 20000,
  "startupTimeout": 60000,
  
  "ui": {
    "toasts": true,
    "injectSystemContext": false,
    "defaultListFormat": "json"
  },
  
  "agent": {
    "enabled": true,
    "name": "enterprise-orchestrator",
    "model": "anthropic/claude-opus-4-5",
    "mode": "primary"
  },
  
  "profiles": [
    {
      "id": "security-reviewer",
      "name": "Security Reviewer",
      "model": "anthropic/claude-opus-4-5",
      "purpose": "Security code review and vulnerability assessment",
      "whenToUse": "Before deploying to production",
      "systemPrompt": "You are a security expert. Focus on OWASP Top 10, input validation, authentication, and authorization.",
      "tags": ["security", "review", "owasp"]
    },
    {
      "id": "performance-analyst",
      "name": "Performance Analyst",
      "model": "anthropic/claude-opus-4-5",
      "purpose": "Performance optimization and profiling",
      "whenToUse": "When optimizing for speed and resources",
      "tags": ["performance", "optimization"]
    }
  ],
  
  "pruning": {
    "enabled": true,
    "maxToolOutputChars": 10000,
    "maxToolInputChars": 5000
  }
}
```

---

## Configuration Commands

### Check Current Configuration

```bash
# Show effective configuration
orchestrator_config({})

# Show in JSON format
orchestrator_config({ format: "json" })
```

### Update Configuration

```bash
# Set up models automatically
autofill_profile_models({ scope: "global" })

# Configure auto-spawn
set_autospawn({
  scope: "project",
  autoSpawn: true,
  workers: ["vision", "docs", "coder"]
})

# Update specific profile
set_profile_model({
  scope: "project",
  profileId: "vision",
  model: "zhipuai/glm-4.6v"
})
```

### List Available Options

```bash
# List all models
list_models({ scope: "configured" })

# List all profiles
list_profiles({})

# List running workers
list_workers({})
```

---

## Best Practices

1. **Use project configs** for team-specific settings
2. **Use global configs** for personal preferences
3. **Leverage auto-tags** (`auto:vision`, `auto:docs`) for flexibility
4. **Create custom profiles** for your domain
5. **Enable pruning** for long-running sessions
6. **Set reasonable timeouts** for slower models
7. **Document custom system prompts** for team alignment

---

## Troubleshooting

### Common Issues

1. **Model not found**: Use `list_models({})` to see available models
2. **Port conflicts**: Use `basePort` to avoid conflicts
3. **Timeouts**: Increase `startupTimeout` for slower models
4. **Memory errors**: Decrease context limits or enable pruning

### Debug Commands

```bash
# Check configuration sources
orchestrator_config({ format: "json" })

# Test model availability
list_models({ query: "anthropic" })

# Check worker status
list_workers({ format: "json" })

# Test profile resolution
list_profiles({ format: "json" })
```