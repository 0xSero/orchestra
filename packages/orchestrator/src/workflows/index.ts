import type { OrchestratorConfig } from "../types";
import { registerWorkflow } from "./engine";
import { buildRooCodeBoomerangWorkflow } from "./roocode-boomerang";
import { buildVisionWorkflow } from "./builtins/vision";
import { buildMemoryWorkflow } from "./builtins/memory";
import type { WorkflowDefinition, WorkflowStepDefinition } from "./types";
import type { WorkflowDefinitionConfig, WorkflowStepConfig } from "../types";
import { asStringArray } from "../helpers/format";

let loaded = false;

export function loadWorkflows(config: OrchestratorConfig) {
  if (loaded) return;
  loaded = true;

  if (config.workflows?.enabled === false) return;

  registerWorkflow(buildVisionWorkflow());
  registerWorkflow(buildMemoryWorkflow());

  const roocode = config.workflows?.roocodeBoomerang;
  if (roocode?.enabled !== false) {
    registerWorkflow(buildRooCodeBoomerangWorkflow(roocode?.steps));
  }

  for (const def of config.workflows?.definitions ?? []) {
    const resolved = resolveWorkflowDefinition(def);
    if (resolved) registerWorkflow(resolved);
  }
}

function resolveStepConfig(
  step: WorkflowStepConfig,
): WorkflowStepDefinition | undefined {
  const id = step.id;
  if (!id) return undefined;
  const workerId = step.workerId ?? "coder";
  const prompt = step.prompt ?? "Task:\n{task}";
  const requiredSkills = step.requiredSkills
    ? (asStringArray(step.requiredSkills) ?? [])
    : [];
  return {
    id,
    title: step.title ?? id,
    workerId,
    prompt,
    carry: typeof step.carry === "boolean" ? step.carry : false,
    timeoutMs: typeof step.timeoutMs === "number" ? step.timeoutMs : undefined,
    ...(requiredSkills.length > 0 ? { requiredSkills } : {}),
  };
}

function resolveWorkflowDefinition(
  def: WorkflowDefinitionConfig,
): WorkflowDefinition | undefined {
  if (!def || typeof def.id !== "string") return undefined;
  if (!Array.isArray(def.steps) || def.steps.length === 0) return undefined;
  const steps = def.steps
    .map(resolveStepConfig)
    .filter(Boolean) as WorkflowStepDefinition[];
  if (steps.length === 0) return undefined;
  return {
    id: def.id,
    name: def.name ?? def.id,
    description: def.description ?? "",
    steps,
  };
}
