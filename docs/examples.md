# Examples & Use Cases

This guide shows practical examples of using Open Orchestra for common development tasks.

## Example 1: Screenshot Bug Debugging

**Scenario:** You have a screenshot of an error and need to fix it.

### Step 1: Spawn the Vision Worker

```
spawn_worker({ profileId: "vision" })
```

### Step 2: Analyze the Screenshot

```
ask_worker({ 
  workerId: "vision", 
  message: "Analyze this error screenshot. What's the error message and what file/line is it pointing to?",
  attachments: [{ type: "image", path: "./error-screenshot.png" }]
})
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

### Step 3: Spawn the Coder Worker

```
spawn_worker({ profileId: "coder" })
```

### Step 4: Fix the Bug

```
ask_worker({ 
  workerId: "coder", 
  message: "Fix the TypeError in src/components/UserList.jsx line 23. The 'users' variable is undefined on first render. Add a guard clause to prevent the error." 
})
```

### One-Step Alternative: Use delegate_task

```
delegate_task({ 
  task: "This screenshot shows an error. Analyze it and fix the bug.",
  requiresVision: true,
  attachments: [{ type: "image", path: "./error-screenshot.png" }]
})
```

---

## Example 2: Research-First Development

**Scenario:** You need to implement a feature using an unfamiliar API.

### Step 1: Research the API

```
spawn_worker({ profileId: "docs" })

ask_worker({ 
  workerId: "docs", 
  message: "I need to implement file uploads in my Express.js app. Research the multer library - show me the basic setup and how to handle single and multiple file uploads."
})
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
spawn_worker({ profileId: "architect" })

ask_worker({ 
  workerId: "architect", 
  message: "Based on this multer documentation, plan how to add file upload to our Express API. We need: single image upload for user avatars, validation for image types only, max 2MB size, and storage in an 'uploads/avatars' folder."
})
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
spawn_worker({ profileId: "coder" })

ask_worker({ 
  workerId: "coder", 
  message: "Implement the file upload plan: 1) Create src/config/upload.js with multer config for avatar uploads (images only, 2MB max, uploads/avatars folder). 2) Add POST /users/:id/avatar route to src/routes/users.js. 3) Add uploads/ to .gitignore."
})
```

---

## Example 3: Code Review with RooCode Boomerang

**Scenario:** You want a complete plan-implement-review-fix cycle.

### Run the Workflow

```
run_workflow({ 
  workflowId: "roocode-boomerang", 
  task: "Add input validation to the user registration endpoint. Required fields: email (valid format), password (min 8 chars, 1 number, 1 special char), username (3-20 chars, alphanumeric)."
})
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
ask_worker({ 
  workerId: "architect", 
  message: "Plan input validation for user registration: email, password (8+ chars, 1 number, 1 special), username (3-20 chars, alphanumeric)"
})

# Step 2: Implement
ask_worker({ 
  workerId: "coder", 
  message: "[paste plan from architect]"
})

# Step 3: Review
ask_worker({ 
  workerId: "architect", 
  message: "Review this validation implementation: [paste code]"
})

# Step 4: Fix
ask_worker({ 
  workerId: "coder", 
  message: "Address these review comments: [paste feedback]"
})
```

---

## Example 4: Parallel Worker Execution

**Scenario:** You need to research multiple topics simultaneously.

### Using Async Workers

```
# Spawn workers
spawn_worker({ profileId: "docs" })

# Start multiple async tasks
ask_worker_async({ 
  workerId: "docs", 
  message: "Research React Query v5 - key features and migration guide from v4" 
})
# Returns: { jobId: "job-123" }

ask_worker_async({ 
  workerId: "docs", 
  message: "Research Zustand state management - comparison with Redux" 
})
# Returns: { jobId: "job-456" }

ask_worker_async({ 
  workerId: "docs", 
  message: "Research TanStack Router - features and Next.js comparison" 
})
# Returns: { jobId: "job-789" }

# Check job status
list_worker_jobs

# Wait for specific job to complete
await_worker_job({ jobId: "job-123" })
```

### Spawning Multiple Workers

```
# Spawn three docs workers with different focuses
spawn_worker({ profileId: "docs" })  # Default docs worker

# Create custom research workers
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

