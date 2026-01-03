import { randomUUID } from "node:crypto";
import type {
  WorkflowDefinition,
  WorkflowRunInput,
  WorkflowRunResult,
  WorkflowStepDefinition,
  WorkflowStepResult,
} from "./types";
import { publishOrchestratorEvent } from "../core/orchestrator-events";
import { logger } from "../core/logger";
import { expandPromptSnippets } from "../prompts/load";

const workflows = new Map<string, WorkflowDefinition>();

export type WorkflowRunDependencies = {
  resolveWorker: (workerId: string, autoSpawn: boolean) => Promise<string>;
  sendToWorker: (
    workerId: string,
    message: string,
    options: {
      attachments?: WorkflowRunInput["attachments"];
      timeoutMs: number;
      model?: string;
    },
  ) => Promise<{
    success: boolean;
    response?: string;
    warning?: string;
    error?: string;
  }>;
};

export function registerWorkflow(def: WorkflowDefinition) {
  workflows.set(def.id, def);
}

export function listWorkflows(): WorkflowDefinition[] {
  return [...workflows.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function getWorkflow(id: string): WorkflowDefinition | undefined {
  return workflows.get(id);
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{${key}}`, value);
  }
  return out;
}

const handoffSections = [
  "Summary",
  "Actions",
  "Artifacts",
  "Risks",
  "Next",
] as const;
const carrySections = ["Summary", "Artifacts", "Risks", "Next"] as const;
type HandoffSection = (typeof handoffSections)[number];
type CarrySection = (typeof carrySections)[number];
const handoffSectionMap = new Map(
  handoffSections.map((section) => [section.toLowerCase(), section]),
);
const carrySectionCaps: Record<CarrySection, number> = {
  Summary: 900,
  Artifacts: 1600,
  Risks: 900,
  Next: 900,
};

function normalizeSectionName(value: string): HandoffSection | undefined {
  return handoffSectionMap.get(value.trim().toLowerCase());
}

function extractHandoffSections(text: string): Record<HandoffSection, string> {
  const sections: Record<HandoffSection, string[]> = {
    Summary: [],
    Actions: [],
    Artifacts: [],
    Risks: [],
    Next: [],
  };
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      Summary: "",
      Actions: "",
      Artifacts: "",
      Risks: "",
      Next: "",
    };
  }

  const lines = trimmed.split(/\r?\n/);
  let current: HandoffSection | undefined;
  let sawHeading = false;
  const headingRegex =
    /^\s*(#{1,3}\s*)?(Summary|Actions|Artifacts|Risks|Next)\s*:?\s*$/i;

  for (const line of lines) {
    const match = line.match(headingRegex);
    if (match) {
      const key = normalizeSectionName(match[2] ?? "");
      if (key) {
        current = key;
        sawHeading = true;
        continue;
      }
    }

    if (current) sections[current].push(line);
  }

  const resolved: Record<HandoffSection, string> = {
    Summary: sections.Summary.join("\n").trim(),
    Actions: sections.Actions.join("\n").trim(),
    Artifacts: sections.Artifacts.join("\n").trim(),
    Risks: sections.Risks.join("\n").trim(),
    Next: sections.Next.join("\n").trim(),
  };

  if (!sawHeading) {
    resolved.Summary = trimmed;
  } else if (!resolved.Summary && resolved.Actions) {
    resolved.Summary = resolved.Actions;
  }

  return resolved;
}

function truncateText(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const suffix = "\n...(truncated)";
  const sliceEnd = Math.max(0, maxChars - suffix.length);
  return `${trimmed.slice(0, sliceEnd).trimEnd()}${suffix}`;
}

function compactCarrySections(
  sections: Record<HandoffSection, string>,
  maxCarryChars: number,
): {
  sections: Record<CarrySection, string>;
  truncatedSections: CarrySection[];
} {
  const totalCaps = Object.values(carrySectionCaps).reduce(
    (sum, value) => sum + value,
    0,
  );
  const scale = Math.min(1, maxCarryChars / (totalCaps + 200));
  const compacted = {} as Record<CarrySection, string>;
  const truncatedSections: CarrySection[] = [];

  for (const section of carrySections) {
    const baseCap = carrySectionCaps[section];
    const cap = Math.max(60, Math.floor(baseCap * scale));
    const content = sections[section] ?? "";
    if (content.length > cap) truncatedSections.push(section);
    compacted[section] = content ? truncateText(content, cap) : "";
  }

  return { sections: compacted, truncatedSections };
}

function formatCarryBlock(
  stepTitle: string,
  responseText: string,
  maxCarryChars: number,
): { text: string; truncated: boolean; truncatedSections: CarrySection[] } {
  const sections = extractHandoffSections(responseText);
  const compacted = compactCarrySections(sections, maxCarryChars);
  const truncatedSections = [...compacted.truncatedSections];
  let truncated = truncatedSections.length > 0;

  const blocks = carrySections
    .map((section) => {
      const content = compacted.sections[section];
      if (!content) return "";
      return `#### ${section}\n${content}`;
    })
    .filter(Boolean);

  if (blocks.length === 0) {
    const fallback = truncateText(
      responseText,
      Math.max(240, Math.floor(maxCarryChars / 4)),
    );
    if (fallback.length < responseText.trim().length) truncated = true;
    blocks.push(`#### Summary\n${fallback || "None"}`);
  }

  const block = `### ${stepTitle}\n${blocks.join("\n\n")}`;
  if (block.length <= maxCarryChars) {
    return { text: block, truncated, truncatedSections };
  }

  const reducedCap = Math.max(
    60,
    Math.floor(maxCarryChars / (blocks.length * 2)),
  );
  const reducedBlocks = blocks
    .map((sectionBlock) => truncateText(sectionBlock, reducedCap))
    .join("\n\n");
  const reduced = `### ${stepTitle}\n${reducedBlocks}`;
  truncated = true;
  const finalText =
    reduced.length <= maxCarryChars
      ? reduced
      : truncateText(reduced, maxCarryChars);
  return { text: finalText, truncated, truncatedSections };
}

