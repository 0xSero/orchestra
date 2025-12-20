import type { WorkflowDefinition, WorkflowRunResult, WorkflowRunSecurity, WorkflowStepResult } from "../core/workflows/types";

export type RoocodeBoomerangWorkflowOutput = {
  final: string;
  stepOutputs: Record<string, string>;
};

export type RoocodeBoomerangWorkflowConfig = {
  /**
   * Ordered steps. Each step "boomerangs" output back into the next step's input.
   * Recommended: architect -> coder -> explorer -> coder.
   */
  steps: Array<{
    id: string;
    profileId: string;
    prompt: string;
    forwardAttachments?: boolean;
  }>;
};

const DEFAULT_CONFIG: RoocodeBoomerangWorkflowConfig = {
  steps: [
    {
      id: "plan",
      profileId: "architect",
      prompt:
        "You are the planning step of a Roocode-style sequential boomerang workflow.\n\n" +
        "Task:\n{{task}}\n\n" +
        "Return:\n- a short plan (bullets)\n- key risks/unknowns\n- what to verify after implementation\n",
    },
    {
      id: "implement",
      profileId: "coder",
      prompt:
        "You are the implementation step of a Roocode-style sequential boomerang workflow.\n\n" +
        "Task:\n{{task}}\n\n" +
        "Plan (from prior step):\n{{step:plan}}\n\n" +
        "Do the implementation in the repo. Be careful and secure.\n" +
        "When done, summarize what changed and where.\n",
    },
    {
      id: "review",
      profileId: "explorer",
      prompt:
        "You are the review/verification step of a Roocode-style sequential boomerang workflow.\n\n" +
        "Task:\n{{task}}\n\n" +
        "Implementation summary:\n{{step:implement}}\n\n" +
        "Verify correctness quickly: look for likely regressions, missing exports, inconsistent naming, and obvious edge cases.\n" +
        "Return:\n- issues found (or 'none')\n- specific files/lines to check\n",
    },
    {
      id: "finalize",
      profileId: "coder",
      prompt:
        "You are the finalization step of a Roocode-style sequential boomerang workflow.\n\n" +
        "Task:\n{{task}}\n\n" +
        "Review feedback:\n{{step:review}}\n\n" +
        "If there are issues, fix them. Then return a final, user-facing summary and any required follow-ups.\n",
    },
  ],
};

function clampString(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  return input.slice(0, Math.max(0, maxChars)) + "\n…(truncated)…";
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_m, inner) => {
    const key = String(inner).trim();
    return key in vars ? vars[key] : "";
  });
}

export function createRoocodeBoomerangWorkflow(config?: Partial<RoocodeBoomerangWorkflowConfig>): WorkflowDefinition {
  const cfg: RoocodeBoomerangWorkflowConfig = {
    ...DEFAULT_CONFIG,
    ...(config ?? {}),
    steps: config?.steps ?? DEFAULT_CONFIG.steps,
  };

  const wf: WorkflowDefinition = {
    id: "roocode.boomerang.sequential",
    title: "Roocode Sequential Boomerang",
    description:
      "A Roocode-style sequential workflow that boomerangs outputs between specialists (plan → implement → review → finalize).",
    async run(ctx, input, opts): Promise<WorkflowRunResult<RoocodeBoomerangWorkflowOutput>> {
      const startedAt = new Date();
      const security: Required<WorkflowRunSecurity> = {
        maxSteps: opts?.security?.maxSteps ?? 12,
        maxTaskChars: opts?.security?.maxTaskChars ?? 12_000,
        maxCarryChars: opts?.security?.maxCarryChars ?? 24_000,
        perStepTimeoutMs: opts?.security?.perStepTimeoutMs ?? 120_000,
      };

      const task = String(input.task ?? "");
      if (task.trim().length === 0) {
        const finishedAt = new Date();
        return {
          workflowId: wf.id,
          ok: false,
          error: "Task is required.",
          steps: [],
          metrics: {
            totalDurationMs: finishedAt.getTime() - startedAt.getTime(),
            totalRequestChars: 0,
            totalResponseChars: 0,
            startedAt: startedAt.toISOString(),
            finishedAt: finishedAt.toISOString(),
          },
        };
      }
      if (task.length > security.maxTaskChars) {
        const finishedAt = new Date();
        return {
          workflowId: wf.id,
          ok: false,
          error: `Task too large (${task.length} chars > ${security.maxTaskChars}).`,
          steps: [],
          metrics: {
            totalDurationMs: finishedAt.getTime() - startedAt.getTime(),
            totalRequestChars: 0,
            totalResponseChars: 0,
            startedAt: startedAt.toISOString(),
            finishedAt: finishedAt.toISOString(),
          },
        };
      }

      const stepsToRun = cfg.steps.slice(0, Math.max(0, security.maxSteps));
      const stepOutputs: Record<string, string> = {};
      const steps: WorkflowStepResult[] = [];

      let totalRequestChars = 0;
      let totalResponseChars = 0;

      for (const step of stepsToRun) {
        const t0 = Date.now();
        let workerId = step.profileId;
        try {
          const ensured = await ctx.ensureWorker(step.profileId);
          workerId = ensured.workerId;

          const carryVars: Record<string, string> = {
            task: clampString(task, security.maxCarryChars),
          };
          for (const [k, v] of Object.entries(stepOutputs)) {
            carryVars[`step:${k}`] = clampString(v, security.maxCarryChars);
          }
          const message = renderTemplate(step.prompt, carryVars).trim();

          totalRequestChars += message.length;
          const response = await ctx.askWorker(workerId, message, {
            attachments: step.forwardAttachments ? input.attachments : undefined,
            timeoutMs: security.perStepTimeoutMs,
          });
          totalResponseChars += response.length;
          stepOutputs[step.id] = response;

          const done: WorkflowStepResult = {
            stepId: step.id,
            workerId,
            ok: true,
            requestChars: message.length,
            responseChars: response.length,
            durationMs: Date.now() - t0,
            responseText: response,
          };
          steps.push(done);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          const done: WorkflowStepResult = {
            stepId: step.id,
            workerId,
            ok: false,
            requestChars: 0,
            responseChars: 0,
            durationMs: Date.now() - t0,
            error,
          };
          steps.push(done);
          const finishedAt = new Date();
          return {
            workflowId: wf.id,
            ok: false,
            error: `Step "${step.id}" failed: ${error}`,
            steps,
            metrics: {
              totalDurationMs: finishedAt.getTime() - startedAt.getTime(),
              totalRequestChars,
              totalResponseChars,
              startedAt: startedAt.toISOString(),
              finishedAt: finishedAt.toISOString(),
            },
          };
        }
      }

      const finishedAt = new Date();
      const final = stepOutputs.finalize ?? stepOutputs[stepsToRun[stepsToRun.length - 1]?.id ?? ""] ?? "";
      return {
        workflowId: wf.id,
        ok: true,
        output: { final, stepOutputs },
        steps,
        metrics: {
          totalDurationMs: finishedAt.getTime() - startedAt.getTime(),
          totalRequestChars,
          totalResponseChars,
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
        },
      };
    },
  };

  return wf;
}

export const roocodeBoomerangWorkflow = createRoocodeBoomerangWorkflow();
export const roocodeBoomerangDefaultConfig = DEFAULT_CONFIG;

