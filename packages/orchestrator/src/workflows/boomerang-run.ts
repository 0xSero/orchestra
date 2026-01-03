import type { WorkflowDefinition, WorkflowStepDefinition } from "./types";

const defaultSteps: WorkflowStepDefinition[] = [
  {
    id: "implement",
    title: "Implement",
    workerId: "coder",
    prompt:
      "You are the coder. Execute the task described below.\n\n" +
      "Task:\n{task}\n\n" +
      "{{snippet:workflow-handoff-schema}}\n\n" +
      "Guidance: Keep output concise. Artifacts must list files/commands. Next should be 'Done' when complete.",
    carry: false,
  },
];

export function buildBoomerangRunWorkflow(): WorkflowDefinition {
  return {
    id: "boomerang-run",
    name: "Boomerang Run",
    description: "Execute tasks/task-XX.md files sequentially in FIFO order.",
    steps: defaultSteps,
  };
}
