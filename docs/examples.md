# Examples

This document provides practical examples of using Open Orchestra for common workflows and use cases.

## Table of Contents

- [Getting Started](#getting-started)
- [Everyday Workflows](#everyday-workflows)
- [Advanced Patterns](#advanced-patterns)
- [Team Collaboration](#team-collaboration)
- [Specialized Tasks](#specialized-tasks)
- [Memory System Examples](#memory-system-examples)

---

## Getting Started

### Initial Setup

```bash
# 1. Check your available models
list_models({})

# 2. Auto-configure profiles with your models
autofill_profile_models({ 
  scope: "global",
  setAgent: true 
})

# 3. Verify configuration
orchestrator_config({})

# 4. Spawn essential workers
ensure_workers({ 
  profileIds: ["vision", "docs", "coder"] 
})
```

### Daily Startup Routine

```bash
# Check what workers are available
list_workers({})

# Start your daily workflow
spawn_worker({ profileId: "explorer" })
spawn_worker({ profileId: "vision" })
```

---

## Everyday Workflows

### 1. Code Review with Screenshots

```bash
# Start a vision worker for UI review
spawn_worker({ profileId: "vision" })

# Analyze a UI screenshot
ask_worker({
  workerId: "vision",
  message: "Review this UI for accessibility issues and suggest improvements",
  attachments: [{
    type: "image",
    path: "./ui-mockup.png"
  }]
})

# Get implementation help
delegate_task({
  task: "Fix the accessibility issues identified in the screenshot by adding proper ARIA labels",
  workerId: "coder"
})
```

### 2. Documentation Research

```bash
# Spawn docs worker for research
spawn_worker({ profileId: "docs" })

# Research a topic
ask_worker({
  workerId: "docs",
  message: "Find the official React documentation about Server Components and provide key points with examples"
})

# Implement based on research
delegate_task({
  task: "Convert this component to a Server Component based on the documentation insights",
  attachments: [{
    type: "file",
    path: "./components/Profile.tsx"
  }]
})
```

### 3. Bug Investigation

```bash
# Auto-route based on task type
delegate_task({
  task: "There's a memory leak in our React app. Here's the heap snapshot. Please analyze and identify the cause",
  requiresVision: true,
  attachments: [{
    type: "image",
    path: "./heap-snapshot.png"
  }]
})

# Get specific help
ask_worker({
  workerId: "coder",
  message: "Fix the memory leak by properly cleaning up event listeners and intervals in the useEffect hook",
  attachments: [{
    type: "file",
    path: "./hooks/useDataStream.ts"
  }]
})
```

### 4. Architecture Planning

```bash
# Spawn architect for planning
spawn_worker({ profileId: "architect" })

# Plan a new feature
ask_worker({
  workerId: "architect",
  message: "Design a real-time collaboration feature for our document editor. Consider offline support, conflict resolution, and scalability. Provide a high-level architecture diagram and component breakdown."
})

# Get implementation help
delegate_task({
  task: "Implement the collaboration backend service with WebSocket support and operational transformation",
  workerId: "coder"
})
```

---

## Advanced Patterns

### 1. Multi-Worker Pipeline

```bash
# Step 1: Research with docs worker
ask_worker({
  workerId: "docs",
  message: "Research best practices for implementing JWT authentication with refresh tokens in Node.js"
})

# Step 2: Design with architect
ask_worker({
  workerId: "architect", 
  message: "Based on the JWT research, design an authentication system for our microservices architecture with proper token rotation"
})

# Step 3: Implement with coder
delegate_task({
  task: "Implement the JWT authentication service with refresh token support",
  workerId: "coder"
})

# Step 4: Store decision in memory
memory_put({
  key: "decision:auth-strategy",
  value: "JWT with refresh tokens, 15min access token expiry, secure httpOnly cookies",
  tags: ["authentication", "security", "jwt"]
})
```

### 2. Roocode Boomerang (Sequential Workflow)

Use a workflow when you want a **repeatable** plan → implement → review → fix loop with clear step boundaries.

```bash
# Discover available workflows
list_workflows({})

# Run the built-in Roocode sequential boomerang
run_workflow({
  workflowId: "roocode.boomerang.sequential",
  task: "Refactor our auth middleware to support tenant-aware RBAC, add tests, and update docs"
})
```

### 2. Parallel Processing

```bash
# Spawn multiple workers for parallel tasks
ensure_workers({
  profileIds: ["vision", "docs", "explorer", "coder"]
})

# Parallel exploration
ask_worker({
  workerId: "explorer",
  message: "Find all authentication-related files in the codebase"
})

ask_worker({
  workerId: "docs",
  message: "Research OWASP authentication best practices"
})

ask_worker({
  workerId: "vision",
  message: "Analyze the current authentication flow diagram"
})

# Then synthesize results
delegate_task({
  task: "Based on the exploration, research, and diagram analysis, create a comprehensive security audit report with specific recommendations",
  workerId: "architect"
})
```

### 3. Custom Domain Worker

```bash
# Create a custom profile for ML tasks
set_profile_model({
  scope: "project",
  profileId: "ml-expert",
  model: "anthropic/claude-opus-4-5",
  name: "ML Expert",
  purpose: "Machine learning model development and optimization",
  whenToUse: "When working with TensorFlow, PyTorch, or scikit-learn",
  systemPrompt: "You are an ML expert. Focus on model architecture, training strategies, and production deployment. Always consider data preprocessing and evaluation metrics.",
  supportsWeb: true,
  tags: ["ml", "tensorflow", "pytorch", "scikit-learn"]
})

# Use the custom worker
spawn_worker({ profileId: "ml-expert" })

ask_worker({
  workerId: "ml-expert",
  message: "Design a CNN architecture for image classification with 100 classes. Include data augmentation strategies and regularization techniques."
})
```

---

## Team Collaboration

### 1. Project Onboarding

```bash
# Store project knowledge in memory
memory_put({
  key: "architecture:overview",
  value: "Microservices architecture with API Gateway, PostgreSQL for core data, Redis for caching, RabbitMQ for messaging",
  tags: ["architecture", "microservices"]
})

memory_link({
  fromKey: "architecture:overview",
  toKey: "pattern:circuit-breaker"
})

# New team member can query
memory_search({ 
  query: "architecture patterns" 
})
```

### 2. Code Standard Enforcement

```bash
# Store coding standards
memory_put({
  key: "standards:typescript",
  value: "Use strict mode, prefer explicit returns, add JSDoc for public APIs, no any types",
  tags: ["standards", "typescript", "linting"]
})

# Review code against standards
delegate_task({
  task: "Review this TypeScript file against our coding standards and suggest improvements",
  workerId: "coder",
  attachments: [{
    type: "file",
    path: "./src/utils/validation.ts"
  }]
})
```

### 3. Knowledge Sharing

```bash
# Document architectural decisions
memory_put({
  key: "decision:event-bus",
  value: "Chose custom event bus over RxJS to avoid dependency and have full control over error handling",
  tags: ["decision", "architecture", "events"]
})

memory_link({
  fromKey: "decision:event-bus",
  toKey: "pattern:observer"
})

# Team can search for rationale
memory_search({ query: "why custom event bus" })
```

---

## Specialized Tasks

### 1. API Design

```bash
# Design API with architect
ask_worker({
  workerId: "architect",
  message: "Design a RESTful API for a project management system. Include endpoints for projects, tasks, users, and comments. Provide OpenAPI specification."
})

# Implement with coder
delegate_task({
  task: "Implement the project management API with Express.js, including validation, error handling, and rate limiting",
  workerId: "coder"
})

# Generate documentation
delegate_task({
  task: "Generate API documentation from the implementation, including examples for each endpoint",
  workerId: "docs"
})
```

### 2. Database Schema Design

```bash
# Design schema with architect
ask_worker({
  workerId: "architect",
  message: "Design a database schema for an e-commerce platform. Consider products, orders, customers, and inventory. Normalize to 3NF and suggest indexes."
})

# Generate migrations
delegate_task({
  task: "Create PostgreSQL migration files using Drizzle ORM for the e-commerce schema",
  workerId: "coder"
})

# Document schema
memory_put({
  key: "schema:ecommerce",
  value: "Normalized schema with separate tables for products, orders, customers, line_items, with proper foreign keys and indexes",
  tags: ["database", "schema", "ecommerce"]
})
```

### 3. Performance Optimization

```bash
# Analyze performance bottleneck
delegate_task({
  task: "Analyze this React component for performance issues and suggest optimizations",
  workerId: "coder",
  attachments: [{
    type: "file",
    path: "./components/DataGrid.tsx"
  }]
})

# Implement optimizations
delegate_task({
  task: "Implement the performance optimizations: memoization, virtual scrolling, and debounced search",
  workerId: "coder"
})

# Document patterns
memory_put({
  key: "pattern:performance-optimization",
  value: "Use React.memo for expensive components, useMemo for computed values, and useCallback for stable function references",
  tags: ["performance", "react", "optimization"]
})
```

### 4. Security Audit

```bash
# Create security profile
set_profile_model({
  scope: "project",
  profileId: "security",
  model: "anthropic/claude-opus-4-5",
  name: "Security Expert",
  purpose: "Security code review and vulnerability assessment",
  whenToUse: "For security reviews and penetration testing",
  systemPrompt: "You are a security expert. Focus on OWASP Top 10, input validation, authentication, and data protection.",
  tags: ["security", "owasp", "audit"]
})

# Perform security review
spawn_worker({ profileId: "security" })

ask_worker({
  workerId: "security",
  message: "Perform a security audit of this authentication middleware. Check for OWASP vulnerabilities and suggest fixes.",
  attachments: [{
    type: "file",
    path: "./middleware/auth.ts"
  }]
})

# Document security measures
memory_put({
  key: "security:measures",
  value: "Implemented rate limiting, input sanitization, CSRF protection, and secure cookie configuration",
  tags: ["security", "implementation"]
})
```

---

## Memory System Examples

### 1. Building Knowledge Graph

```bash
# Store architectural decisions
memory_put({
  key: "architecture:frontend",
  value: "Next.js 14 with App Router, TypeScript, Tailwind CSS, Zustand for state management",
  tags: ["frontend", "architecture"]
})

memory_put({
  key: "architecture:backend",
  value: "Node.js with Express, PostgreSQL with Drizzle ORM, Redis for caching",
  tags: ["backend", "architecture"]
})

# Link related concepts
memory_link({
  fromKey: "architecture:frontend",
  toKey: "decision:use-nextjs"
})

memory_link({
  fromKey: "architecture:backend",
  toKey: "decision:use-postgresql"
})

# Store decisions with rationale
memory_put({
  key: "decision:use-nextjs",
  value: "Chose Next.js for SSR/SSG capabilities, built-in optimization, and TypeScript support",
  tags: ["decision", "framework"]
})
```

### 2. Context Retrieval

```bash
# Query project architecture
memory_search({ query: "frontend architecture" })

# Get recent decisions
memory_recent({ 
  scope: "project",
  limit: 10 
})

# Find all database-related info
memory_search({ query: "database postgresql" })
```

### 3. Cross-Project Knowledge

```bash
# Store global preferences
memory_put({
  scope: "global",
  key: "preference:testing",
  value: "Prefer Jest with TypeScript, use describe/it/expect pattern, aim for >80% coverage",
  tags: ["testing", "standards", "global"]
})

# Store reusable patterns
memory_put({
  scope: "global",
  key: "pattern:error-handling",
  value: "Create custom Error classes, use error boundaries in React, log errors with context",
  tags: ["pattern", "error-handling", "global"]
})

# Access in any project
memory_search({ 
  query: "testing standards",
  scope: "global" 
})
```

---

## Troubleshooting Examples

### 1. Debugging with Multiple Workers

```bash
# Check worker status
list_workers({ format: "json" })

# Restart problematic worker
stop_worker({ workerId: "vision" })
spawn_worker({ profileId: "vision" })

# Test worker directly
ask_worker({
  workerId: "vision",
  message: "Can you see this test image?",
  attachments: [{
    type: "image",
    base64: "iVBORw0KGgoAAAANSUhEUgAA..."
  }]
})
```

### 2. Configuration Issues

```bash
# Check model configuration
orchestrator_config({})

# List available models
list_models({})

# Fix model mapping
set_profile_model({
  scope: "project",
  profileId: "vision",
  model: "zhipuai/glm-4.6v"
})

# Auto-fix all profiles
autofill_profile_models({
  scope: "project",
  force: true
})
```

### 3. Performance Issues

```bash
# Enable context pruning for long sessions
set_profile_model({
  scope: "project",
  profileId: "coder",
  systemPrompt: "Be concise. Focus on code only.",
  temperature: 0.1
})

# Use fast model for simple tasks
set_profile_model({
  scope: "project",
  profileId: "explorer",
  model: "opencode/grok-code-fast"
})
```

---

## Best Practices

1. **Use appropriate workers**: Match tasks to worker capabilities
2. **Store decisions**: Document architectural choices in memory
3. **Create custom profiles**: For domain-specific expertise
4. **Leverage delegation**: Let the system route tasks automatically
5. **Monitor workers**: Check status regularly
6. **Prune context**: Enable for long sessions
7. **Version control configs**: Commit orchestrator.json with your project

---

## Sample Workflow: Feature Development

```bash
# 1. Research phase
ask_worker({
  workerId: "docs",
  message: "Research WebSocket best practices for real-time features"
})

# 2. Design phase
ask_worker({
  workerId: "architect",
  message: "Design a real-time notification system using WebSockets. Include client connection management and reconnection logic."
})

# 3. Store design decision
memory_put({
  key: "design:notifications",
  value: "WebSocket with connection pooling, heartbeat mechanism, exponential backoff for reconnections",
  tags: ["design", "websocket", "notifications"]
})

# 4. Implementation phase
delegate_task({
  task: "Implement the WebSocket notification service with connection management",
  workerId: "coder"
})

# 5. Testing phase
delegate_task({
  task: "Write comprehensive tests for the WebSocket service including connection, disconnection, and reconnection scenarios",
  workerId: "coder"
})

# 6. Documentation phase
delegate_task({
  task: "Write documentation for the notification system including setup instructions and usage examples",
  workerId: "docs"
})

# 7. Review phase
ask_worker({
  workerId: "vision",
  message: "Review the implementation diagram and suggest improvements",
  attachments: [{
    type: "image",
    path: "./docs/notification-flow.png"
  }]
})

# 8. Store lessons learned
memory_put({
  key: "learning:websocket",
  value: "Connection pooling is crucial for scalability, heartbeat prevents premature disconnections",
  tags: ["learning", "websocket"]
})
```