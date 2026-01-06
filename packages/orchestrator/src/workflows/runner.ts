import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import type { OrchestratorContext } from "../context/orchestrator-context";
import { logger } from "../core/logger";
import {
  publishErrorEvent,
  publishOrchestratorEvent,
} from "../core/orchestrator-events";
import { sendToWorker, spawnWorker } from "../workers/spawner";
import {
  executeWorkflowStep,
  getWorkflow,
  registerWorkflow,
  type WorkflowRunDependencies,
  validateWorkflowInput,
} from "./engine";
import type {
  WorkflowRunInput,
  WorkflowRunResult,
  WorkflowRunStatus,
  WorkflowSecurityLimits,
  WorkflowDefinition,
  WorkflowStepDefinition,
  WorkflowStepResult,
} from "./types";
import type { WorkflowUiPolicy } from "../types";
import {
  createWorkflowRunState,
  deleteWorkflowRun,
  getWorkflowRun,
  saveWorkflowRun,
  toWorkflowRunResult,
  type WorkflowRunState,
} from "./runs";
import { injectSessionNotice } from "../ux/wakeup";
import {
  clearWorkflowSkillContext,
  setWorkflowSkillContext,
} from "../skills/context";
import {
  collectWorkflowSkillRequirements,
  loadSkillConfig,
  resolveSkillPermissionMap,
  resolveSkillToolEnabled,
  validateSkills,
} from "../skills/preflight";
import { fetchProviders } from "../models/catalog";
import {
  applyBoomerangModels,
  resolveBoomerangModels,
} from "./boomerang-models";

const defaultLimits: WorkflowSecurityLimits = {
  maxSteps: 4,
  maxTaskChars: 12000,
  maxCarryChars: 24000,
  perStepTimeoutMs: 120_000,
};

function clampLimit(
  value: number | undefined,
  cap: number | undefined,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    return cap ?? fallback;
  if (typeof cap === "number" && Number.isFinite(cap))
    return Math.min(value, cap);
  return value;
}

export function resolveWorkflowLimits(
  context: OrchestratorContext,
  workflowId: string,
): WorkflowSecurityLimits {
  const security = context.security?.workflows;
  const workflows = context.workflows;
  const roocode =
    workflowId === "roocode-boomerang"
      ? workflows?.roocodeBoomerang
      : undefined;

  const maxStepsCap = security?.maxSteps ?? defaultLimits.maxSteps;
  const maxTaskCap = security?.maxTaskChars ?? defaultLimits.maxTaskChars;
  const maxCarryCap = security?.maxCarryChars ?? defaultLimits.maxCarryChars;
  const perStepCap =
    security?.perStepTimeoutMs ?? defaultLimits.perStepTimeoutMs;

  return {
    maxSteps: clampLimit(
      roocode?.maxSteps,
      maxStepsCap,
      defaultLimits.maxSteps,
    ),
    maxTaskChars: clampLimit(
      roocode?.maxTaskChars,
      maxTaskCap,
      defaultLimits.maxTaskChars,
    ),
    maxCarryChars: clampLimit(
      roocode?.maxCarryChars,
      maxCarryCap,
      defaultLimits.maxCarryChars,
    ),
    perStepTimeoutMs: clampLimit(
      roocode?.perStepTimeoutMs,
      perStepCap,
      defaultLimits.perStepTimeoutMs,
    ),
  };
}

const defaultUiPolicy: WorkflowUiPolicy = {
  execution: "auto",
  intervene: "on-error",
};

function resolveWorkflowUiPolicy(
  context: OrchestratorContext,
  override?: WorkflowUiPolicy,
): WorkflowUiPolicy {
  const ui = context.workflows?.ui;
  return {
    execution:
      override?.execution ?? ui?.execution ?? defaultUiPolicy.execution,
    intervene:
      override?.intervene ?? ui?.intervene ?? defaultUiPolicy.intervene,
  };
}

function resolveStepGate(
  ui: WorkflowUiPolicy,
  step: WorkflowStepResult,
  isLastStep: boolean,
): {
  pause: boolean;
  retry: boolean;
  terminalStatus?: WorkflowRunStatus;
  reason?: string;
} {
  if (isLastStep && step.status === "success") {
    return { pause: false, retry: false, terminalStatus: "success" };
  }

  const alwaysPause = ui.execution === "step" || ui.intervene === "always";
  const warningPause = ui.intervene === "on-warning" && Boolean(step.warning);
  const errorPause = ui.intervene === "on-error";

  if (step.status === "error") {
    if (alwaysPause || errorPause) {
      const reason = alwaysPause
        ? ui.execution === "step"
          ? "execution=step"
          : "intervene=always"
        : "intervene=on-error";
      return { pause: true, retry: true, reason };
    }
    return { pause: false, retry: false, terminalStatus: "error" };
  }

  if (alwaysPause || warningPause) {
    const reason = alwaysPause
      ? ui.execution === "step"
        ? "execution=step"
        : "intervene=always"
      : "intervene=on-warning";
    return { pause: true, retry: false, reason };
  }

  return { pause: false, retry: false };
}

const boomerangWorkflowIds = new Set([
  "roocode-boomerang",
  "boomerang",
  "boomerang-plan",
  "boomerang-run",
]);

