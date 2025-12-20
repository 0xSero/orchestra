# Workflows

The Orchestrator plugin supports predefined workflows that coordinate multiple workers to complete complex tasks.

## Roocode Boomerang

The "Roocode Boomerang" is a sequential workflow designed to refine a task through multiple stages of specialized workers. By default, it follows this chain:

**Architect -> Coder -> Reviewer**

1.  **Architect**: Analyzes the input, plans the solution, and provides high-level design.
2.  **Coder**: Implements the solution based on the architect's plan.
3.  **Reviewer**: Reviews the code for quality, security, and correctness.

### Usage

You can run this workflow using the `run_workflow` tool:

```bash
run_workflow({
  workflowId: "roocode-boomerang",
  input: "Implement a secure login system with JWT and 2FA"
})
```

### Customizing the Chain

You can override the default worker chain by providing the `workerChain` argument:

```bash
run_workflow({
  workflowId: "roocode-boomerang",
  input: "Refactor this component",
  workerChain: ["coder", "reviewer"]
})
```

## Creating Custom Workflows

(Coming soon: Defining workflows in `orchestrator.json`)
