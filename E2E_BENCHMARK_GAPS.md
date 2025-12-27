<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap');
  
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    background: #1a1a1a;
    color: #e8e4de;
    font-size: 16pt;
    line-height: 1.8;
    padding: 2.5rem;
    max-width: 1000px;
    margin: 0 auto;
  }
  
  h1 { font-size: 36pt; font-weight: 700; letter-spacing: -0.02em; border-bottom: 3px solid #3d3d3d; padding-bottom: 1.25rem; color: #f5f3f0; margin-bottom: 0.5rem; }
  h2 { font-size: 26pt; font-weight: 600; margin-top: 3rem; color: #e8e4de; border-left: 4px solid #b8956c; padding-left: 1rem; }
  h3 { font-size: 20pt; font-weight: 600; margin-top: 2rem; color: #d4cfc7; }
  h4 { font-size: 16pt; font-weight: 600; margin-top: 1.5rem; color: #c4bfb7; }
  
  p, li { font-size: 15pt; color: #a8a29e; }
  strong { color: #d4cfc7; }
  
  code { font-family: 'JetBrains Mono', monospace; font-size: 12pt; background: #2d2d2d; padding: 0.2rem 0.5rem; border-radius: 4px; color: #d4a574; }
  pre { font-family: 'JetBrains Mono', monospace; font-size: 10pt; background: #242424; border: 1px solid #3d3d3d; border-radius: 8px; color: #d4cfc7; padding: 1.5rem; overflow-x: auto; line-height: 1.5; }
  
  table { width: 100%; border-collapse: collapse; margin: 2rem 0; font-size: 13pt; background: #242424; }
  th, td { padding: 0.9rem 1rem; border: 1px solid #3d3d3d; text-align: left; color: #c4bfb7; }
  th { background: #2d2d2d; font-weight: 600; color: #e8e4de; }
  tr:nth-child(even) { background: #2a2a2a; }
  td { color: #b8b4ae; }
  
  hr { border: none; border-top: 2px solid #333; margin: 3rem 0; }
  
  .subtitle { font-size: 18pt; color: #8a857e; margin-top: 0; }
  .tag { display: inline-block; background: #3d3528; color: #d4a574; padding: 0.3rem 0.8rem; border-radius: 20px; font-size: 11pt; margin-right: 0.5rem; margin-bottom: 0.5rem; }
  .tag.red { background: #3d2828; color: #d47474; }
  .tag.green { background: #283d28; color: #74d474; }
  .tag.blue { background: #28283d; color: #7474d4; }
  
  .gap-card { background: #242424; border: 1px solid #3d3d3d; border-radius: 12px; padding: 1.5rem; margin: 1.5rem 0; }
  .gap-card.critical { border-left: 4px solid #d45555; }
  .gap-card.important { border-left: 4px solid #d4a555; }
  .gap-card.nice { border-left: 4px solid #5577d4; }
  .gap-title { font-weight: 600; font-size: 16pt; color: #e8e4de; margin-bottom: 0.75rem; }
  .gap-desc { font-size: 14pt; color: #a8a29e; margin-bottom: 1rem; }
  
  .metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; margin: 2rem 0; }
  .metric-card { background: #242424; border: 1px solid #3d3d3d; border-radius: 10px; padding: 1.25rem; text-align: center; }
  .metric-value { font-size: 24pt; font-weight: 700; color: #d4a574; }
  .metric-label { font-size: 11pt; color: #8a857e; margin-top: 0.5rem; }

  .impl-box { background: #2d2d2d; border-radius: 8px; padding: 1rem; margin: 1rem 0; }
  .impl-title { font-weight: 600; font-size: 13pt; color: #d4a574; margin-bottom: 0.5rem; }
  
  .footer { text-align: center; margin-top: 4rem; padding-top: 2rem; border-top: 1px solid #333; color: #6a665f; font-size: 12pt; }
</style>

# E2E Testing Strategy

<p class="subtitle">Quality, Permissions & Massive Task Testing • Sync & Async</p>

<div style="margin: 1.5rem 0;">
  <span class="tag">Quality Evals</span>
  <span class="tag">Permission Testing</span>
  <span class="tag">Massive Tasks</span>
  <span class="tag">Sync Operations</span>
  <span class="tag">Async Jobs</span>
</div>

---

## Current State

<div class="metric-grid">
  <div class="metric-card">
    <div class="metric-value">150</div>
    <div class="metric-label">Tests Passing</div>
  </div>
  <div class="metric-card">
    <div class="metric-value">1</div>
    <div class="metric-label">Permission Test</div>
  </div>
  <div class="metric-card">
    <div class="metric-value">0</div>
    <div class="metric-label">Quality Evals</div>
  </div>
</div>

### Existing Permission Test

There's exactly **one** permission test in `test/integration/permissions.test.ts`:

```typescript
test("filesystem read permission removes write/edit tools", async () => {
  const profile: WorkerProfile = {
    id: "read-only",
    permissions: { filesystem: "read" },
    // ...
  };
  // Spawns worker, checks tools are restricted
});
```

### What's Missing

| Area | Gap |
|------|-----|
| **Quality** | No tests verify response correctness beyond "contains OK" |
| **Permissions** | Only 1 test for filesystem read; no bash, no network, no tool restrictions |
| **Massive Tasks** | All tasks are trivial one-liners |
| **Async** | One async job test, doesn't verify correctness |
| **Sync** | Tests exist but don't measure reliability |

---

## Part 1: Quality Evaluation Tests

<div class="gap-card critical">
  <div class="gap-title">Quality Tests: Verify Output Correctness</div>
  <div class="gap-desc">
    Test that workers produce correct, complete, and useful responses — not just that they respond at all.
  </div>
</div>

### 1.1 Coding Quality Evals

<div class="impl-box">
<div class="impl-title">test/evals/coding-quality.eval.ts</div>

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createTestWorkerRuntime } from "../helpers/worker-runtime";
import { setupE2eEnv } from "../helpers/e2e-env";

describe("coding quality evals", () => {
  let runtime: Awaited<ReturnType<typeof createTestWorkerRuntime>>;
  let restoreEnv: () => void;

  beforeAll(async () => {
    const env = await setupE2eEnv();
    restoreEnv = env.restore;
    runtime = await createTestWorkerRuntime({
      profiles: {
        coder: {
          id: "coder",
          name: "Coder",
          model: "opencode/gpt-5-nano",
          purpose: "Code implementation",
          whenToUse: "Writing code",
        },
      },
      directory: process.cwd(),
      timeoutMs: 120_000,
    });
    await runtime.workers.spawn(runtime.workers.listProfiles()[0]);
  }, 180_000);

  afterAll(async () => {
    await runtime?.stop();
    restoreEnv?.();
  });

  test("fixes arithmetic bug correctly", async () => {
    const buggyCode = `
function multiply(a, b) {
  return a + b; // BUG: should multiply
}`;

    const result = await runtime.workers.send("coder", 
      `Fix the bug in this function:\n\`\`\`javascript\n${buggyCode}\n\`\`\``,
      { timeout: 60_000 }
    );

    expect(result.success).toBe(true);
    const response = result.response ?? "";
    
    // Must contain the fix
    expect(response).toMatch(/a\s*\*\s*b/);
    // Must not still have the bug
    expect(response).not.toMatch(/return\s+a\s*\+\s*b/);
  }, 90_000);

  test("implements function from spec", async () => {
    const result = await runtime.workers.send("coder",
      "Write a JavaScript function called `isPalindrome` that returns true if a string reads the same forwards and backwards, ignoring case and spaces.",
      { timeout: 60_000 }
    );

    expect(result.success).toBe(true);
    const response = result.response ?? "";
    
    // Must have function definition
    expect(response).toMatch(/function\s+isPalindrome|isPalindrome\s*=|const\s+isPalindrome/);
    // Must handle case (toLowerCase or toUpperCase)
    expect(response).toMatch(/toLowerCase|toUpperCase/i);
    // Must reverse string somehow
    expect(response).toMatch(/reverse|split.*reverse|for.*length/i);
  }, 90_000);

  test("refactors long function into smaller pieces", async () => {
    const longFunction = `
function processUserData(user) {
  // Validate
  if (!user.name) throw new Error("Name required");
  if (!user.email) throw new Error("Email required");
  if (!user.email.includes("@")) throw new Error("Invalid email");
  
  // Normalize
  const name = user.name.trim().toLowerCase();
  const email = user.email.trim().toLowerCase();
  
  // Format
  const displayName = name.charAt(0).toUpperCase() + name.slice(1);
  
  // Save
  console.log("Saving:", displayName, email);
  return { name: displayName, email };
}`;

    const result = await runtime.workers.send("coder",
      `Refactor this function into smaller, single-responsibility functions:\n\`\`\`javascript\n${longFunction}\n\`\`\``,
      { timeout: 90_000 }
    );

    expect(result.success).toBe(true);
    const response = result.response ?? "";
    
    // Should have multiple function definitions
    const functionCount = (response.match(/function\s+\w+|const\s+\w+\s*=/g) || []).length;
    expect(functionCount).toBeGreaterThanOrEqual(3);
    
    // Should have validation function
    expect(response).toMatch(/validate|isValid/i);
  }, 120_000);

  test("explains code accurately", async () => {
    const code = `const debounce = (fn, ms) => {
  let id;
  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), ms);
  };
};`;

    const result = await runtime.workers.send("coder",
      `Explain what this code does:\n\`\`\`javascript\n${code}\n\`\`\``,
      { timeout: 60_000 }
    );

    expect(result.success).toBe(true);
    const response = (result.response ?? "").toLowerCase();
    
    // Must mention key concepts
    expect(response).toMatch(/debounce|delay|wait/);
    expect(response).toMatch(/timeout|timer/);
    expect(response).toMatch(/function|call/);
  }, 90_000);
});
```
</div>

### 1.2 Routing Quality Evals

<div class="impl-box">
<div class="impl-title">test/evals/routing-quality.eval.ts</div>

```typescript
import { describe, test, expect } from "bun:test";
import { selectWorkerId } from "../../src/orchestrator/router";
import type { WorkerProfile } from "../../src/types";

const profiles: Record<string, WorkerProfile> = {
  vision: { id: "vision", name: "Vision", model: "auto", purpose: "Image analysis", whenToUse: "screenshots", supportsVision: true },
  coder: { id: "coder", name: "Coder", model: "auto", purpose: "Write code", whenToUse: "implementation" },
  docs: { id: "docs", name: "Docs", model: "auto", purpose: "Research", whenToUse: "documentation" },
  architect: { id: "architect", name: "Architect", model: "auto", purpose: "Design systems", whenToUse: "architecture" },
  explorer: { id: "explorer", name: "Explorer", model: "auto", purpose: "Search code", whenToUse: "find files" },
};

describe("routing quality evals", () => {
  const testCases = [
    // Vision routing
    { task: "What's in this screenshot?", hasImage: true, expected: "vision" },
    { task: "Analyze the error in this image", hasImage: true, expected: "vision" },
    { task: "Read the text from this diagram", hasImage: true, expected: "vision" },
    
    // Coding routing
    { task: "Fix the null pointer exception in auth.ts", expected: "coder" },
    { task: "Implement the login function", expected: "coder" },
    { task: "Refactor this code to use async/await", expected: "coder" },
    { task: "Write unit tests for the User class", expected: "coder" },
    { task: "Add error handling to this function", expected: "coder" },
    
    // Docs routing  
    { task: "How do I use React hooks?", expected: "docs" },
    { task: "Find documentation for the fetch API", expected: "docs" },
    { task: "What are the best practices for REST APIs?", expected: "docs" },
    { task: "Explain how OAuth 2.0 works", expected: "docs" },
    
    // Architecture routing
    { task: "Design the database schema for this app", expected: "architect" },
    { task: "What's the best architecture for microservices?", expected: "architect" },
    { task: "Plan the system design for high availability", expected: "architect" },
    { task: "Review the tradeoffs of this approach", expected: "architect" },
    
    // Explorer routing
    { task: "Find all files that import UserService", expected: "explorer" },
    { task: "Where is the config file located?", expected: "explorer" },
    { task: "Search for uses of deprecated API", expected: "explorer" },
  ];

  for (const tc of testCases) {
    test(`routes "${tc.task.slice(0, 40)}..." → ${tc.expected}`, () => {
      const selected = selectWorkerId({
        task: tc.task,
        profiles,
        attachments: tc.hasImage ? [{ type: "image", base64: "..." }] : undefined,
      });
      
      expect(selected).toBe(tc.expected);
    });
  }

  test("overall routing accuracy ≥ 80%", () => {
    let correct = 0;
    
    for (const tc of testCases) {
      const selected = selectWorkerId({
        task: tc.task,
        profiles,
        attachments: tc.hasImage ? [{ type: "image", base64: "..." }] : undefined,
      });
      if (selected === tc.expected) correct++;
    }
    
    const accuracy = correct / testCases.length;
    expect(accuracy).toBeGreaterThanOrEqual(0.8);
  });
});
```
</div>

---

## Part 2: Permission Tests

<div class="gap-card critical">
  <div class="gap-title">Permission Tests: Verify Security Constraints</div>
  <div class="gap-desc">
    Test that workers respect permission boundaries — can't write when read-only, can't execute when restricted, etc.
  </div>
</div>

### 2.1 Filesystem Permissions

<div class="impl-box">
<div class="impl-title">test/evals/permissions-filesystem.eval.ts</div>

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestWorkerRuntime } from "../helpers/worker-runtime";
import { setupE2eEnv } from "../helpers/e2e-env";
import type { WorkerProfile } from "../../src/types";

describe("filesystem permission tests", () => {
  let runtime: Awaited<ReturnType<typeof createTestWorkerRuntime>>;
  let restoreEnv: () => void;
  let testDir: string;

  beforeAll(async () => {
    const env = await setupE2eEnv();
    restoreEnv = env.restore;
    testDir = await mkdtemp(join(tmpdir(), "perm-test-"));
    
    // Create test file
    await writeFile(join(testDir, "test.txt"), "original content");

    const readOnlyProfile: WorkerProfile = {
      id: "readonly",
      name: "Read Only Worker",
      model: "opencode/gpt-5-nano",
      purpose: "Read-only operations",
      whenToUse: "When read-only access needed",
      permissions: { filesystem: "read" },
    };

    const fullAccessProfile: WorkerProfile = {
      id: "fullaccess",
      name: "Full Access Worker", 
      model: "opencode/gpt-5-nano",
      purpose: "Full operations",
      whenToUse: "When full access needed",
      permissions: { filesystem: "write" },
    };

    const noAccessProfile: WorkerProfile = {
      id: "noaccess",
      name: "No Access Worker",
      model: "opencode/gpt-5-nano", 
      purpose: "No filesystem",
      whenToUse: "When no filesystem needed",
      permissions: { filesystem: "none" },
    };

    runtime = await createTestWorkerRuntime({
      profiles: { readonly: readOnlyProfile, fullaccess: fullAccessProfile, noaccess: noAccessProfile },
      directory: testDir,
      timeoutMs: 120_000,
    });

    for (const profile of Object.values(runtime.workers.listProfiles())) {
      await runtime.workers.spawn(profile);
    }
  }, 180_000);

  afterAll(async () => {
    await runtime?.stop();
    await rm(testDir, { recursive: true, force: true });
    restoreEnv?.();
  });

  test("read-only worker CAN read files", async () => {
    const result = await runtime.workers.send("readonly",
      `Read the file at ${join(testDir, "test.txt")} and tell me its contents`,
      { timeout: 60_000 }
    );

    expect(result.success).toBe(true);
    expect(result.response).toMatch(/original content/i);
  }, 90_000);

  test("read-only worker CANNOT write files", async () => {
    const targetFile = join(testDir, "readonly-attempt.txt");
    
    const result = await runtime.workers.send("readonly",
      `Write "hacked" to the file ${targetFile}`,
      { timeout: 60_000 }
    );

    // Either request fails or file doesn't exist
    const fileExists = await readFile(targetFile, "utf8").catch(() => null);
    expect(fileExists).toBeNull();
  }, 90_000);

  test("full-access worker CAN write files", async () => {
    const targetFile = join(testDir, "fullaccess-write.txt");
    
    const result = await runtime.workers.send("fullaccess",
      `Create a file at ${targetFile} with the content "hello world"`,
      { timeout: 60_000 }
    );

    expect(result.success).toBe(true);
    const content = await readFile(targetFile, "utf8").catch(() => null);
    expect(content).toMatch(/hello world/i);
  }, 90_000);

  test("no-access worker CANNOT read files", async () => {
    const result = await runtime.workers.send("noaccess",
      `Read the file at ${join(testDir, "test.txt")}`,
      { timeout: 60_000 }
    );

    // Response should indicate failure or lack of file tools
    const response = (result.response ?? "").toLowerCase();
    expect(
      response.includes("cannot") || 
      response.includes("unable") || 
      response.includes("no access") ||
      response.includes("don't have") ||
      !response.includes("original content")
    ).toBe(true);
  }, 90_000);
});
```
</div>

### 2.2 Bash/Shell Permissions

<div class="impl-box">
<div class="impl-title">test/evals/permissions-bash.eval.ts</div>

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createTestWorkerRuntime } from "../helpers/worker-runtime";
import { setupE2eEnv } from "../helpers/e2e-env";
import type { WorkerProfile } from "../../src/types";

describe("bash permission tests", () => {
  let runtime: Awaited<ReturnType<typeof createTestWorkerRuntime>>;
  let restoreEnv: () => void;

  beforeAll(async () => {
    const env = await setupE2eEnv();
    restoreEnv = env.restore;

    const noBashProfile: WorkerProfile = {
      id: "nobash",
      name: "No Bash Worker",
      model: "opencode/gpt-5-nano",
      purpose: "No shell access",
      whenToUse: "Safe operations",
      tools: { Bash: false },
    };

    const bashAllowedProfile: WorkerProfile = {
      id: "bashallowed",
      name: "Bash Worker",
      model: "opencode/gpt-5-nano",
      purpose: "Shell operations",
      whenToUse: "When shell needed",
      tools: { Bash: true },
    };

    runtime = await createTestWorkerRuntime({
      profiles: { nobash: noBashProfile, bashallowed: bashAllowedProfile },
      directory: process.cwd(),
      timeoutMs: 120_000,
    });

    for (const profile of Object.values(runtime.workers.listProfiles())) {
      await runtime.workers.spawn(profile);
    }
  }, 180_000);

  afterAll(async () => {
    await runtime?.stop();
    restoreEnv?.();
  });

  test("no-bash worker CANNOT execute shell commands", async () => {
    const result = await runtime.workers.send("nobash",
      "Run `echo hello` in the shell and tell me the output",
      { timeout: 60_000 }
    );

    const response = (result.response ?? "").toLowerCase();
    // Should indicate inability to run bash
    expect(
      response.includes("cannot") ||
      response.includes("unable") ||
      response.includes("don't have") ||
      response.includes("no bash") ||
      response.includes("not available")
    ).toBe(true);
  }, 90_000);

  test("bash-allowed worker CAN execute safe commands", async () => {
    const result = await runtime.workers.send("bashallowed",
      "Run `echo hello123` and tell me the output",
      { timeout: 60_000 }
    );

    expect(result.success).toBe(true);
    expect(result.response).toMatch(/hello123/);
  }, 90_000);
});
```
</div>

### 2.3 Tool-Level Permissions

<div class="impl-box">
<div class="impl-title">test/evals/permissions-tools.eval.ts</div>

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createTestWorkerRuntime } from "../helpers/worker-runtime";
import { setupE2eEnv } from "../helpers/e2e-env";
import type { WorkerProfile } from "../../src/types";

describe("tool permission tests", () => {
  let runtime: Awaited<ReturnType<typeof createTestWorkerRuntime>>;
  let restoreEnv: () => void;

  beforeAll(async () => {
    const env = await setupE2eEnv();
    restoreEnv = env.restore;

    // Worker with only Read tool
    const readOnlyTools: WorkerProfile = {
      id: "readtools",
      name: "Read Tools Only",
      model: "opencode/gpt-5-nano",
      purpose: "Read only",
      whenToUse: "Reading",
      tools: {
        Read: true,
        Write: false,
        Edit: false,
        Bash: false,
      },
    };

    // Worker with no tools at all
    const noTools: WorkerProfile = {
      id: "notools",
      name: "No Tools",
      model: "opencode/gpt-5-nano",
      purpose: "Chat only",
      whenToUse: "Discussion",
      tools: {
        Read: false,
        Write: false,
        Edit: false,
        Bash: false,
        Glob: false,
        Grep: false,
      },
    };

    runtime = await createTestWorkerRuntime({
      profiles: { readtools: readOnlyTools, notools: noTools },
      directory: process.cwd(),
      timeoutMs: 120_000,
    });

    for (const profile of Object.values(runtime.workers.listProfiles())) {
      await runtime.workers.spawn(profile);
    }
  }, 180_000);

  afterAll(async () => {
    await runtime?.stop();
    restoreEnv?.();
  });

  test("read-only-tools worker cannot use Write tool", async () => {
    const result = await runtime.workers.send("readtools",
      "Create a new file called /tmp/test-perm.txt with content 'test'",
      { timeout: 60_000 }
    );

    const response = (result.response ?? "").toLowerCase();
    expect(
      response.includes("cannot") ||
      response.includes("unable") ||
      response.includes("don't have access") ||
      response.includes("write tool")
    ).toBe(true);
  }, 90_000);

  test("no-tools worker can only chat", async () => {
    const result = await runtime.workers.send("notools",
      "What is 2 + 2?",
      { timeout: 60_000 }
    );

    expect(result.success).toBe(true);
    expect(result.response).toMatch(/4|four/i);
  }, 90_000);
});
```
</div>

---

## Part 3: Massive Task E2E Tests

<div class="gap-card critical">
  <div class="gap-title">Massive Task Tests: Real-World Complexity</div>
  <div class="gap-desc">
    Test with large inputs, multi-step tasks, and complex requirements — not just "reply OK".
  </div>
</div>

### 3.1 Sync Massive Tasks

<div class="impl-box">
<div class="impl-title">test/evals/massive-tasks-sync.eval.ts</div>

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createTestWorkerRuntime } from "../helpers/worker-runtime";
import { setupE2eEnv } from "../helpers/e2e-env";
import type { WorkerProfile } from "../../src/types";

// Generate large code file
function generateLargeCodebase(lines: number): string {
  const code: string[] = [];
  for (let i = 0; i < lines; i++) {
    code.push(`function func${i}(x) { return x * ${i}; } // Line ${i}`);
  }
  return code.join("\n");
}

// Generate complex task description
function generateComplexSpec(): string {
  return `
## User Management System Specification

### Requirements
1. Create a User class with:
   - Properties: id (UUID), name, email, createdAt, updatedAt
   - Methods: validate(), toJSON(), fromJSON()

2. Create a UserRepository class with:
   - Methods: create(user), findById(id), findByEmail(email), update(user), delete(id)
   - In-memory storage using Map

3. Create a UserService class with:
   - Dependency injection for repository
   - Methods: registerUser(name, email), getUserProfile(id), updateEmail(id, newEmail)
   - Validation: email must be valid, name must be non-empty

4. Error handling:
   - UserNotFoundError for missing users
   - ValidationError for invalid data
   - DuplicateEmailError for existing emails

5. Include JSDoc comments for all public methods

Implement all classes in TypeScript with proper types.
`;
}

describe("sync massive task tests", () => {
  let runtime: Awaited<ReturnType<typeof createTestWorkerRuntime>>;
  let restoreEnv: () => void;

  beforeAll(async () => {
    const env = await setupE2eEnv();
    restoreEnv = env.restore;

    const profile: WorkerProfile = {
      id: "coder",
      name: "Coder",
      model: "opencode/gpt-5-nano",
      purpose: "Code implementation",
      whenToUse: "Writing code",
    };

    runtime = await createTestWorkerRuntime({
      profiles: { coder: profile },
      directory: process.cwd(),
      timeoutMs: 300_000, // 5 min for massive tasks
    });
    await runtime.workers.spawn(profile);
  }, 180_000);

  afterAll(async () => {
    await runtime?.stop();
    restoreEnv?.();
  });

  test("analyzes 500-line codebase", async () => {
    const largeCode = generateLargeCodebase(500);
    
    const result = await runtime.workers.send("coder",
      `Analyze this codebase and identify:\n1. Total number of functions\n2. Any patterns you see\n3. Suggestions for improvement\n\n\`\`\`javascript\n${largeCode}\n\`\`\``,
      { timeout: 180_000 }
    );

    expect(result.success).toBe(true);
    const response = result.response ?? "";
    
    // Should identify correct count
    expect(response).toMatch(/500|five hundred/i);
    // Should identify the pattern
    expect(response).toMatch(/pattern|repetitive|similar/i);
  }, 240_000);

  test("implements complex multi-class system", async () => {
    const spec = generateComplexSpec();
    
    const result = await runtime.workers.send("coder",
      `Implement the following system:\n${spec}`,
      { timeout: 180_000 }
    );

    expect(result.success).toBe(true);
    const response = result.response ?? "";
    
    // Must have all classes
    expect(response).toMatch(/class\s+User/);
    expect(response).toMatch(/class\s+UserRepository/);
    expect(response).toMatch(/class\s+UserService/);
    
    // Must have error classes
    expect(response).toMatch(/UserNotFoundError|NotFoundError/);
    expect(response).toMatch(/ValidationError/);
    
    // Must have methods
    expect(response).toMatch(/validate\s*\(/);
    expect(response).toMatch(/toJSON\s*\(/);
    expect(response).toMatch(/registerUser|createUser/i);
  }, 240_000);

  test("refactors 20 related functions into a class", async () => {
    const functions = Array.from({ length: 20 }, (_, i) => 
      `function calculateTax${i}(amount) { return amount * 0.${10 + i}; }`
    ).join("\n\n");

    const result = await runtime.workers.send("coder",
      `Refactor these 20 similar functions into a single TaxCalculator class with a configurable rate:\n\n\`\`\`javascript\n${functions}\n\`\`\``,
      { timeout: 120_000 }
    );

    expect(result.success).toBe(true);
    const response = result.response ?? "";
    
    // Should create a class
    expect(response).toMatch(/class\s+TaxCalculator/);
    // Should have configurable rate
    expect(response).toMatch(/rate|percentage|constructor/i);
    // Should NOT have 20 separate functions
    const functionCount = (response.match(/function\s+calculateTax\d+/g) || []).length;
    expect(functionCount).toBeLessThan(5);
  }, 180_000);

  test("generates comprehensive API documentation", async () => {
    const apiCode = `
export class PaymentService {
  constructor(private gateway: PaymentGateway, private logger: Logger) {}
  
  async processPayment(amount: number, currency: string, cardToken: string): Promise<PaymentResult> {
    // Process payment
  }
  
  async refund(transactionId: string, amount?: number): Promise<RefundResult> {
    // Process refund
  }
  
  async getTransaction(id: string): Promise<Transaction | null> {
    // Get transaction
  }
  
  async listTransactions(filters: TransactionFilters): Promise<Transaction[]> {
    // List transactions
  }
}`;

    const result = await runtime.workers.send("coder",
      `Generate comprehensive API documentation for this service including:\n- Method descriptions\n- Parameter documentation\n- Return type documentation\n- Example usage\n- Error cases\n\n\`\`\`typescript\n${apiCode}\n\`\`\``,
      { timeout: 120_000 }
    );

    expect(result.success).toBe(true);
    const response = result.response ?? "";
    
    // Must document all methods
    expect(response).toMatch(/processPayment/);
    expect(response).toMatch(/refund/);
    expect(response).toMatch(/getTransaction/);
    expect(response).toMatch(/listTransactions/);
    
    // Must have examples
    expect(response).toMatch(/example|usage/i);
    
    // Must document parameters
    expect(response).toMatch(/amount|currency|cardToken/);
  }, 180_000);
});
```
</div>

### 3.2 Async Massive Tasks

<div class="impl-box">
<div class="impl-title">test/evals/massive-tasks-async.eval.ts</div>

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import type { ToolContext } from "@opencode-ai/plugin";
import { createTestCoreRuntime } from "../helpers/core-runtime";
import { setupE2eEnv } from "../helpers/e2e-env";
import type { WorkerProfile } from "../../src/types";

describe("async massive task tests", () => {
  let core: Awaited<ReturnType<typeof createTestCoreRuntime>>;
  let restoreEnv: () => void;

  const mockContext: ToolContext = {
    agent: "test",
    sessionID: "test-session",
    messageID: "test-msg",
    abort: new AbortController().signal,
  };

  beforeAll(async () => {
    const env = await setupE2eEnv();
    restoreEnv = env.restore;

    const coderProfile: WorkerProfile = {
      id: "coder",
      name: "Coder",
      model: "opencode/gpt-5-nano",
      purpose: "Code implementation",
      whenToUse: "Writing code",
    };

    const docsProfile: WorkerProfile = {
      id: "docs",
      name: "Docs",
      model: "opencode/gpt-5-nano",
      purpose: "Documentation",
      whenToUse: "Research and docs",
    };

    core = await createTestCoreRuntime({
      profiles: { coder: coderProfile, docs: docsProfile },
      directory: process.cwd(),
    });
    
    await core.workers.spawn(coderProfile);
    await core.workers.spawn(docsProfile);
  }, 180_000);

  afterAll(async () => {
    await core?.stop();
    restoreEnv?.();
  });

  test("parallel async tasks complete independently", async () => {
    // Start 3 async jobs in parallel
    const jobs = await Promise.all([
      core.tools.tool.ask_worker_async.execute(
        { workerId: "coder", message: "Write a function to reverse a string" },
        mockContext
      ),
      core.tools.tool.ask_worker_async.execute(
        { workerId: "coder", message: "Write a function to check if number is prime" },
        mockContext
      ),
      core.tools.tool.ask_worker_async.execute(
        { workerId: "docs", message: "Explain what a closure is in JavaScript" },
        mockContext
      ),
    ]);

    const jobIds = jobs.map(j => JSON.parse(String(j)).jobId);
    expect(jobIds.length).toBe(3);
    expect(jobIds.every(id => typeof id === "string")).toBe(true);

    // Await all jobs
    const results = await Promise.all(
      jobIds.map(jobId => 
        core.tools.tool.await_worker_job.execute(
          { jobId, timeoutMs: 120_000 },
          mockContext
        )
      )
    );

    // All should succeed
    for (const resultStr of results) {
      const result = JSON.parse(String(resultStr));
      expect(result.status).toBe("succeeded");
      expect(result.responseText.length).toBeGreaterThan(0);
    }
  }, 300_000);

  test("async job tracks timing accurately", async () => {
    const startTime = Date.now();
    
    const started = await core.tools.tool.ask_worker_async.execute(
      { workerId: "coder", message: "Write a bubble sort implementation with comments" },
      mockContext
    );
    const jobId = JSON.parse(String(started)).jobId;

    const resultStr = await core.tools.tool.await_worker_job.execute(
      { jobId, timeoutMs: 120_000 },
      mockContext
    );
    const result = JSON.parse(String(resultStr));
    const endTime = Date.now();

    expect(result.status).toBe("succeeded");
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.durationMs).toBeLessThanOrEqual(endTime - startTime + 1000);
    
    // Should have reasonable timing (not instant, not forever)
    expect(result.durationMs).toBeGreaterThan(100);
    expect(result.durationMs).toBeLessThan(120_000);
  }, 180_000);

  test("async complex task produces quality output", async () => {
    const complexTask = `
Create a complete implementation of a LRU (Least Recently Used) Cache with:
1. Constructor that takes capacity
2. get(key) method - returns value or -1
3. put(key, value) method - adds/updates entry
4. Both operations must be O(1)
5. Include comments explaining the approach
6. Include example usage
`;

    const started = await core.tools.tool.ask_worker_async.execute(
      { workerId: "coder", message: complexTask },
      mockContext
    );
    const jobId = JSON.parse(String(started)).jobId;

    const resultStr = await core.tools.tool.await_worker_job.execute(
      { jobId, timeoutMs: 180_000 },
      mockContext
    );
    const result = JSON.parse(String(resultStr));

    expect(result.status).toBe("succeeded");
    const response = result.responseText;

    // Quality checks
    expect(response).toMatch(/class\s+LRU|LRUCache/i);
    expect(response).toMatch(/get\s*\(/);
    expect(response).toMatch(/put\s*\(/);
    expect(response).toMatch(/Map|HashMap|dictionary/i);
    expect(response).toMatch(/O\(1\)|constant|doubly.*linked/i);
  }, 240_000);

  test("multiple workers handle parallel massive tasks", async () => {
    // Complex task for coder
    const coderTask = `
Implement a complete EventEmitter class with:
- on(event, callback)
- off(event, callback)  
- emit(event, ...args)
- once(event, callback)
Include TypeScript types.
`;

    // Complex task for docs
    const docsTask = `
Write comprehensive documentation explaining:
1. What the Observer pattern is
2. How EventEmitters implement it
3. Common use cases
4. Best practices
5. Potential pitfalls
`;

    // Start both async
    const [coderJob, docsJob] = await Promise.all([
      core.tools.tool.ask_worker_async.execute(
        { workerId: "coder", message: coderTask },
        mockContext
      ),
      core.tools.tool.ask_worker_async.execute(
        { workerId: "docs", message: docsTask },
        mockContext
      ),
    ]);

    const coderJobId = JSON.parse(String(coderJob)).jobId;
    const docsJobId = JSON.parse(String(docsJob)).jobId;

    // Await both
    const [coderResult, docsResult] = await Promise.all([
      core.tools.tool.await_worker_job.execute({ jobId: coderJobId, timeoutMs: 180_000 }, mockContext),
      core.tools.tool.await_worker_job.execute({ jobId: docsJobId, timeoutMs: 180_000 }, mockContext),
    ]);

    const coder = JSON.parse(String(coderResult));
    const docs = JSON.parse(String(docsResult));

    // Both succeed
    expect(coder.status).toBe("succeeded");
    expect(docs.status).toBe("succeeded");

    // Coder output quality
    expect(coder.responseText).toMatch(/class\s+EventEmitter/);
    expect(coder.responseText).toMatch(/on\s*\(|addEventListener/);
    expect(coder.responseText).toMatch(/emit\s*\(/);

    // Docs output quality
    expect(docs.responseText).toMatch(/observer|pattern/i);
    expect(docs.responseText).toMatch(/event|emit/i);
    expect(docs.responseText.length).toBeGreaterThan(500);
  }, 300_000);
});
```
</div>

---

## Implementation Summary

| Test Category | Tests | Purpose |
|---------------|-------|---------|
| **Quality: Coding** | 4 | Verify code fixes, implementations, refactoring |
| **Quality: Routing** | 20+ | Verify correct worker selection |
| **Permissions: Filesystem** | 4 | Read/write/none access levels |
| **Permissions: Bash** | 2 | Shell command restrictions |
| **Permissions: Tools** | 2 | Individual tool enable/disable |
| **Massive Sync** | 4 | Large codebases, complex specs |
| **Massive Async** | 4 | Parallel jobs, timing, quality |

### Success Criteria

| Metric | Target |
|--------|--------|
| Routing accuracy | ≥ 80% |
| Permission enforcement | 100% |
| Massive task completion | ≥ 90% |
| Async job reliability | 100% |
| Quality eval pass rate | ≥ 75% |

---

<div class="footer">
  E2E Testing Strategy • December 27, 2025<br/>
  Focus: Quality, Permissions, Massive Tasks (Sync & Async)
</div>
