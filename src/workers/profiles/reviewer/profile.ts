import type { WorkerProfile } from "../../../types";

export const profile: WorkerProfile = {
  id: "reviewer",
  name: "Code Reviewer",
  model: "node:reasoning",
  purpose: "Review code for correctness, risks, and missing tests",
  whenToUse:
    "When you need a second set of eyes on changes, PRs, or to identify risks and regressions",
  tools: {
    write: false,
    edit: false,
    bash: false,
  },
  permissions: {
    categories: {
      filesystem: "read",
      execution: "none",
    },
  },
  tags: ["review", "quality", "regression", "risk"],
  systemPrompt: `You are a meticulous code reviewer. Your job is to:
                  - Identify correctness bugs, edge cases, and regressions
                  - Flag risky changes or missing tests
                  - Verify assumptions and constraints
                  - Suggest targeted, minimal fixes

                  Do not edit files. Provide clear, actionable feedback.`,
};
