import type { WorkflowDefinition, WorkflowStepDefinition } from "./types";

const planSteps: WorkflowStepDefinition[] = [
  {
    id: "plan",
    title: "Plan Queue",
    workerId: "architect",
    prompt:
      "You are the architect. Create a small, safe task queue for an autonomous improvement cycle.\n\n" +
      "Input:\n{task}\n\n" +
      "Output requirements:\n" +
      "- Propose up to 6 tasks, each 15–60 minutes and fully self-contained\n" +
      "- Each task should have clear acceptance criteria and a test plan\n" +
      "- Prefer changes that improve reliability, safety, and developer UX\n\n" +
      "In Artifacts, include a JSON array named TASKS with entries:\n" +
      `- id (task-00, task-01, ...)\n` +
      `- title\n` +
      `- goal\n` +
      `- before\n` +
      `- after\n` +
      `- acceptance\n` +
      `- filesToTouch\n` +
      `- testPlan\n\n` +
      "{{snippet:workflow-handoff-schema}}\n\n" +
      "Guidance: Keep tasks small and bounded. Avoid broad refactors.",
    carry: true,
  },
  {
    id: "write",
    title: "Write Queue",
    workerId: "coder",
    prompt:
      "You are the coder. Write the planned task queue to disk.\n\n" +
      "Input:\n{task}\n\n" +
      "Plan:\n{carry}\n\n" +
      "Rules:\n" +
      "- Only create/update files inside the specified queue directory\n" +
      "- Write one file per task: task-00.md, task-01.md, ...\n" +
      "- Each task file must include headings: Goal, Before, After, Acceptance criteria, Files to touch, Test plan\n\n" +
      "{{snippet:workflow-handoff-schema}}\n\n" +
      "Guidance: Keep formatting consistent and make tasks actionable.",
    carry: false,
  },
];

export function buildInfiniteOrchestraPlanWorkflow(): WorkflowDefinition {
  return {
    id: "infinite-orchestra-plan",
    name: "Infinite Orchestra Plan",
    description: "Generate a bounded task queue for an autonomous cycle.",
    steps: planSteps,
  };
}

const cycleSteps: WorkflowStepDefinition[] = [
  {
    id: "cycle",
    title: "Cycle",
    workerId: "coder",
    prompt: "Task:\n{task}\n\n{{snippet:workflow-handoff-schema}}",
    carry: false,
  },
];

export function buildInfiniteOrchestraWorkflow(): WorkflowDefinition {
  return {
    id: "infinite-orchestra",
    name: "Infinite Orchestra",
    description:
      "Continuously plan and execute small improvement tasks with safety rails.",
    steps: cycleSteps,
  };
}
