export type { WorkflowDefinition, WorkflowRunResult, WorkflowStep, WorkflowStepResult } from "./types";
export { createWorkflowEngine, type WorkflowEngine } from "./engine";
export { roocodeBoomerangWorkflow } from "./roocode-boomerang";

import { roocodeBoomerangWorkflow } from "./roocode-boomerang";
import type { WorkflowDefinition } from "./types";

export const builtInWorkflows: WorkflowDefinition[] = [roocodeBoomerangWorkflow];