async function ensureBoomerangWorkflowModels(
  context: OrchestratorContext,
  workflowId: string,
): Promise<void> {
  if (!boomerangWorkflowIds.has(workflowId)) return;
  const workflow = getWorkflow(workflowId);
  if (!workflow) return;
  if (!context.client) {
    throw new Error(
      `OpenCode client required to resolve boomerang models for "${workflowId}".`,
    );
  }
  const { providers } = await fetchProviders(context.client, context.directory);
  const models = resolveBoomerangModels({
    config: context.workflows?.boomerang,
    providers,
  });
  const updated = applyBoomerangModels(workflow, models);
  registerWorkflow(updated);
}

export type BoomerangQueueTask = {
  id: string;
  path: string;
  content: string;
};

export type BoomerangQueueDependencies = WorkflowRunDependencies & {
  waitForWorkerReady?: (workerId: string, timeoutMs: number) => Promise<void>;
};

function parseQueueIndex(name: string): number {
  const match = name.match(/^task-(\d+)\.md$/);
  if (!match) return Number.POSITIVE_INFINITY;
  return Number(match[1] ?? 0);
}

async function loadBoomerangQueueTasks(
  directory: string,
): Promise<BoomerangQueueTask[]> {
  const tasksDir = join(directory, "tasks");
  let entries: Array<{ name: string; isFile: () => boolean }>;
  try {
    entries = await readdir(tasksDir, { withFileTypes: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read tasks directory "${tasksDir}": ${msg}`);
  }

  const files = entries
    .filter((entry) => entry.isFile() && /^task-\d+\.md$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => {
      const diff = parseQueueIndex(a) - parseQueueIndex(b);
      return diff !== 0 ? diff : a.localeCompare(b);
    });

  if (files.length === 0) {
    throw new Error(`No task files found in "${tasksDir}".`);
  }

  return await Promise.all(
    files.map(async (name) => {
      const path = join(tasksDir, name);
      const content = await readFile(path, "utf8");
      return { id: name.replace(/\.md$/, ""), path, content };
    }),
  );
}

export function resolveConfiguredPath(
  baseDir: string,
  value: string | undefined,
  fallback: string,
): string {
  const raw = typeof value === "string" ? value.trim() : "";
  const resolvedInput = raw.length > 0 ? raw : fallback;
  if (isAbsolute(resolvedInput)) return resolvedInput;
  const base = resolve(baseDir);
  const resolvedPath = resolve(base, resolvedInput);
  const rel = relative(base, resolvedPath);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(
      `Configured path "${resolvedInput}" must resolve within ${baseDir}`,
    );
  }
  return resolvedPath;
}

export async function loadQueueTasks(
  tasksDir: string,
): Promise<BoomerangQueueTask[]> {
  let entries: Array<{ name: string; isFile: () => boolean }>;
  try {
    entries = await readdir(tasksDir, { withFileTypes: true });
  } catch (err) {
    if ((err as any)?.code === "ENOENT") return [];
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read tasks directory "${tasksDir}": ${msg}`);
  }

  const files = entries
    .filter((entry) => entry.isFile() && /^task-\d+\.md$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => {
      const diff = parseQueueIndex(a) - parseQueueIndex(b);
      return diff !== 0 ? diff : a.localeCompare(b);
    });

  return await Promise.all(
    files.map(async (name) => {
      const path = join(tasksDir, name);
      const content = await readFile(path, "utf8");
      return { id: name.replace(/\.md$/, ""), path, content };
    }),
  );
}

export async function archiveQueueTask(
  task: BoomerangQueueTask,
  archiveDir: string,
): Promise<string> {
  await mkdir(archiveDir, { recursive: true });
  const base = basename(task.path).replace(/\.md$/, "");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = join(archiveDir, `${base}-${stamp}.md`);
  await rename(task.path, dest);
  return dest;
}

function waitForWorkerReady(
  workerPool: OrchestratorContext["workerPool"],
  workerId: string,
  timeoutMs: number,
): Promise<void> {
  const instance = workerPool.get(workerId);
  if (!instance || instance.status === "ready") return Promise.resolve();
  if (instance.status === "error" || instance.status === "stopped") {
    return Promise.reject(
      new Error(`Worker "${workerId}" is ${instance.status}`),
    );
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let offReady = () => {};
    let offStop = () => {};
    let offError = () => {};
    const cleanup = () => {
      if (settled) return;
      settled = true;
      offReady();
      offStop();
      offError();
      if (timeoutId) clearTimeout(timeoutId);
    };
    offReady = workerPool.on("ready", (next) => {
      if (next.profile.id !== workerId) return;
      cleanup();
      resolve();
    });
    offStop = workerPool.on("stop", (next) => {
      if (next.profile.id !== workerId) return;
      cleanup();
      reject(new Error(`Worker "${workerId}" stopped`));
    });
    offError = workerPool.on("error", (next) => {
      if (next.profile.id !== workerId) return;
      cleanup();
      reject(new Error(`Worker "${workerId}" errored`));
    });

    const latest = workerPool.get(workerId);
    if (!latest || latest.status === "ready") {
      cleanup();
      resolve();
      return;
    }

    if (typeof timeoutMs === "number" && Number.isFinite(timeoutMs)) {
      timeoutId = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `Worker "${workerId}" did not become ready within ${timeoutMs}ms.`,
          ),
        );
      }, timeoutMs);
    }
  });
}