function splitCarryBlocks(carry: string): string[] {
  const trimmed = carry.trim();
  if (!trimmed) return [];
  if (!trimmed.includes("### ")) return [trimmed];
  return trimmed
    .split(/\n(?=###\s)/g)
    .map((block) => block.trim())
    .filter(Boolean);
}

function appendCarry(
  existing: string,
  next: string,
  maxChars: number,
): { text: string; droppedBlocks: number; truncated: boolean } {
  const blocks = [...splitCarryBlocks(existing), next].filter(Boolean);
  if (blocks.length === 0)
    return { text: "", droppedBlocks: 0, truncated: false };

  const originalCount = blocks.length;
  while (blocks.join("\n\n").length > maxChars && blocks.length > 1) {
    blocks.shift();
  }

  const combined = blocks.join("\n\n");
  const droppedBlocks = Math.max(0, originalCount - blocks.length);
  if (combined.length <= maxChars) {
    return { text: combined, droppedBlocks, truncated: droppedBlocks > 0 };
  }
  return {
    text: truncateText(combined, maxChars),
    droppedBlocks,
    truncated: true,
  };
}

function truncateResponse(
  text: string,
  maxChars = 1200,
): { value: string; truncated: boolean } {
  if (text.length <= maxChars) return { value: text, truncated: false };
  return { value: text.slice(0, maxChars), truncated: true };
}

async function buildStepPrompt(
  step: WorkflowStepDefinition,
  task: string,
  carry: string,
): Promise<string> {
  const base = applyTemplate(step.prompt, { task, carry });
  return await expandPromptSnippets(base);
}

function resolveStepTimeout(
  step: WorkflowStepDefinition,
  limits: WorkflowRunInput["limits"],
): number {
  const requested =
    typeof step.timeoutMs === "number" &&
    Number.isFinite(step.timeoutMs) &&
    step.timeoutMs > 0
      ? step.timeoutMs
      : limits.perStepTimeoutMs;
  if (
    typeof limits.perStepTimeoutMs !== "number" ||
    !Number.isFinite(limits.perStepTimeoutMs)
  ) {
    return requested;
  }
  return Math.min(requested, limits.perStepTimeoutMs);
}

export function validateWorkflowInput(
  input: WorkflowRunInput,
  workflow: WorkflowDefinition,
): void {
  if (input.task.length > input.limits.maxTaskChars) {
    throw new Error(
      `Task exceeds maxTaskChars (${input.limits.maxTaskChars}).`,
    );
  }

  if (workflow.steps.length > input.limits.maxSteps) {
    throw new Error(
      `Workflow has ${workflow.steps.length} steps (maxSteps=${input.limits.maxSteps}).`,
    );
  }
}

export async function executeWorkflowStep(
  input: {
    runId: string;
    workflow: WorkflowDefinition;
    stepIndex: number;
    task: string;
    carry: string;
    autoSpawn: boolean;
    limits: WorkflowRunInput["limits"];
    attachments?: WorkflowRunInput["attachments"];
  },
  deps: WorkflowRunDependencies,
): Promise<{ step: WorkflowStepResult; response?: string; carry: string }> {
  const step = input.workflow.steps[input.stepIndex];
  const stepStarted = Date.now();
  const workerId = await deps.resolveWorker(step.workerId, input.autoSpawn);
  const prompt = await buildStepPrompt(step, input.task, input.carry);
  const res = await deps.sendToWorker(workerId, prompt, {
    attachments: input.stepIndex === 0 ? input.attachments : undefined,
    timeoutMs: resolveStepTimeout(step, input.limits),
    model: step.model,
  });
  const stepFinished = Date.now();
  if (!res.success) {
    const result: WorkflowStepResult = {
      id: step.id,
      title: step.title,
      workerId,
      status: "error",
      error: res.error ?? "unknown_error",
      startedAt: stepStarted,
      finishedAt: stepFinished,
      durationMs: stepFinished - stepStarted,
    };
    publishOrchestratorEvent("orchestra.workflow.step", {
      runId: input.runId,
      workflowId: input.workflow.id,
      workflowName: input.workflow.name,
      stepId: step.id,
      stepTitle: step.title,
      workerId,
      status: "error",
      startedAt: stepStarted,
      finishedAt: stepFinished,
      durationMs: stepFinished - stepStarted,
      error: res.error ?? "unknown_error",
    });
    return { step: result, carry: input.carry };
  }

  const response = res.response ?? "";
  const preview = truncateResponse(response);
  const result: WorkflowStepResult = {
    id: step.id,
    title: step.title,
    workerId,
    status: "success",
    response,
    ...(res.warning ? { warning: res.warning } : {}),
    startedAt: stepStarted,
    finishedAt: stepFinished,
    durationMs: stepFinished - stepStarted,
  };
  publishOrchestratorEvent("orchestra.workflow.step", {
    runId: input.runId,
    workflowId: input.workflow.id,
    workflowName: input.workflow.name,
    stepId: step.id,
    stepTitle: step.title,
    workerId,
    status: "success",
    startedAt: stepStarted,
    finishedAt: stepFinished,
    durationMs: stepFinished - stepStarted,
    response: preview.value,
    responseTruncated: preview.truncated,
    ...(res.warning ? { warning: res.warning } : {}),
  });

  if (step.carry) {
    const carryBlock = formatCarryBlock(
      step.title,
      response,
      input.limits.maxCarryChars,
    );
    const appended = appendCarry(
      input.carry,
      carryBlock.text,
      input.limits.maxCarryChars,
    );

    const trimmed =
      carryBlock.truncated || appended.truncated || appended.droppedBlocks > 0;

    if (trimmed) {
      const trimmedSections =
        carryBlock.truncatedSections.join(", ") || "summary";
      logger.warn(
        `[workflow] carry trimmed run=${input.runId} step=${step.id} dropped=${appended.droppedBlocks} sections=${trimmedSections}`,
      );
      publishOrchestratorEvent("orchestra.workflow.carry.trimmed", {
        runId: input.runId,
        workflowId: input.workflow.id,
        workflowName: input.workflow.name,
        stepId: step.id,
        stepTitle: step.title,
        maxCarryChars: input.limits.maxCarryChars,
        droppedBlocks: appended.droppedBlocks,
        truncatedSections: carryBlock.truncatedSections,
      });
    }

    return { step: result, response, carry: appended.text };
  }

  return { step: result, response, carry: input.carry };
}

export async function runWorkflow(
  input: WorkflowRunInput,
  deps: WorkflowRunDependencies,
): Promise<WorkflowRunResult> {
  const workflow = getWorkflow(input.workflowId);
  if (!workflow) {
    throw new Error(`Unknown workflow "${input.workflowId}".`);
  }

  validateWorkflowInput(input, workflow);

  const runId = randomUUID();
  const startedAt = Date.now();
  publishOrchestratorEvent("orchestra.workflow.started", {
    runId,
    workflowId: workflow.id,
    workflowName: workflow.name,
    task: input.task,
    startedAt,
  });

  const steps: WorkflowRunResult["steps"] = [];
  let carry = "";
  let status: WorkflowRunResult["status"] = "running";

  for (let i = 0; i < workflow.steps.length; i++) {
    const executed = await executeWorkflowStep(
      {
        runId,
        workflow,
        stepIndex: i,
        task: input.task,
        carry,
        autoSpawn: input.autoSpawn ?? true,
        limits: input.limits,
        attachments: input.attachments,
      },
      deps,
    );
    steps.push(executed.step);
    if (executed.step.status === "error") {
      status = "error";
      break;
    }
    carry = executed.carry;
  }

  const finishedAt = Date.now();
  const errorCount = steps.filter((step) => step.status === "error").length;
  publishOrchestratorEvent("orchestra.workflow.completed", {
    runId,
    workflowId: workflow.id,
    workflowName: workflow.name,
    status: errorCount > 0 ? "error" : "success",
    startedAt,
    finishedAt,
    durationMs: finishedAt - startedAt,
    steps: {
      total: steps.length,
      success: steps.length - errorCount,
      error: errorCount,
    },
  });

  return {
    runId,
    workflowId: workflow.id,
    workflowName: workflow.name,
    status: status === "error" ? "error" : "success",
    startedAt,
    finishedAt,
    currentStepIndex: Math.min(steps.length, workflow.steps.length),
    steps,
    lastStepResult: steps[steps.length - 1],
  };
}
