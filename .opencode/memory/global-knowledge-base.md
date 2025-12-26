# OpenCode Boomerang - Global Memory Graph Knowledge Base
# Stored: 2025-12-26
# Scope: Global

## Project Identity
- **Name**: opencode-boomerang
- **Version**: 0.2.3
- **Type**: OpenCode Plugin + Control Panel UI
- **Scope**: Global
- **Created**: 2025-12-26

## Project Overview
**Purpose**: Multi-agent orchestration system that enables spawning, managing, and coordinating specialized AI workers through a hub-and-spoke architecture.

**Key Value**: Instead of using a single AI for everything, Open Orchestra lets you use specialized workers optimized for specific tasks.

## Technology Stack

### Backend Technologies
- **Runtime**: Bun (Node.js alternative)
- **Language**: TypeScript (strict configuration)
- **Plugin System**: OpenCode Plugin SDK
- **Memory**: File-based storage with optional Neo4j graph database
- **Communication**: EventEmitter + SSE streaming
- **Database**: Better-sqlite3 for local storage
- **Build**: Bun build targeting Node.js

### Frontend Technologies  
- **Framework**: SolidJS (modern React alternative)
- **Build Tool**: Vite
- **Styling**: TailwindCSS
- **UI Components**: Kobalte (SolidJS component library)
- **State Management**: SolidJS signals/context

### Development Tools
- **Package Manager**: Bun (monorepo workspaces)
- **Testing**: Vitest (unit), Bun test (integration)
- **TypeScript**: Strict configuration

## Architecture

### Hub-and-Spoke Design
```
┌─────────────────────────────────────┐
│        Orchestrator (Hub)           │
│  ┌─────────┐ ┌─────────┐ ┌────────┐ │
│  │ Registry│ │ Config  │ │ Tools  │ │
│  └─────────┘ └─────────┘ └────────┘ │
└────────────────┬──────────────────────┘
                 │
    ┌────────────┼────────────┐
    ▼            ▼            ▼
┌────────┐ ┌────────┐ ┌────────┐
│ Vision │ │  Docs  │ │ Coder  │ ... (Specialized Workers)
└────────┘ └────────┘ └────────┘
```

### Service Container Pattern
Factory pattern with dependency injection for:
- **API Service**: OpenCode SDK wrapper
- **Communication**: Event system (EventEmitter + SSE)
- **Memory Store**: Knowledge graph persistence
- **Worker Manager**: Spawn, lifecycle, job queue
- **Workflow Engine**: Multi-step task execution
- **Orchestrator**: Task routing and delegation
- **Tools**: OpenCode tool definitions

### Worker Lifecycle State Machine
```
[starting] → [ready] → [busy] → [ready] → [stopped]
              ↓        ↓
            [error]  [error]
```

## Specialized Workers

### 1. Vision Worker
- **Capabilities**: Image analysis, OCR, UI review
- **Use Cases**: Visual content processing, interface analysis

### 2. Docs Worker  
- **Capabilities**: Documentation research, examples, citations
- **Use Cases**: Technical documentation, API references

### 3. Coder Worker
- **Capabilities**: Code implementation, file operations
- **Use Cases**: Software development, code generation

### 4. Architect Worker
- **Capabilities**: System design, planning
- **Notes**: Read-only access
- **Use Cases**: Architecture decisions, system analysis

### 5. Explorer Worker
- **Capabilities**: Fast codebase searches
- **Use Cases**: Code discovery, pattern finding

### 6. Memory Worker
- **Capabilities**: Knowledge graph management
- **Use Cases**: Memory curation, context management

## Key Features

### 1. Multi-Agent Orchestration
- **6 Built-in Worker Profiles**: Specialized AI workers for different tasks
- **Profile-Based Spawning**: Auto-model resolution from OpenCode config
- **Dynamic Port Allocation**: Avoids conflicts with automatic port assignment
- **Session-Based Isolation**: Each worker maintains its own conversation context

### 2. Advanced Memory System
- **File-Based Memory**: Default JSON storage in `.opencode/memory`
- **Optional Neo4j Integration**: Graph database for complex relationships
- **Auto-Context Injection**: Memory automatically injected into worker prompts
- **Project vs Global Scope**: Configurable memory boundaries

