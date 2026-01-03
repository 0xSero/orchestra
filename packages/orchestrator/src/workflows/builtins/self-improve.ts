import type { WorkflowDefinition } from "../types";

export const SELF_IMPROVE_WORKFLOW_ID = "self-improve";

export function buildSelfImproveWorkflow(): WorkflowDefinition {
  return {
    id: SELF_IMPROVE_WORKFLOW_ID,
    name: "Self Improvement",
    description:
      "Analyze, propose, implement, and validate orchestrator improvements",
    steps: [
      {
        id: "analyze",
        title: "Analyze Current State",
        workerId: "architect",
        prompt: `Analyze the orchestrator's recent performance and identify improvement opportunities.

Context from memory and recent activity:
{task}

Look for:
1. Confusion in prompts or unclear instructions
2. Errors or timeouts that occurred
3. Inefficient patterns or workflows
4. Missing capabilities or documentation

Return a structured analysis with specific issues and their severity.`,
        carry: false,
        timeoutMs: 180000,
      },
      {
        id: "propose",
        title: "Propose Improvements",
        workerId: "architect",
        prompt: `Based on this analysis, propose specific improvements:

{carry}

For each improvement:
1. What file(s) to modify
2. What specific changes to make
3. Expected impact
4. Risk level (low/medium/high)

Prioritize low-risk, high-impact changes. Limit to 3 improvements max.`,
        carry: true,
        timeoutMs: 180000,
      },
      {
        id: "implement",
        title: "Implement Changes",
        workerId: "coder",
        prompt: `Implement these proposed improvements:

{carry}

Rules:
- Only modify files in packages/orchestrator/prompts/ or packages/orchestrator/src/config/
- Make minimal, surgical changes
- Do NOT delete tests or existing functionality
- Create a git commit for each change

After implementing, list exactly what was changed.`,
        carry: true,
        timeoutMs: 300000,
      },
      {
        id: "validate",
        title: "Validate Changes",
        workerId: "coder",
        prompt: `Validate the implemented changes:

Changes made:
{carry}

Run: npm run check

If validation fails:
1. Identify what broke
2. Revert the problematic change with git checkout
3. Report what was reverted and why

If validation passes, report success.`,
        carry: true,
        timeoutMs: 300000,
      },
    ],
  };
}
