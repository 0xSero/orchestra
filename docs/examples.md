# Examples & Use Cases

This guide shows practical examples of using Open Orchestra for common development tasks.

Note: Examples prefer the async Task API (`task_start` → `task_await`) so orchestrator prompts stay consistent and models don’t “forget to await” background work.

## Example 1: Screenshot Bug Debugging

**Scenario:** You have a screenshot of an error and need to fix it.

### Step 1: Analyze the Screenshot (Task API)

```
task_start({
  kind: "worker",
  workerId: "vision",
  task: "Analyze this error screenshot. What's the error message and what file/line is it pointing to?",
  attachments: [{ type: "image", path: "./error-screenshot.png" }]
})
# Returns: { taskId: "...", next: "task_await" }

task_await({ taskId: "<taskId>" })
```

**Example Response:**
```
The screenshot shows a TypeError in the browser console:

Error: Cannot read properties of undefined (reading 'map')
Location: src/components/UserList.jsx, line 23

The error occurs because `users` is undefined when the component
first renders. The code is trying to call .map() on an undefined value.

Suggested fix: Add a guard clause or default value:
- users?.map(...) 
- (users || []).map(...)
```

### Step 2: Fix the Bug (Task API)

```
task_start({
  kind: "worker",
  workerId: "coder",
  task: "Fix the TypeError in src/components/UserList.jsx line 23. The 'users' variable is undefined on first render. Add a guard clause to prevent the error."
})

task_await({ taskId: "<taskId>" })
```

### One-Step Alternative: Use the RooCode boomerang workflow

```
task_start({
  kind: "workflow",
  workflowId: "roocode-boomerang",
  task: "This screenshot shows an error. Analyze it and fix the bug.",
  attachments: [{ type: "image", path: "./error-screenshot.png" }]
})

task_await({ taskId: "<taskId>" })
```

### Planning Alternative: Generate a boomerang task queue

```
task_start({
  kind: "workflow",
  workflowId: "boomerang-plan",
  task: "Target directory: packages/orchestrator\nGoal: Implement a new workflow and tests"
})

task_await({ taskId: "<taskId>" })
```

### Execution Alternative: Drain the boomerang task queue

```
task_start({
  kind: "workflow",
  workflowId: "boomerang-run",
  task: "Execute tasks/ in order"
})

task_await({ taskId: "<taskId>" })
```

---

## Example 2: Research-First Development

**Scenario:** You need to implement a feature using an unfamiliar API.

### Step 1: Research the API

```
task_start({
  kind: "worker",
  workerId: "docs",
  task: "I need to implement file uploads in my Express.js app. Research the multer library - show me the basic setup and how to handle single and multiple file uploads."
})

task_await({ taskId: "<taskId>" })
```

**Example Response:**
```markdown
# Multer File Upload Guide

## Installation
npm install multer

## Basic Setup
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

## Single File Upload
app.post('/upload', upload.single('file'), (req, res) => {
  console.log(req.file); // File info
  res.send('File uploaded');
});

## Multiple Files
app.post('/uploads', upload.array('files', 5), (req, res) => {
  console.log(req.files); // Array of files
  res.send('Files uploaded');
});

## Key Options
- dest: Upload destination folder
- limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
- fileFilter: Function to accept/reject files
```

### Step 2: Plan the Implementation

```
task_start({
  kind: "worker",
  workerId: "architect",
  task: "Based on this multer documentation, plan how to add file upload to our Express API. We need: single image upload for user avatars, validation for image types only, max 2MB size, and storage in an 'uploads/avatars' folder."
})

task_await({ taskId: "<taskId>" })
```

**Example Response:**
```markdown
# File Upload Implementation Plan

## 1. Dependencies
- Add multer to package.json

## 2. Configuration Module (src/config/upload.js)
- Create multer configuration with:
  - Custom storage (disk storage, not memory)
  - File filter for images only (jpeg, png, gif, webp)
  - 2MB size limit
  - Upload path: uploads/avatars

## 3. Route Changes (src/routes/users.js)
- Add POST /users/:id/avatar endpoint
- Use upload.single('avatar') middleware
- Return uploaded file URL

## 4. Error Handling
- MulterError for file too large
- Custom error for invalid file type
- General upload failure handling

## 5. Cleanup
- Delete old avatar when new one uploaded
- Add to .gitignore: uploads/

## Files to Create/Modify:
1. CREATE src/config/upload.js
2. MODIFY src/routes/users.js
3. MODIFY .gitignore
```

### Step 3: Implement the Code

```
task_start({
  kind: "worker",
  workerId: "coder",
  task: "Implement the file upload plan: 1) Create src/config/upload.js with multer config for avatar uploads (images only, 2MB max, uploads/avatars folder). 2) Add POST /users/:id/avatar route to src/routes/users.js. 3) Add uploads/ to .gitignore."
})

task_await({ taskId: "<taskId>" })
```

---

## Example 3: Code Review with RooCode Boomerang

**Scenario:** You want a complete plan-implement-review-fix cycle.