### 3. Workflow Engine
- **Multi-Step Workflows**: Complex task sequences with carry-forward context
- **Security Limits**: Max steps, character limits, timeouts
- **Built-in Workflows**: RooCode boomerang workflow for implementation tasks

### 4. Skills System (Advanced)
- **Agent Skills Standard**: YAML frontmatter + markdown body format
- **Profile Inheritance**: Extend and compose worker capabilities
- **CRUD API**: Full management via skills API server
- **File-Based Storage**: Project and global skill definitions

### 5. Frontend Control Panel
- **Real-time Dashboard**: Live worker status and session management
- **Command Palette**: Cmd+K quick actions
- **Job Queue**: Activity monitoring with async job support
- **Log Stream**: Event visualization and shell integration
- **Skills Management**: UI for skill CRUD operations

## Configuration System

### Configuration Priority (Highest to Lowest)
1. **Environment Variables**: Runtime overrides and secrets
2. **Project Config**: `.opencode/orchestrator.json`
3. **Global Config**: `~/.opencode/orchestrator.json`
4. **Built-in Defaults**: Fallback values

### Key Configuration Areas
- **Worker Profiles**: Model selection, capabilities, permissions
- **Spawn Policy**: Auto-spawn, on-demand, manual controls
- **Model Selection**: Performance/balanced/economical modes
- **Memory System**: Storage backend, injection settings
- **Workflows**: Multi-step execution parameters
- **Integrations**: Neo4j, Linear, telemetry services
- **Security**: Tool permissions, path constraints

## Project Structure
```
opencode-boomerang/
├── orchestra/          # Backend plugin (Node.js/Bun)
│   ├── src/
│   │   ├── api/        # API routes and handlers
│   │   ├── config/     # Configuration management
│   │   ├── core/       # Core services and container
│   │   ├── memory/     # Memory storage implementations
│   │   ├── models/     # Data models and types
│   │   ├── orchestrator/ # Main orchestration logic
│   │   ├── skills/     # Skills system implementation
│   │   ├── tools/      # OpenCode tool definitions
│   │   ├── workers/    # Worker management
│   │   └── workflows/  # Workflow engine
├── app/               # Frontend control panel (Solid.js)
│   ├── src/
│   │   ├── components/ # UI components
│   │   ├── context/    # State management
│   │   ├── lib/        # Utilities
│   │   └── pages/      # Route components
├── docs/              # Comprehensive documentation
└── test/              # Test suites
```

## Integration Points

### OpenCode Platform
- **Plugin Integration**: Extends OpenCode with orchestration capabilities
- **SDK Usage**: Both backend and frontend use OpenCode SDK
- **Event Streaming**: Real-time updates via Server-Sent Events
- **Tool System**: Exposes orchestrator controls as OpenCode tools

### External Services
- **Neo4j**: Optional graph database for advanced memory
- **Linear**: Issue tracking integration
- **PostHog**: Usage analytics and telemetry

## Development Commands
```bash
# Root level
bun install          # Install all dependencies
bun run dev         # Start backend development
bun run app:dev     # Start frontend development
bun run test        # Run all tests

# Backend only
cd orchestra
bun run build       # Build plugin
bun run typecheck   # TypeScript validation

# Frontend only  
cd app
bun run build       # Build control panel
bun run preview     # Preview built app
```

## Key Patterns and Conventions

### Code Organization
- **Monorepo Structure**: Clear separation between backend and frontend
- **TypeScript Strict**: Comprehensive type safety
- **Dependency Injection**: Service container pattern
- **Event-Driven Architecture**: EventEmitter for internal communication

### Naming Conventions
- **Worker Profiles**: Descriptive names (vision, docs, coder, etc.)
- **Services**: PascalCase with Service suffix
- **Types**: PascalCase with descriptive names
- **Functions**: camelCase for utilities, PascalCase for components

### Security Patterns
- **Path Constraints**: Restricted file system access
- **Tool Permissions**: Granular permission system
- **Session Isolation**: Worker conversation isolation
- **Configuration Validation**: Schema-based validation

## Quality Attributes
- **Scalability**: Multi-worker architecture with load distribution
- **Reliability**: Worker lifecycle management and error handling
- **Extensibility**: Plugin architecture and skill system
- **Maintainability**: Strong typing and comprehensive documentation
- **Observability**: Real-time monitoring and logging

This knowledge base represents a comprehensive understanding of the opencode-boomerang project architecture, capabilities, and design patterns.