export async function runBoomerangQueueWithDependencies(
  input: {
    workflowId: string;
    task: string;
    tasks: BoomerangQueueTask[];
    limits: WorkflowSecurityLimits;
    autoSpawn?: boolean;
    attachments?: WorkflowRunInput["attachments"];
    uiPolicy?: WorkflowUiPolicy;
    runId?: string;
    parentSessionId?: string;
    workflow?: WorkflowDefinition;
  },
  deps: BoomerangQueueDependencies,
): Promise<WorkflowRunState> {
  const workflow = input.workflow ?? getWorkflow(input.workflowId);
  if (!workflow) {
    throw new Error(`Unknown workflow "${input.workflowId}".`);
  }
  validateWorkflowInput(
    {
      workflowId: input.workflowId,
      task: input.task,
      attachments: input.attachments,
      autoSpawn: input.autoSpawn,
      limits: input.limits,
    },
    workflow,
  );
  if (input.tasks.length === 0) {
    throw new Error("No tasks to run.");
  }
  const baseStep = workflow.steps[0];
  if (!baseStep) {
    throw new Error(`Workflow "${workflow.id}" has no steps.`);
  }

  const runId = input.runId ?? randomUUID();
  const ui: WorkflowUiPolicy = {
    execution: input.uiPolicy?.execution ?? defaultUiPolicy.execution,
    intervene: input.uiPolicy?.intervene ?? defaultUiPolicy.intervene,
  };
  const run = createWorkflowRunState({
    runId,
    workflowId: workflow.id,
    workflowName: workflow.name,
    task: input.task,
    autoSpawn: input.autoSpawn ?? true,
    limits: input.limits,
    attachments: input.attachments,
    ui,
    parentSessionId: input.parentSessionId,
  });

  publishOrchestratorEvent("orchestra.workflow.started", {
    runId: run.runId,
    workflowId: workflow.id,
    workflowName: workflow.name,
    task: input.task,
    startedAt: run.startedAt,
  });

  const sendToWorker = async (
    workerId: string,
    message: string,
    options: {
      attachments?: WorkflowRunInput["attachments"];
      timeoutMs: number;
      model?: string;
    },
  ) => {
    if (deps.waitForWorkerReady) {
      try {
        await deps.waitForWorkerReady(workerId, options.timeoutMs);
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
    return deps.sendToWorker(workerId, message, options);
  };

  const queueDeps: WorkflowRunDependencies = {
    resolveWorker: deps.resolveWorker,
    sendToWorker,
  };

  let carry = "";

  for (let index = 0; index < input.tasks.length; index += 1) {
    const taskItem = input.tasks[index];
    const step: WorkflowStepDefinition = {
      ...baseStep,
      id: taskItem.id,
      title: taskItem.id,
      model: baseStep.model,
    };
    const taskWorkflow: WorkflowDefinition = {
      ...workflow,
      steps: [step],
    };

    const executed = await executeWorkflowStep(
      {
        runId: run.runId,
        workflow: taskWorkflow,
        stepIndex: 0,
        task: taskItem.content,
        carry,
        autoSpawn: input.autoSpawn ?? true,
        limits: input.limits,
        attachments: index === 0 ? input.attachments : undefined,
      },
      queueDeps,
    );

    run.steps.push(executed.step);
    run.lastStepResult = executed.step;
    run.currentStepIndex = index + 1;
    run.updatedAt = Date.now();
    carry = executed.carry;

    if (executed.step.status === "error") {
      run.status = "error";
      break;
    }

    run.status = "running";
  }

  if (run.status === "running") {
    run.status = "success";
  }

  run.updatedAt = Date.now();
  if (run.status === "success" || run.status === "error") {
    run.finishedAt = run.updatedAt;
  }

  if (run.status === "success" || run.status === "error") {
    publishOrchestratorEvent("orchestra.workflow.completed", {
      runId: run.runId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt ?? Date.now(),
      durationMs: (run.finishedAt ?? Date.now()) - run.startedAt,
      steps: {
        total: run.steps.length,
        success: run.steps.filter((step) => step.status === "success").length,
        error: run.steps.filter((step) => step.status === "error").length,
      },
    });
  }

  return run;
}

async function runInfiniteOrchestraWithDependencies(
  context: OrchestratorContext,
  input: {
    workflowId: string;
    task: string;
    limits: WorkflowSecurityLimits;
    autoSpawn?: boolean;
    attachments?: WorkflowRunInput["attachments"];
    uiPolicy?: WorkflowUiPolicy;
    runId?: string;
    parentSessionId?: string;
    workflow?: WorkflowDefinition;
  },
  deps: WorkflowRunDependencies,
): Promise<WorkflowRunState> {
  const workflow = input.workflow ?? getWorkflow(input.workflowId);
  if (!workflow) {
    throw new Error(`Unknown workflow "${input.workflowId}".`);
  }
  validateWorkflowInput(
    {
      workflowId: input.workflowId,
      task: input.task,
      attachments: input.attachments,
      autoSpawn: input.autoSpawn,
      limits: input.limits,
    },
    workflow,
  );

  const runId = input.runId ?? randomUUID();
  const ui: WorkflowUiPolicy = {
    execution: input.uiPolicy?.execution ?? defaultUiPolicy.execution,
    intervene: input.uiPolicy?.intervene ?? defaultUiPolicy.intervene,
  };
  const run = createWorkflowRunState({
    runId,
    workflowId: workflow.id,
    workflowName: workflow.name,
    task: input.task,
    autoSpawn: input.autoSpawn ?? true,
    limits: input.limits,
    attachments: input.attachments,
    ui,
    parentSessionId: input.parentSessionId,
  });

  publishOrchestratorEvent("orchestra.workflow.started", {
    runId: run.runId,
    workflowId: workflow.id,
    workflowName: workflow.name,
    task: input.task,
    startedAt: run.startedAt,
  });

  const complete = () => {
    run.updatedAt = Date.now();
    if (run.status === "success" || run.status === "error") {
      run.finishedAt = run.updatedAt;
      publishOrchestratorEvent("orchestra.workflow.completed", {
        runId: run.runId,
        workflowId: workflow.id,
        workflowName: workflow.name,
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt ?? Date.now(),
        durationMs: (run.finishedAt ?? Date.now()) - run.startedAt,
        steps: {
          total: run.steps.length,
          success: run.steps.filter((step) => step.status === "success").length,
          error: run.steps.filter((step) => step.status === "error").length,
        },
      });
    }
  };

  const cfg = context.workflows?.infiniteOrchestra ?? {};
  const queueDirSetting =
    typeof cfg.queueDir === "string" && cfg.queueDir.trim().length > 0
      ? cfg.queueDir.trim()
      : ".opencode/orchestra/tasks";
  const archiveDirSetting =
    typeof cfg.archiveDir === "string" && cfg.archiveDir.trim().length > 0
      ? cfg.archiveDir.trim()
      : ".opencode/orchestra/done";
  const queueDir = resolveConfiguredPath(
    context.directory,
    queueDirSetting,
    ".opencode/orchestra/tasks",
  );
  const archiveDir = resolveConfiguredPath(
    context.directory,
    archiveDirSetting,
    ".opencode/orchestra/done",
  );
  const planWorkflowId =
    typeof cfg.planWorkflowId === "string" && cfg.planWorkflowId.trim()
      ? cfg.planWorkflowId.trim()
      : "infinite-orchestra-plan";
  const taskWorkflowId =
    typeof cfg.taskWorkflowId === "string" && cfg.taskWorkflowId.trim()
      ? cfg.taskWorkflowId.trim()
      : "roocode-boomerang";
  const maxTasksPerCycle =
    typeof cfg.maxTasksPerCycle === "number" &&
    Number.isFinite(cfg.maxTasksPerCycle)
      ? Math.max(1, Math.floor(cfg.maxTasksPerCycle))
      : 4;
  const goal =
    typeof cfg.goal === "string" && cfg.goal.trim().length > 0
      ? cfg.goal.trim()
      : input.task;

  await mkdir(queueDir, { recursive: true });
  await mkdir(archiveDir, { recursive: true });

  const nestedUiPolicy: WorkflowUiPolicy = {
    execution: "auto",
    intervene: "never",
  };

  const appendPlanStep = (result: WorkflowRunState) => {
    const finishedAt = result.finishedAt ?? Date.now();
    const step: WorkflowStepResult = {
      id: "plan",
      title: "Plan Queue",
      workerId: result.lastStepResult?.workerId ?? "architect",
      status: result.status === "error" ? "error" : "success",
      response: result.lastStepResult?.response,
      error: result.lastStepResult?.error,
      startedAt: result.startedAt,
      finishedAt,
      durationMs: finishedAt - result.startedAt,
    };
    run.steps.push(step);
    run.lastStepResult = step;
    run.currentStepIndex = run.steps.length;
    run.updatedAt = Date.now();
    if (step.status === "error") run.status = "error";
  };

  let tasks = await loadQueueTasks(queueDir);
  if (tasks.length === 0) {
    if (!getWorkflow(planWorkflowId)) {
      throw new Error(`Unknown workflow "${planWorkflowId}".`);
    }

    const planTask = [
      `Goal:`,
      goal,
      ``,
      `Queue directory: ${queueDirSetting}`,
      `Archive directory: ${archiveDirSetting}`,
      `Max tasks per cycle: ${maxTasksPerCycle}`,
      ``,
      `Rules:`,
      `- Only write task files inside the queue directory`,
      `- Do not modify other repo files during planning`,
    ].join("\n");

    const planResult = await runWorkflowWithDependencies(
      {
        workflowId: planWorkflowId,
        task: planTask,
        attachments: input.attachments,
        autoSpawn: input.autoSpawn ?? true,
        limits: resolveWorkflowLimits(context, planWorkflowId),
      },
      deps,
      {
        uiPolicy: nestedUiPolicy,
        parentSessionId: input.parentSessionId,
      },
    );
    appendPlanStep(planResult);
    if (run.status === "error") {
      complete();
      return run;
    }

    tasks = await loadQueueTasks(queueDir);
  }

  if (tasks.length === 0) {
    run.status = "error";
    const now = Date.now();
    const step: WorkflowStepResult = {
      id: "queue",
      title: "Queue",
      workerId: "coder",
      status: "error",
      error: `No task files found in "${queueDir}".`,
      startedAt: now,
      finishedAt: now,
      durationMs: 0,
    };
    run.steps.push(step);
    run.lastStepResult = step;
    run.currentStepIndex = run.steps.length;
    run.updatedAt = now;
    run.finishedAt = now;
    complete();
    return run;
  }

  tasks = tasks.slice(0, maxTasksPerCycle);

  for (let index = 0; index < tasks.length; index += 1) {
    const taskItem = tasks[index];
    const startedAt = Date.now();
    const result = await runWorkflowWithDependencies(
      {
        workflowId: taskWorkflowId,
        task: taskItem.content,
        attachments: index === 0 ? input.attachments : undefined,
        autoSpawn: input.autoSpawn ?? true,
        limits: resolveWorkflowLimits(context, taskWorkflowId),
      },
      deps,
      {
        uiPolicy: nestedUiPolicy,
        parentSessionId: input.parentSessionId,
      },
    );

    const finishedAt = result.finishedAt ?? Date.now();
    let archivedPath: string | undefined;
    let archiveWarning: string | undefined;
    if (result.status === "success") {
      try {
        archivedPath = await archiveQueueTask(taskItem, archiveDir);
      } catch (err) {
        archiveWarning = err instanceof Error ? err.message : String(err);
      }
    }
    const warningParts = [
      result.lastStepResult?.warning,
      archiveWarning ? `Archive failed: ${archiveWarning}` : undefined,
    ].filter(Boolean);
    const step: WorkflowStepResult = {
      id: taskItem.id,
      title: taskItem.id,
      workerId: result.lastStepResult?.workerId ?? "coder",
      status: result.status === "error" ? "error" : "success",
      response:
        [
          ...(archivedPath ? [`Archived: ${archivedPath}`, ``] : []),
          result.lastStepResult?.response ?? "",
        ]
          .join("\n")
          .trim() || undefined,
      warning: warningParts.length ? warningParts.join("\n") : undefined,
      error: result.lastStepResult?.error,
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
    };

    run.steps.push(step);
    run.lastStepResult = step;
    run.currentStepIndex = run.steps.length;
    run.updatedAt = Date.now();

    if (step.status === "error") {
      run.status = "error";
      break;
    }
  }

  if (run.status === "running") {
    run.status = "success";
  }

  complete();

  return run;
}

type WorkflowStepHook = (input: {
  phase: "start" | "finish";
  run: WorkflowRunState;
  stepIndex: number;
  step: WorkflowStepDefinition;
  stepResult?: WorkflowStepResult;
  pause?: boolean;
  retry?: boolean;
  pauseReason?: string;
}) => Promise<void> | void;

async function advanceWorkflowRun(
  run: WorkflowRunState,
  workflow: WorkflowDefinition,
  deps: WorkflowRunDependencies,
  onStep?: WorkflowStepHook,
): Promise<WorkflowRunState> {
  const totalSteps = workflow.steps.length;

  while (run.currentStepIndex < totalSteps) {
    const stepIndex = run.currentStepIndex;
    const step = workflow.steps[stepIndex];

    await onStep?.({ phase: "start", run, stepIndex, step });

    const executed = await executeWorkflowStep(
      {
        runId: run.runId,
        workflow,
        stepIndex,
        task: run.task,
        carry: run.carry,
        autoSpawn: run.autoSpawn,
        limits: run.limits,
        attachments: run.attachments,
      },
      deps,
    );

    run.steps.push(executed.step);
    run.lastStepResult = executed.step;
    if (executed.step.status === "success") {
      run.carry = executed.carry;
    }

    const gate = resolveStepGate(
      run.ui,
      executed.step,
      stepIndex >= totalSteps - 1,
    );
    const isError = executed.step.status === "error";

    if (!isError) {
      run.currentStepIndex = Math.min(stepIndex + 1, totalSteps);
    }

    await onStep?.({
      phase: "finish",
      run,
      stepIndex,
      step,
      stepResult: executed.step,
      pause: gate.pause,
      retry: gate.retry,
      pauseReason: gate.reason,
    });

    if (gate.terminalStatus) {
      run.status = gate.terminalStatus;
      break;
    }

    if (gate.pause) {
      run.status = "paused";
      if (gate.retry && isError) {
        run.currentStepIndex = stepIndex;
      }
      break;
    }

    if (isError) {
      run.status = "error";
      break;
    }

    run.status = "running";
  }

  if (run.status === "running" && run.currentStepIndex >= totalSteps) {
    run.status = "success";
  }

  run.updatedAt = Date.now();
  if (run.status === "success" || run.status === "error") {
    run.finishedAt = run.updatedAt;
  }
  return run;
}

export async function runWorkflowWithDependencies(
  input: WorkflowRunInput,
  deps: WorkflowRunDependencies,
  options?: {
    uiPolicy?: WorkflowUiPolicy;
    onStep?: WorkflowStepHook;
    runId?: string;
    parentSessionId?: string;
  },
): Promise<WorkflowRunState> {
  const workflow = getWorkflow(input.workflowId);
  if (!workflow) {
    throw new Error(`Unknown workflow "${input.workflowId}".`);
  }

  validateWorkflowInput(input, workflow);

  const runId = options?.runId ?? randomUUID();
  const ui: WorkflowUiPolicy = {
    execution: options?.uiPolicy?.execution ?? defaultUiPolicy.execution,
    intervene: options?.uiPolicy?.intervene ?? defaultUiPolicy.intervene,
  };
  const run = createWorkflowRunState({
    runId,
    workflowId: workflow.id,
    workflowName: workflow.name,
    task: input.task,
    autoSpawn: input.autoSpawn ?? true,
    limits: input.limits,
    attachments: input.attachments,
    ui,
    parentSessionId: options?.parentSessionId,
  });

  publishOrchestratorEvent("orchestra.workflow.started", {
    runId: run.runId,
    workflowId: workflow.id,
    workflowName: workflow.name,
    task: input.task,
    startedAt: run.startedAt,
  });

  await advanceWorkflowRun(run, workflow, deps, options?.onStep);
  const nextStatus = (run as WorkflowRunState).status;
  if (nextStatus === "success" || nextStatus === "error") {
    publishOrchestratorEvent("orchestra.workflow.completed", {
      runId: run.runId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      status: nextStatus === "error" ? "error" : "success",
      startedAt: run.startedAt,
      finishedAt: run.finishedAt ?? Date.now(),
      durationMs: (run.finishedAt ?? Date.now()) - run.startedAt,
      steps: {
        total: run.steps.length,
        success: run.steps.filter((step) => step.status === "success").length,
        error: run.steps.filter((step) => step.status === "error").length,
      },
    });
  }

  return run;
}

export async function continueWorkflowWithDependencies(
  run: WorkflowRunState,
  deps: WorkflowRunDependencies,
  options?: { onStep?: WorkflowStepHook; uiPolicy?: WorkflowUiPolicy },
): Promise<WorkflowRunState> {
  const workflow = getWorkflow(run.workflowId);
  if (!workflow) {
    throw new Error(`Unknown workflow "${run.workflowId}".`);
  }

  if (run.status !== "paused") {
    return run;
  }

  run.ui = options?.uiPolicy ?? run.ui;

  const validationInput: WorkflowRunInput = {
    workflowId: run.workflowId,
    task: run.task,
    attachments: run.attachments,
    autoSpawn: run.autoSpawn,
    limits: run.limits,
  };
  validateWorkflowInput(validationInput, workflow);

  await advanceWorkflowRun(run, workflow, deps, options?.onStep);
  const nextStatus = (run as WorkflowRunState).status;
  if (nextStatus === "success" || nextStatus === "error") {
    publishOrchestratorEvent("orchestra.workflow.completed", {
      runId: run.runId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      status: nextStatus === "error" ? "error" : "success",
      startedAt: run.startedAt,
      finishedAt: run.finishedAt ?? Date.now(),
      durationMs: (run.finishedAt ?? Date.now()) - run.startedAt,
      steps: {
        total: run.steps.length,
        success: run.steps.filter((step) => step.status === "success").length,
        error: run.steps.filter((step) => step.status === "error").length,
      },
    });
  }

  return run;
}

function formatStepStartNotice(input: {
  run: WorkflowRunState;
  stepIndex: number;
  step: WorkflowStepDefinition;
  totalSteps: number;
}): string {
  const { run, stepIndex, step, totalSteps } = input;
  return [
    "**[WORKFLOW STEP STARTED]**",
    "",
    `Workflow: ${run.workflowName} (${run.workflowId})`,
    `Run: ${run.runId}`,
    `Step ${stepIndex + 1}/${totalSteps}: ${step.title} (${step.workerId})`,
    "",
    `Tip: \`orchestrator.trace.${step.workerId}\` shows worker activity.`,
  ].join("\n");
}

function formatStepFinishNotice(input: {
  run: WorkflowRunState;
  stepIndex: number;
  step: WorkflowStepDefinition;
  totalSteps: number;
  stepResult: WorkflowStepResult;
  pause?: boolean;
  retry?: boolean;
  pauseReason?: string;
  workerSessionId?: string;
  showOpenCommand: boolean;
}): string {
  const {
    run,
    stepIndex,
    step,
    totalSteps,
    stepResult,
    pause,
    retry,
    pauseReason,
    workerSessionId,
    showOpenCommand,
  } = input;
  const header =
    stepResult.status === "success"
      ? "**[WORKFLOW STEP FINISHED]**"
      : "**[WORKFLOW STEP FAILED]**";
  const lines = [
    header,
    "",
    `Workflow: ${run.workflowName} (${run.workflowId})`,
    `Run: ${run.runId}`,
    `Step ${stepIndex + 1}/${totalSteps}: ${step.title} (${step.workerId})`,
    `Status: ${stepResult.status}`,
    `Duration: ${stepResult.durationMs}ms`,
  ];
  if (workerSessionId) lines.push(`Session: ${workerSessionId}`);
  if (stepResult.warning) lines.push(`Warning: ${stepResult.warning}`);
  if (stepResult.error) lines.push(`Error: ${stepResult.error}`);
  if (pause) {
    const reason = pauseReason ? ` (${pauseReason})` : "";
    lines.push("", `Paused${reason}.`);
  } else if (stepResult.status === "success" && stepIndex < totalSteps - 1) {
    lines.push("", "Continuing to next step...");
  }

  lines.push("", "Next actions:");
  if (pause) {
    const retryNote = retry ? " (retries the failed step)" : "";
    lines.push(
      `- \`task_start({ kind: "workflow", continueRunId: "${run.runId}", task: "continue workflow" })\`${retryNote}`,
    );
  }
  if (showOpenCommand) {
    lines.push(`- \`orchestrator.open.${step.workerId}\``);
  }
  lines.push(`- \`orchestrator.trace.${step.workerId}\``);
  lines.push("- `orchestrator.dashboard`");
  return lines.join("\n");
}

function createStepHook(
  context: OrchestratorContext,
  sessionId: string | undefined,
  notify: boolean,
): WorkflowStepHook {
  return async ({
    phase,
    run,
    stepIndex,
    step,
    stepResult,
    pause,
    retry,
    pauseReason,
  }) => {
    const totalSteps = getWorkflow(run.workflowId)?.steps.length ?? 0;
    const instance = context.workerPool.get(step.workerId);

    if (phase === "start") {
      setWorkflowSkillContext({
        workerId: step.workerId,
        sessionId: instance?.sessionId,
        runId: run.runId,
        stepId: step.id,
        workflowId: run.workflowId,
      });
      if (!notify || !sessionId) return;

      await injectSessionNotice(
        context,
        sessionId,
        formatStepStartNotice({ run, stepIndex, step, totalSteps }),
      );
      return;
    }

    clearWorkflowSkillContext({
      workerId: step.workerId,
      sessionId: instance?.sessionId,
    });

    if (!notify || !sessionId) return;
    if (!stepResult) return;
    const kind = instance?.kind ?? instance?.profile.kind;
    const isInProcess = kind === "agent" || kind === "subagent";
    const notice = formatStepFinishNotice({
      run,
      stepIndex,
      step,
      totalSteps,
      stepResult,
      pause,
      retry,
      pauseReason,
      workerSessionId: isInProcess ? instance?.sessionId : undefined,
      showOpenCommand: isInProcess,
    });

    await injectSessionNotice(context, sessionId, notice);

    if (pause && context.client?.tui) {
      void context.client.tui
        .appendPrompt({
          body: {
            text: `task_start({ kind: "workflow", continueRunId: "${run.runId}", task: "continue workflow" })`,
          },
          query: { directory: context.directory },
        })
        .catch(() => {});
    }
  };
}

export async function runWorkflowWithContext(
  context: OrchestratorContext,
  input: Omit<WorkflowRunInput, "limits"> & { limits?: WorkflowSecurityLimits },
  options?: {
    sessionId?: string;
    uiPolicy?: WorkflowUiPolicy;
    notify?: boolean;
  },
): Promise<WorkflowRunResult> {
  const workerPool = context.workerPool;
  try {
    await ensureBoomerangWorkflowModels(context, input.workflowId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    publishErrorEvent({
      message: msg,
      source: "workflow",
      workflowId: input.workflowId,
    });
    throw err;
  }
  const limits =
    input.limits ?? resolveWorkflowLimits(context, input.workflowId);
  const uiPolicy = resolveWorkflowUiPolicy(context, options?.uiPolicy);
  const notify =
    options?.notify !== false && context.config.ui?.wakeupInjection !== false;
  const workflow = getWorkflow(input.workflowId);
  if (!workflow) {
    throw new Error(`Unknown workflow "${input.workflowId}".`);
  }

  const requirements = collectWorkflowSkillRequirements(
    workflow,
    context.profiles,
  );
  if (requirements.length > 0) {
    const config = await loadSkillConfig(context);
    const permissionMap = resolveSkillPermissionMap(config);
    const toolEnabled = resolveSkillToolEnabled(config);
    const preflight = await validateSkills({
      requiredSkills: requirements.map((req) => req.name),
      directory: context.directory,
      worktree: context.worktree,
      includeGlobal: true,
      permissionMap,
      toolEnabled,
    });
    if (!preflight.ok) {
      const summary = preflight.errors.join("; ");
      publishErrorEvent({
        message: `Workflow "${input.workflowId}" missing required skills`,
        source: "workflow",
        workflowId: input.workflowId,
        details: summary,
      });
      throw new Error(`Required skills missing/denied: ${summary}`);
    }
  }

  const ensureWorker = async (
    workerId: string,
    autoSpawn: boolean,
  ): Promise<string> => {
    const existing = workerPool.get(workerId);
    if (
      existing &&
      existing.status !== "error" &&
      existing.status !== "stopped"
    ) {
      return existing.profile.id;
    }
    if (!autoSpawn) {
      throw new Error(
        `Worker "${workerId}" is not running. Spawn it first or pass autoSpawn=true.`,
      );
    }

    const profile = context.profiles[workerId];
    if (!profile) {
      throw new Error(`Unknown worker profile "${workerId}".`);
    }

    const { basePort, timeout } = context.spawnDefaults;
    const instance = await spawnWorker(profile, {
      basePort,
      timeout,
      directory: context.directory,
      client: context.client,
      parentSessionId: options?.sessionId,
    });
    return instance.profile.id;
  };

  const startedAt = Date.now();
  logger.info(`[workflow] ${input.workflowId} started`);

  let result: WorkflowRunState;
  try {
    const deps: WorkflowRunDependencies = {
      resolveWorker: async (workerId, autoSpawn) => {
        const existing = workerPool.get(workerId);
        const resolved = await ensureWorker(workerId, autoSpawn);
        const instance = workerPool.get(resolved);
        if (
          options?.sessionId &&
          !existing &&
          instance &&
          instance.modelResolution !== "reused existing worker"
        ) {
          workerPool.trackOwnership(options.sessionId, instance.profile.id);
        }
        return resolved;
      },
      sendToWorker: async (workerId, message, optionsInput) =>
        sendToWorker(workerId, message, {
          attachments: optionsInput.attachments,
          timeout: optionsInput.timeoutMs,
          model: optionsInput.model,
          sessionId: options?.sessionId,
        }),
    };

    if (input.workflowId === "boomerang-run") {
      const tasks = await loadBoomerangQueueTasks(context.directory);
      result = await runBoomerangQueueWithDependencies(
        {
          workflowId: input.workflowId,
          workflow,
          task: input.task,
          tasks,
          attachments: input.attachments,
          autoSpawn: input.autoSpawn ?? true,
          limits,
          uiPolicy,
          parentSessionId: options?.sessionId,
        },
        {
          ...deps,
          waitForWorkerReady: (workerId, timeoutMs) =>
            waitForWorkerReady(workerPool, workerId, timeoutMs),
        },
      );
    } else if (input.workflowId === "infinite-orchestra") {
      result = await runInfiniteOrchestraWithDependencies(
        context,
        {
          workflowId: input.workflowId,
          workflow,
          task: input.task,
          attachments: input.attachments,
          autoSpawn: input.autoSpawn ?? true,
          limits,
          uiPolicy,
          parentSessionId: options?.sessionId,
        },
        deps,
      );
    } else {
      result = await runWorkflowWithDependencies(
        {
          workflowId: input.workflowId,
          task: input.task,
          attachments: input.attachments,
          autoSpawn: input.autoSpawn ?? true,
          limits,
        },
        deps,
        {
          uiPolicy,
          parentSessionId: options?.sessionId,
          onStep: createStepHook(context, options?.sessionId, notify),
        },
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    publishErrorEvent({
      message: msg,
      source: "workflow",
      workflowId: input.workflowId,
    });
    throw err;
  }

  const durationMs = Date.now() - startedAt;
  const failed = result.steps.some((step) => step.status === "error");
  if (failed) {
    logger.warn(
      `[workflow] ${input.workflowId} completed with errors (${durationMs}ms)`,
    );
  } else if (result.status === "paused") {
    logger.info(`[workflow] ${input.workflowId} paused (${durationMs}ms)`);
  } else {
    logger.info(`[workflow] ${input.workflowId} completed (${durationMs}ms)`);
  }

  if (result.status === "paused") saveWorkflowRun(result);
  else deleteWorkflowRun(result.runId);

  return toWorkflowRunResult(result);
}

export async function continueWorkflowWithContext(
  context: OrchestratorContext,
  runId: string,
  options?: {
    sessionId?: string;
    uiPolicy?: WorkflowUiPolicy;
    notify?: boolean;
  },
): Promise<WorkflowRunResult> {
  try {
    const run = getWorkflowRun(runId);
    if (!run) {
      throw new Error(`Unknown workflow run "${runId}".`);
    }
    if (run.status !== "paused") {
      return toWorkflowRunResult(run);
    }

    try {
      await ensureBoomerangWorkflowModels(context, run.workflowId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      publishErrorEvent({
        message: msg,
        source: "workflow",
        workflowId: run.workflowId,
        runId: run.runId,
      });
      throw err;
    }
    const workerPool = context.workerPool;
    const notify =
      options?.notify !== false && context.config.ui?.wakeupInjection !== false;
    const uiPolicy = resolveWorkflowUiPolicy(context, options?.uiPolicy);
    run.ui = uiPolicy;
    if (options?.sessionId) run.parentSessionId = options.sessionId;

    const deps: WorkflowRunDependencies = {
      resolveWorker: async (workerId, autoSpawn) => {
        const existing = workerPool.get(workerId);
        if (
          existing &&
          existing.status !== "error" &&
          existing.status !== "stopped"
        ) {
          return existing.profile.id;
        }
        if (!autoSpawn) {
          throw new Error(
            `Worker "${workerId}" is not running. Spawn it first or pass autoSpawn=true.`,
          );
        }
        const profile = context.profiles[workerId];
        if (!profile) {
          throw new Error(`Unknown worker profile "${workerId}".`);
        }
        const { basePort, timeout } = context.spawnDefaults;
        const instance = await spawnWorker(profile, {
          basePort,
          timeout,
          directory: context.directory,
          client: context.client,
          parentSessionId: options?.sessionId,
        });
        if (
          options?.sessionId &&
          !existing &&
          instance.modelResolution !== "reused existing worker"
        ) {
          workerPool.trackOwnership(options.sessionId, instance.profile.id);
        }
        return instance.profile.id;
      },
      sendToWorker: async (workerId, message, optionsInput) =>
        sendToWorker(workerId, message, {
          attachments: optionsInput.attachments,
          timeout: optionsInput.timeoutMs,
          sessionId: options?.sessionId,
        }),
    };

    const next = await continueWorkflowWithDependencies(run, deps, {
      uiPolicy,
      onStep: createStepHook(context, options?.sessionId, notify),
    });

    if (next.status === "paused") saveWorkflowRun(next);
    else deleteWorkflowRun(next.runId);

    return toWorkflowRunResult(next);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    publishErrorEvent({
      message: msg,
      source: "workflow",
      details: `runId=${runId}`,
    });
    throw err;
  }
}