### Run the Workflow

```
task_start({
  kind: "workflow",
  workflowId: "roocode-boomerang",
  task: "Add input validation to the user registration endpoint. Required fields: email (valid format), password (min 8 chars, 1 number, 1 special char), username (3-20 chars, alphanumeric)."
})

task_await({ taskId: "<taskId>" })
```

**What Happens:**

1. **Plan Step (Architect)**
   - Analyzes requirements
   - Proposes validation strategy
   - Identifies files to modify

2. **Implement Step (Coder)**
   - Writes validation logic
   - Adds error messages
   - Updates route handler

3. **Review Step (Architect)**
   - Reviews implementation
   - Checks edge cases
   - Suggests improvements

4. **Fix Step (Coder)**
   - Addresses review feedback
   - Adds missing cases
   - Finalizes code

### Manual Alternative

If you want more control, run each step manually:

```
# Step 1: Plan
task_start({
  kind: "worker",
  workerId: "architect",
  task: "Plan input validation for user registration: email, password (8+ chars, 1 number, 1 special), username (3-20 chars, alphanumeric)"
})
task_await({ taskId: "<taskId>" })

# Step 2: Implement
task_start({
  kind: "worker",
  workerId: "coder",
  task: "[paste plan from architect]"
})
task_await({ taskId: "<taskId>" })

# Step 3: Review
task_start({
  kind: "worker",
  workerId: "architect",
  task: "Review this validation implementation: [paste code]"
})
task_await({ taskId: "<taskId>" })

# Step 4: Fix
task_start({
  kind: "worker",
  workerId: "coder",
  task: "Address these review comments: [paste feedback]"
})
task_await({ taskId: "<taskId>" })
```

---

## Example 4: Parallel Worker Execution

**Scenario:** You need to research multiple topics simultaneously.

### Using Async Workers

```
# Start multiple async tasks
task_start({ 
  kind: "worker",
  workerId: "docs", 
  task: "Research React Query v5 - key features and migration guide from v4" 
})
# Returns: { taskId: "task-123", next: "task_await" }

task_start({ 
  kind: "worker",
  workerId: "docs", 
  task: "Research Zustand state management - comparison with Redux" 
})
# Returns: { taskId: "task-456", next: "task_await" }

task_start({ 
  kind: "worker",
  workerId: "docs", 
  task: "Research TanStack Router - features and Next.js comparison" 
})
# Returns: { taskId: "task-789", next: "task_await" }

# Check task status
task_list({ view: "tasks", format: "markdown" })

# Wait for a specific task to complete
task_await({ taskId: "task-123" })
```

### Spawning Multiple Workers

```
# Create custom research workers (optionally auto-spawn them)
# In .opencode/orchestrator.json:
{
  "workers": [
    {
      "id": "frontend-docs",
      "name": "Frontend Researcher",
      "model": "auto:docs",
      "purpose": "Research frontend frameworks and libraries",
      "systemPrompt": "You specialize in React, Vue, and frontend tooling."
    },
    {
      "id": "backend-docs", 
      "name": "Backend Researcher",
      "model": "auto:docs",
      "purpose": "Research backend and API technologies",
      "systemPrompt": "You specialize in Node.js, databases, and API design."
    }
  ]
}

# Now use them
task_start({ kind: "worker", workerId: "frontend-docs", task: "Compare Vite vs Webpack for React apps" })
task_start({ kind: "worker", workerId: "backend-docs", task: "Compare Prisma vs Drizzle ORM" })
task_await({ taskIds: ["<taskId-frontend>", "<taskId-backend>"] })
```

---

## Example 5: Custom Domain Expert Profile

**Scenario:** Create a specialized worker for your tech stack.

### Step 1: Define the Profile

Add to `.opencode/orchestrator.json`:

```json
{
  "profiles": [
    {
      "id": "ethers-expert",
      "name": "Ethers.js Specialist",
      "model": "anthropic/claude-sonnet-4-5",
      "purpose": "Expert in Ethereum development with Ethers.js",
      "whenToUse": "When working with smart contracts, Web3, or blockchain",
      "supportsWeb": true,
      "systemPrompt": "You are an expert in Ethereum development using Ethers.js v6. You understand:\n- Contract interactions and ABIs\n- Transaction signing and gas estimation\n- Provider connections (Infura, Alchemy)\n- Wallet management and key security\n- Common patterns for DeFi and NFT projects\n\nAlways prefer v6 syntax. Warn about common security issues.",
      "tags": ["web3", "blockchain", "ethereum", "ethers"]
    }
  ],
  "workers": ["ethers-expert"]
}
```

### Step 2: Use the Custom Worker

```javascript
task_start({
  kind: "worker",
  workerId: "ethers-expert",
  task: "Write a function to connect to Ethereum mainnet via Infura, read the balance of an address, and format it as ETH with 4 decimal places."
})

task_await({ taskId: "<taskId>" })
```

