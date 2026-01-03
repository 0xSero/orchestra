import type { WorkflowDefinition, WorkflowStepDefinition } from "./types";

const defaultSteps: WorkflowStepDefinition[] = [
  {
    id: "plan",
    title: "Plan",
    workerId: "coder",
    prompt:
      "You are the planner for a boomerang project setup. " +
      "Your job is to read the target directory and write the planning artifacts.\n\n" +
      "Task:\n{task}\n\n" +
      "Inputs:\n" +
      "- Target directory: included in the task description (path or relative folder)\n" +
      "- Big goal: included in the task description\n\n" +
      "Required outputs (write files in the repo):\n" +
      "- scope.md: big picture, code map for the target directory, key components, risks\n" +
      "- rules.md: operational rules for executing tasks in order (format, testing, constraints)\n" +
      "- tasks/task-00.md ... tasks/task-NN.md: full task queue upfront\n\n" +
      "Task queue requirements:\n" +
      "- Tasks are ordered, numbered with two digits (task-00, task-01, ...)\n" +
      "- Each task is 15-60 minutes of work and fully self-contained\n" +
      "- Each task file must include headings: Goal, Before, After, Acceptance criteria, Files to touch, Test plan\n" +
      "- Generate the full queue upfront; remove any stale tasks not in the new queue\n\n" +
      "Process:\n" +
      "1) Read the target directory to build the code map\n" +
      "2) Draft scope.md and rules.md\n" +
      "3) Write the complete tasks/ queue\n\n" +
      "{{snippet:workflow-handoff-schema}}\n\n" +
      "Guidance: Keep output concise; ensure files are written in the repo.",
    carry: false,
  },
];

export function buildBoomerangPlanWorkflow(): WorkflowDefinition {
  return {
    id: "boomerang-plan",
    name: "Boomerang Plan",
    description:
      "Generate scope.md, rules.md, and a full tasks/ queue for a target directory.",
    steps: defaultSteps,
  };
}
