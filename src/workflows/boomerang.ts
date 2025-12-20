import type { WorkflowConfig } from "../types";

export const boomerangWorkflow: WorkflowConfig = {
  id: "roocode-boomerang",
  name: "Roocode Boomerang",
  description: "Sequential execution task that bounces through a chain of workers (Architect -> Coder -> Reviewer)",
  type: "boomerang",
  workerChain: ["architect", "coder", "reviewer"]
};