**Example Response:**
```typescript
import { ethers } from 'ethers';

async function getBalance(address: string): Promise<string> {
  // Connect to Infura (use environment variable for API key)
  const provider = new ethers.InfuraProvider(
    'mainnet',
    process.env.INFURA_API_KEY
  );

  // Get balance in wei
  const balanceWei = await provider.getBalance(address);

  // Convert to ETH with 4 decimal places
  const balanceEth = ethers.formatEther(balanceWei);
  return parseFloat(balanceEth).toFixed(4);
}

// Usage
const balance = await getBalance('0x...');
console.log(`Balance: ${balance} ETH`);
```

---

## Example 6: Codebase Exploration

**Scenario:** Quickly understand an unfamiliar codebase.

### Using the Explorer Worker

```
# Find all API endpoints
task_start({
  kind: "worker",
  workerId: "explorer",
  task: "Find all Express route definitions in this codebase. List each endpoint with its HTTP method and file location."
})
task_await({ taskId: "<taskId>" })

# Find where a function is used
task_start({
  kind: "worker",
  workerId: "explorer",
  task: "Find all usages of the 'validateUser' function. Show the file, line number, and context."
})
task_await({ taskId: "<taskId>" })

# Understand a pattern
task_start({
  kind: "worker",
  workerId: "explorer",
  task: "How is authentication implemented in this codebase? Find the auth middleware and show how it's used."
})
task_await({ taskId: "<taskId>" })
```

### Combining Explorer with Architect

```
# First, explore
task_start({
  kind: "worker",
  workerId: "explorer",
  task: "List all database models/schemas in this project"
})
task_await({ taskId: "<taskId>" })

# Then, analyze
task_start({
  kind: "worker",
  workerId: "architect",
  task: "Based on these database models, create an entity relationship diagram and explain the data flow."
})
task_await({ taskId: "<taskId>" })
```

---

## Example 7: Memory-Powered Development

**Scenario:** Remember decisions and context across sessions.

### Setting Up Memory

First, ensure Neo4j is running:
```bash
docker run -d --name neo4j -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password neo4j:latest
```

Configure environment:
```bash
export OPENCODE_NEO4J_URI=bolt://localhost:7687
export OPENCODE_NEO4J_USERNAME=neo4j
export OPENCODE_NEO4J_PASSWORD=password
```

### Storing Project Decisions

```
# Store an architectural decision
task_start({
  kind: "op",
  op: "memory.put",
  task: "memory.put",
  memory: {
    key: "architecture:database",
    value: "We chose PostgreSQL over MongoDB because our data is highly relational. User->Orders->OrderItems requires strong referential integrity.",
    tags: ["architecture", "database", "decision"],
    scope: "project"
  }
})
task_await({ taskId: "<taskId>" })

# Store a coding convention
task_start({
  kind: "op",
  op: "memory.put",
  task: "memory.put",
  memory: {
    key: "convention:error-handling",
    value: "All API errors should use the ApiError class from src/utils/errors.js. Include error code, message, and optional details object.",
    tags: ["convention", "error-handling"],
    scope: "project"
  }
})
task_await({ taskId: "<taskId>" })
```

### Retrieving Context

Memory reads are injected automatically when `memory.autoInject` is enabled, or you can query Neo4j directly for ad-hoc lookup.

### Using Memory with Workers

```
# Include retrieved memory context in the task
task_start({
  kind: "worker",
  workerId: "coder",
  task: "Add error handling to the createUser function. Remember to follow our error handling conventions: [paste memory result]"
})
task_await({ taskId: "<taskId>" })
```

---

## Quick Reference: Common Patterns

### Pattern: Research Then Implement

```
task_start({ kind: "worker", workerId: "docs", task: "Research [topic]" })
task_await({ taskId: "<taskId>" })
task_start({ kind: "worker", workerId: "architect", task: "Plan implementation based on: [research]" })
task_await({ taskId: "<taskId>" })
task_start({ kind: "worker", workerId: "coder", task: "Implement: [plan]" })
task_await({ taskId: "<taskId>" })
```

### Pattern: Vision-Assisted Debugging

```
task_start({ kind: "workflow", workflowId: "roocode-boomerang", task: "Analyze this error and fix it", attachments: [{ type: "image", path: "./screenshot.png" }] })
task_await({ taskId: "<taskId>" })
```

### Pattern: Multi-File Changes

```
task_start({
  kind: "worker",
  workerId: "architect",
  task: "List all files that need to change for [feature]"
})
task_await({ taskId: "<taskId>" })
# Returns file list

task_start({
  kind: "worker",
  workerId: "coder",
  task: "Make these changes: [list each file and change]"
})
task_await({ taskId: "<taskId>" })
```

### Pattern: Code Review

```
task_start({
  kind: "worker",
  workerId: "architect",
  task: "Review this code for: security issues, performance problems, code style, and potential bugs:\n\n[paste code]"
})
task_await({ taskId: "<taskId>" })
```

---

## Next Steps

- [Configuration](./configuration.md) - Customize profiles and settings
- [Troubleshooting](./troubleshooting.md) - Fix common issues
- [Architecture](./architecture.md) - Understand how it works
