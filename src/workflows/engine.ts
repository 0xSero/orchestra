import type { OrchestratorRuntime } from "../core/runtime";
import type { WorkerProfile } from "../types";
import { getProfile } from "../config/profiles";
import { sendToWorker, spawnWorker } from "../workers/spawner";
import type { WorkerAttachment } from "../workers/prompt";
import type { WorkflowDefinition, WorkflowRunResult, WorkflowStepResult, WorkflowTemplateContext } from "./types";

export type WorkflowEngine = {
  list: () => Array<Pick<WorkflowDefinition, "id" | "name" | "description" | "requiredWorkers">>;
  get: (id: string) => WorkflowDefinition | undefined;
  run: (input: {
    workflowId: string;
    task: string;
    attachments?: WorkerAttachment[];
    /** If true, auto-spawn missing required workers (default: true) */
    autoSpawn?: boolean;
  }) => Promise<WorkflowRunResult>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function durationMs(start: number, end: number): number {
  return Math.max(0, end - start);
}

function renderRunAsMarkdown(result: WorkflowRunResult): string {
  const lines: string[] = [];
  lines.push(`# Workflow: ${result.workflowId}`);
  lines.push("");
  lines.push(`- ok: ${result.ok ? "true" : "false"}`);
  lines.push(`- durationMs: ${result.durationMs}`);
  lines.push("");
  lines.push("## Steps");
  for (const step of result.steps) {
    lines.push(`### ${step.title} (${step.stepId})`);
    lines.push(`- worker: \`${step.workerId}\``);
    lines.push(`- ok: ${step.ok ? "true" : "false"}`);
    lines.push(`- durationMs: ${step.durationMs}`);
    if (step.error) lines.push(`- error: ${step.error}`);
    lines.push("");
  }
  lines.push("## Output");
  lines.push(result.steps.map((s) => (s.output ? `### ${s.title}\n\n${s.output}` : "")).filter(Boolean).join("\n\n"));
  lines.push("");
  return lines.join("\n").trim() + "\n";
}

const DEFAULT_MAX_TASK_CHARS = 30_000;
const DEFAULT_MAX_STEP_OUTPUT_CHARS = 60_000;

function clampText(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.7);
  const tail = max - head;
  return `${text.slice(0, head)}\n\n[... truncated ${text.length - max} chars ...]\n\n${text.slice(text.length - tail)}`;
}

async function ensureWorker(runtime: OrchestratorRuntime, workerId: string, ctx: { autoSpawn: boolean }): Promise<void> {
  if (runtime.registry.getWorker(workerId)) return;
  if (!ctx.autoSpawn) throw new Error(`Worker "${workerId}" is not running (autoSpawn disabled).`);
  const profile = getProfile(workerId, runtime.profiles);
  if (!profile) throw new Error(`Unknown worker/profile "${workerId}".`);
  // Resolve auto-tag models via existing tooling behavior: if config has "auto:*", spawnWorker will reject
  // non provider/model. So we conservatively default to whatever is currently configured in the profile
  // and rely on users running orchestrator.setup / set_profile_model first.
  // (Security + correctness: avoid silently picking a model that the user didn’t intend.)
  const toSpawn: WorkerProfile = { ...profile };
  await spawnWorker(toSpawn, {
    basePort: runtime.spawnDefaults.basePort,
    timeout: runtime.spawnDefaults.timeout,
    directory: runtime.directory,
    registry: runtime.registry,
  });
}

export function createWorkflowEngine(runtime: OrchestratorRuntime, workflows: WorkflowDefinition[]): WorkflowEngine {
  const byId = new Map<string, WorkflowDefinition>();
  for (const wf of workflows) byId.set(wf.id, wf);

  return {
    list: () =>
      workflows.map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        requiredWorkers: w.requiredWorkers,
      })),
    get: (id) => byId.get(id),
    run: async (input) => {
      const wf = byId.get(input.workflowId);
      if (!wf) {
        return {
          workflowId: input.workflowId,
          ok: false,
          startedAt: nowIso(),
          endedAt: nowIso(),
          durationMs: 0,
          steps: [],
          output: `Unknown workflow "${input.workflowId}".`,
        };
      }

      const startedAt = Date.now();
      if (typeof input.task !== "string" || input.task.trim().length === 0) {
        return {
          workflowId: wf.id,
          ok: false,
          startedAt: nowIso(),
          endedAt: nowIso(),
          durationMs: 0,
          steps: [],
          output: "Task must be a non-empty string.",
        };
      }
      if (input.task.length > DEFAULT_MAX_TASK_CHARS) {
        return {
          workflowId: wf.id,
          ok: false,
          startedAt: nowIso(),
          endedAt: nowIso(),
          durationMs: 0,
          steps: [],
          output: `Task is too large (max ${DEFAULT_MAX_TASK_CHARS} chars).`,
        };
      }
      const outputs: Record<string, string> = {};
      const steps: WorkflowStepResult[] = [];

      const autoSpawn = input.autoSpawn ?? true;
      for (const wid of wf.requiredWorkers) {
        await ensureWorker(runtime, wid, { autoSpawn });
      }

      const templateCtxBase: Omit<WorkflowTemplateContext, "outputs"> = {
        task: input.task,
        attachments: input.attachments,
      };

      let ok = true;
      for (const step of wf.steps) {
        const stepStarted = Date.now();
        const startedAtIso = nowIso();
        try {
          await ensureWorker(runtime, step.workerId, { autoSpawn });
          const prompt = step.prompt({ ...templateCtxBase, outputs });
          const res = await sendToWorker(step.workerId, prompt, {
            attachments: input.attachments,
            timeout: step.timeoutMs ?? 180_000,
            registry: runtime.registry,
          });
          if (!res.success) throw new Error(res.error ?? "worker step failed");
          const out = clampText((res.response ?? "").trim(), DEFAULT_MAX_STEP_OUTPUT_CHARS);
          outputs[step.id] = out;
          steps.push({
            stepId: step.id,
            title: step.title,
            workerId: step.workerId,
            ok: true,
            startedAt: startedAtIso,
            endedAt: nowIso(),
            durationMs: durationMs(stepStarted, Date.now()),
            output: out,
          });
        } catch (e) {
          ok = false;
          const err = e instanceof Error ? e.message : String(e);
          steps.push({
            stepId: step.id,
            title: step.title,
            workerId: step.workerId,
            ok: false,
            startedAt: startedAtIso,
            endedAt: nowIso(),
            durationMs: durationMs(stepStarted, Date.now()),
            error: err,
          });
          if (step.required !== false) break;
        }
      }

      const finishedAt = Date.now();
      const result: WorkflowRunResult = {
        workflowId: wf.id,
        ok,
        startedAt: new Date(startedAt).toISOString(),
        endedAt: new Date(finishedAt).toISOString(),
        durationMs: durationMs(startedAt, finishedAt),
        steps,
        output: "",
      };
      result.output = renderRunAsMarkdown(result);
      return result;
    },
  };
}

