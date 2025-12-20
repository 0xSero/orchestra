import type { WorkflowDefinition } from "./types";

/**
 * Roocode-style "sequential boomerang" workflow.
 *
 * Pattern:
 * - Architect plans (constraints + risks)
 * - Coder implements based on plan
 * - Architect reviews + produces actionable fixes
 * - Coder applies fixes
 *
 * This is intentionally deterministic + checklist-driven to keep cost predictable.
 */
export const roocodeBoomerangWorkflow: WorkflowDefinition = {
  id: "roocode.boomerang.sequential",
  name: "Roocode Boomerang (Sequential)",
  description:
    "A sequential back-and-forth between Architect and Coder: plan → implement → review → fix. Good default for high-quality changes with controlled cost.",
  requiredWorkers: ["architect", "coder"],
  steps: [
    {
      id: "plan",
      title: "Plan",
      workerId: "architect",
      timeoutMs: 180_000,
      prompt: ({ task }) =>
        [
          "You are the Architect in a Roocode-style boomerang workflow.",
          "",
          "Produce a plan that a separate Coder will implement.",
          "",
          "Requirements:",
          "- Be specific: list files to change, new modules to add, and key functions/types.",
          "- Include security notes: input validation, least privilege, secret handling, safe defaults.",
          "- Include a tight test plan: what to run locally and what success looks like.",
          "",
          "Task:",
          task,
        ].join("\n"),
    },
    {
      id: "implement",
      title: "Implement",
      workerId: "coder",
      timeoutMs: 240_000,
      prompt: ({ task, outputs }) =>
        [
          "You are the Coder in a Roocode-style boomerang workflow.",
          "",
          "Implement the task using the Architect plan. Prefer minimal, clean, well-tested changes.",
          "",
          "Constraints:",
          "- Do not introduce new dependencies unless necessary.",
          "- Keep code modular and open-source ready.",
          "- Follow existing project conventions.",
          "",
          "Task:",
          task,
          "",
          "Architect plan:",
          outputs.plan ?? "(missing plan)",
        ].join("\n"),
    },
    {
      id: "review",
      title: "Review",
      workerId: "architect",
      timeoutMs: 180_000,
      prompt: ({ task, outputs }) =>
        [
          "You are the Architect reviewing the Coder's work in a Roocode-style boomerang workflow.",
          "",
          "Provide a strict review with actionable fixes. Focus on:",
          "- Correctness, edge cases, and backward compatibility",
          "- Security (especially input validation, file/path handling, and secrets)",
          "- API/design cleanliness and modularity",
          "- Test gaps and documentation gaps",
          "",
          "Output format:",
          "1) Summary (2-5 bullets)",
          "2) Required fixes (checklist)",
          "3) Nice-to-haves (optional)",
          "",
          "Task:",
          task,
          "",
          "Plan:",
          outputs.plan ?? "(missing plan)",
          "",
          "Implementation notes/output:",
          outputs.implement ?? "(missing implementation output)",
        ].join("\n"),
    },
    {
      id: "fix",
      title: "Fix",
      workerId: "coder",
      timeoutMs: 240_000,
      prompt: ({ task, outputs }) =>
        [
          "You are the Coder applying the Architect's review fixes in a Roocode-style boomerang workflow.",
          "",
          "Apply all required fixes. If you disagree with a fix, explain why and propose an alternative.",
          "",
          "Task:",
          task,
          "",
          "Architect review:",
          outputs.review ?? "(missing review)",
        ].join("\n"),
    },
  ],
};