# Now spawn and use them
spawn_worker({ profileId: "frontend-docs" })
spawn_worker({ profileId: "backend-docs" })

ask_worker({ workerId: "frontend-docs", message: "Compare Vite vs Webpack for React apps" })
ask_worker({ workerId: "backend-docs", message: "Compare Prisma vs Drizzle ORM" })
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
spawn_worker({ profileId: "ethers-expert" })

ask_worker({ 
  workerId: "ethers-expert", 
  message: "Write a function to connect to Ethereum mainnet via Infura, read the balance of an address, and format it as ETH with 4 decimal places."
})
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
spawn_worker({ profileId: "explorer" })

# Find all API endpoints
ask_worker({ 
  workerId: "explorer", 
  message: "Find all Express route definitions in this codebase. List each endpoint with its HTTP method and file location."
})

# Find where a function is used
ask_worker({ 
  workerId: "explorer", 
  message: "Find all usages of the 'validateUser' function. Show the file, line number, and context."
})

# Understand a pattern
ask_worker({ 
  workerId: "explorer", 
  message: "How is authentication implemented in this codebase? Find the auth middleware and show how it's used."
})
```

### Combining Explorer with Architect

```
# First, explore
ask_worker({ 
  workerId: "explorer", 
  message: "List all database models/schemas in this project"
})

# Then, analyze
ask_worker({ 
  workerId: "architect", 
  message: "Based on these database models, create an entity relationship diagram and explain the data flow."
})
```

---

## Example 7: Memory-Powered Development

**Scenario:** Remember decisions and context across sessions.

### Setting Up Memory

Memory is file-based by default. If you want Neo4j-backed memory, ensure Neo4j is running:
```bash
docker run -d --name neo4j -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password neo4j:latest
```

Configure environment (Neo4j optional):
```bash
export OPENCODE_NEO4J_URI=bolt://localhost:7687
export OPENCODE_NEO4J_USERNAME=neo4j
export OPENCODE_NEO4J_PASSWORD=password
```

### Storing Project Decisions

```
# Store an architectural decision
memory_put({ 
  key: "architecture:database",
  value: "We chose PostgreSQL over MongoDB because our data is highly relational. User->Orders->OrderItems requires strong referential integrity.",
  tags: ["architecture", "database", "decision"],
  scope: "project"
})

# Store a coding convention
memory_put({ 
  key: "convention:error-handling",
  value: "All API errors should use the ApiError class from src/utils/errors.js. Include error code, message, and optional details object.",
  tags: ["convention", "error-handling"],
  scope: "project"
})
```

### Retrieving Context

```
# Search for relevant memories
memory_search({ 
  query: "database",
  limit: 5
})

# Get recent decisions
memory_recent({ 
  limit: 10,
  scope: "project"
})
```

### Using Memory with Workers

```
# First, retrieve context
memory_search({ query: "error handling conventions" })

# Then ask coder with that context
ask_worker({ 
  workerId: "coder",
  message: "Add error handling to the createUser function. Remember to follow our error handling conventions: [paste memory result]"
})
```

---

## Quick Reference: Common Patterns

### Pattern: Research Then Implement

```
ask_worker({ workerId: "docs", message: "Research [topic]" })
ask_worker({ workerId: "architect", message: "Plan implementation based on: [research]" })
ask_worker({ workerId: "coder", message: "Implement: [plan]" })
```

### Pattern: Vision-Assisted Debugging

```
delegate_task({ 
  task: "Analyze this error and fix it",
  requiresVision: true,
  attachments: [{ type: "image", path: "./screenshot.png" }]
})
```

### Pattern: Multi-File Changes

```
ask_worker({ 
  workerId: "architect", 
  message: "List all files that need to change for [feature]"
})
# Returns file list

ask_worker({ 
  workerId: "coder", 
  message: "Make these changes: [list each file and change]"
})
```

### Pattern: Code Review

```
ask_worker({ 
  workerId: "architect", 
  message: "Review this code for: security issues, performance problems, code style, and potential bugs:\n\n[paste code]"
})
```

---

## Next Steps

- [Configuration](./configuration.md) - Customize profiles and settings
- [Troubleshooting](./troubleshooting.md) - Fix common issues
- [Architecture](./architecture.md) - Understand how it works
