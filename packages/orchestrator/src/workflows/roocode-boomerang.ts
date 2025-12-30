import type { WorkflowDefinition, WorkflowStepDefinition } from "./types";
import type { WorkflowStepConfig } from "../types";

const defaultSteps: WorkflowStepDefinition[] = [
  {
    id: "plan",
    title: "Plan",
    workerId: "architect",
    prompt:
      "You are the architect. Create a concise plan for the task.\n\n" +
      "Task:\n{task}\n\n" +
      "Return a numbered checklist with 3-6 steps.",
    carry: false,
  },
  {
    id: "implement",
    title: "Implement",
    workerId: "coder",
    prompt:
      "You are the coder. Implement the plan for the task.\n\n" +
      "Task:\n{task}\n\n" +
      "Plan:\n{carry}\n\n" +
      "Return what you changed and any important notes.",
    carry: true,
  },
  {
    id: "review",
    title: "Review",
    workerId: "architect",
    prompt:
      "You are the reviewer. Check the implementation for correctness, edge cases, and missing tests.\n\n" +
      "Task:\n{task}\n\n" +
      "Implementation:\n{carry}\n\n" +
      "Return issues and recommended fixes (or say 'no issues').",
    carry: true,
  },
  {
    id: "fix",
    title: "Fix",
    workerId: "coder",
    prompt:
      "Apply fixes based on the review. If no fixes are needed, say 'No changes needed' and restate the final output.\n\n" +
      "Task:\n{task}\n\n" +
      "Review:\n{carry}",
    carry: true,
  },
];

function resolveStep(base: WorkflowStepDefinition | undefined, override: WorkflowStepConfig): WorkflowStepDefinition {
  const prompt = override.prompt ?? base?.prompt ?? "Task:\n{task}";
  return {
    id: override.id,
    title: override.title ?? base?.title ?? override.id,
    workerId: override.workerId ?? base?.workerId ?? "coder",
    prompt,
    carry: typeof override.carry === "boolean" ? override.carry : base?.carry ?? true,
    timeoutMs: typeof override.timeoutMs === "number" ? override.timeoutMs : base?.timeoutMs,
  };
}

export function buildRooCodeBoomerangWorkflow(overrides?: WorkflowStepConfig[]): WorkflowDefinition {
  let steps = defaultSteps;
  if (overrides && overrides.length > 0) {
    const byId = new Map(defaultSteps.map((s) => [s.id, s]));
    steps = overrides.map((s) => resolveStep(byId.get(s.id), s));
  }

  return {
    id: "roocode-boomerang",
    name: "RooCode Boomerang",
    description: "Plan, implement, review, and fix in a tight loop with bounded carry.",
    steps,
  };
}
