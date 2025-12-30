import type { OrchestratorContext } from "../context/orchestrator-context";
import { workerJobs } from "../core/jobs";
import { normalizeForMemory } from "../memory/text";
import { createMemoryTask, failMemoryTask, isMemoryTaskPending } from "../memory/tasks";
import { extractImages, formatVisionAnalysis, hasImages } from "../vision/analyzer";
import { getWorkflow } from "./engine";
import { resolveWorkflowLimits, runWorkflowWithContext } from "./runner";
import type { WorkflowRunResult } from "./types";

type ToastFn = (message: string, variant: "success" | "info" | "warning" | "error") => Promise<void>;
type WorkflowTriggerOptions = {
  visionTimeoutMs: number;
  processedMessageIds?: Set<string>;
  showToast?: ToastFn;
  runWorkflow?: (input: {
    workflowId: string;
    task: string;
    attachments?: any[];
    autoSpawn?: boolean;
    limits?: ReturnType<typeof resolveWorkflowLimits>;
  }, options?: { sessionId?: string }) => Promise<WorkflowRunResult>;
};

type TriggerConfig = {
  enabled?: boolean;
  workflowId?: string;
  autoSpawn?: boolean;
  blocking?: boolean;
};

function resolveTriggerConfig(overrides: TriggerConfig | undefined, defaults: TriggerConfig): Required<TriggerConfig> {
  const workflowId =
    typeof overrides?.workflowId === "string" && overrides.workflowId.trim().length > 0
      ? overrides.workflowId
      : defaults.workflowId ?? "unknown";
  return {
    enabled: overrides?.enabled ?? defaults.enabled ?? true,
    workflowId,
    autoSpawn: overrides?.autoSpawn ?? defaults.autoSpawn ?? true,
    blocking: overrides?.blocking ?? defaults.blocking ?? false,
  };
}

function extractTextFromParts(parts: any[]): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((p) => p?.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n")
    .trim();
}

function extractTextFromMessage(msg: any): string {
  if (!msg) return "";
  if (typeof msg.message === "string") return msg.message;
  if (typeof msg.content === "string") return msg.content;
  if (typeof msg.text === "string") return msg.text;
  const parts = Array.isArray(msg.parts) ? msg.parts : Array.isArray(msg.content?.parts) ? msg.content.parts : [];
  return extractTextFromParts(parts);
}

function extractPartsFromMessage(msg: any, fallback?: any[]): any[] {
  if (!msg) return Array.isArray(fallback) ? fallback : [];
  if (Array.isArray(msg.parts)) return msg.parts;
  if (Array.isArray(msg.content?.parts)) return msg.content.parts;
  return Array.isArray(fallback) ? fallback : [];
}

function appendAnalysisText(parts: any[], analysisText: string, meta?: { sessionID?: string; messageID?: string }): any[] {
  if (!Array.isArray(parts)) return parts;
  const next = [...parts];
  for (let i = next.length - 1; i >= 0; i -= 1) {
    const p = next[i];
    if (p?.type === "text" && typeof p.text === "string") {
      p.text += `\n\n${analysisText}\n`;
      return next;
    }
  }
  next.push({
    type: "text",
    text: analysisText,
    id: `${meta?.messageID ?? "msg"}-vision-analysis`,
    sessionID: meta?.sessionID ?? "",
    messageID: meta?.messageID ?? "",
    synthetic: true,
  });
  return next;
}

function extractSectionItems(text: string, headings: string[], limit = 6): string[] {
  const lines = text.split(/\r?\n/);
  const normalizedHeadings = headings.map((h) => h.toLowerCase());
  const items: string[] = [];
  let collecting = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (collecting) break;
      continue;
    }

    const lower = trimmed.toLowerCase();
    const headingIndex = normalizedHeadings.findIndex((h) => lower === h || lower.startsWith(`${h}:`));
    if (headingIndex >= 0) {
      collecting = true;
      const inline = trimmed.split(":").slice(1).join(":").trim();
      if (inline) {
        inline.split(/[;,]/).forEach((item) => {
          const cleaned = item.trim();
          if (cleaned) items.push(cleaned);
        });
      }
      continue;
    }

    if (!collecting) continue;

    if (/^[A-Za-z][A-Za-z\s-]{1,20}:\s*$/.test(trimmed)) break;

    const cleaned = trimmed.replace(/^[-*•]\s*/, "").trim();
    if (cleaned) items.push(cleaned);
  }

  const deduped = [...new Set(items)];
  return deduped.slice(0, limit);
}

function selectWorkflowWorker(context: OrchestratorContext, workflowId: string, fallback: string): string {
  const workflow = getWorkflow(workflowId);
  const workerId = workflow?.steps[0]?.workerId ?? fallback;
  if (context.profiles[workerId]) return workerId;
  return workflow?.steps[0]?.workerId ?? fallback;
}

function pickWorkflowResponse(result: WorkflowRunResult): { success: boolean; response?: string; error?: string } {
  const errorStep = result.steps.find((step) => step.status === "error");
  if (errorStep) {
    return { success: false, error: errorStep.error ?? "workflow step failed" };
  }
  const responseStep = [...result.steps].reverse().find((step) => typeof step.response === "string" && step.response.length > 0);
  if (!responseStep) {
    return { success: false, error: "workflow produced no response" };
  }
  return { success: true, response: responseStep.response };
}

export function createWorkflowTriggers(context: OrchestratorContext, options: WorkflowTriggerOptions) {
  const processedMessageIds = options.processedMessageIds ?? new Set<string>();
  const showToast = options.showToast ?? (async () => {});
  const runWorkflow = options.runWorkflow ?? ((input, runOptions) => runWorkflowWithContext(context, input, runOptions));

  const visionDefaults: TriggerConfig = { enabled: true, workflowId: "vision", autoSpawn: true, blocking: false };
  const memoryDefaults: TriggerConfig = { enabled: true, workflowId: "memory", autoSpawn: true, blocking: false };

  const handleVisionMessage = async (input: any, output: any): Promise<void> => {
    if (context.workflows?.enabled === false) return;
    const trigger = resolveTriggerConfig(context.workflows?.triggers?.visionOnImage, visionDefaults);
    if (!trigger.enabled) return;

    const outputParts = Array.isArray(output.parts) ? output.parts : [];
    const originalParts = extractPartsFromMessage(input, outputParts);
    if (!hasImages(originalParts)) return;

    const messageId = typeof input.messageID === "string" ? input.messageID : undefined;
    if (messageId && processedMessageIds.has(messageId)) return;

    const agentId = typeof input.agent === "string" ? input.agent : undefined;
    const sessionId = typeof input.sessionID === "string" ? input.sessionID : undefined;
    if (!sessionId) return;
    const agentProfile = agentId ? context.profiles[agentId] : undefined;
    const agentSupportsVision = Boolean(agentProfile?.supportsVision) || agentId === "vision";
    if (agentSupportsVision) return;

    const alreadyInjected = outputParts.some(
      (p: any) => p?.type === "text" && typeof p.text === "string" && p.text.includes("[VISION ANALYSIS")
    );
    if (alreadyInjected) {
      if (messageId) processedMessageIds.add(messageId);
      return;
    }

    const workflowId = trigger.workflowId;
    if (!getWorkflow(workflowId)) return;

    const workerId = selectWorkflowWorker(context, workflowId, "vision");
    const workerProfile = context.profiles[workerId];

    const job = workerJobs.create({
      workerId,
      message: `workflow:${workflowId}`,
      sessionId,
      requestedBy: agentId,
    });
    if (messageId) processedMessageIds.add(messageId);

    const run = async () => {
      try {
        const attachments = await extractImages(originalParts);
        if (attachments.length === 0) {
          const error = "No valid image attachments found";
          workerJobs.setError(job.id, { error });
          await showToast(`Vision analysis failed: ${error}`, "warning");
          return;
        }

        const taskText = extractTextFromParts(originalParts) || "Analyze the attached image(s).";
        const limits = resolveWorkflowLimits(context, workflowId);
        const perStepTimeoutMs = Math.min(options.visionTimeoutMs, limits.perStepTimeoutMs);
        const result = await runWorkflow(
          {
            workflowId,
            task: taskText,
            attachments,
            autoSpawn: trigger.autoSpawn,
            limits: { ...limits, perStepTimeoutMs },
          },
          { sessionId }
        );

        const picked = pickWorkflowResponse(result);
        const analysisText = formatVisionAnalysis({
          success: picked.success,
          analysis: picked.response,
          error: picked.error,
          model: workerProfile?.model,
        });

        if (analysisText) {
          workerJobs.setResult(job.id, { responseText: analysisText });
        } else {
          workerJobs.setError(job.id, { error: picked.error ?? "Vision analysis failed" });
        }

        if (trigger.blocking && analysisText) {
          output.parts = appendAnalysisText(outputParts, analysisText, {
            sessionID: sessionId,
            messageID: input.messageID,
          });
          if (messageId) processedMessageIds.add(messageId);
        }

        if (!picked.success && picked.error) {
          await showToast(`Vision analysis failed: ${picked.error}`, "warning");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        workerJobs.setError(job.id, { error: msg });
        await showToast(`Vision analysis crashed: ${msg}`, "error");
      }
    };

    if (trigger.blocking) {
      await run();
    } else {
      void run();
    }
  };

  const handleMemoryTurnEnd = async (input: any, _output: any): Promise<void> => {
    if (context.workflows?.enabled === false) return;
    if (context.config.memory?.enabled === false || context.config.memory?.autoRecord === false) return;

    const trigger = resolveTriggerConfig(context.workflows?.triggers?.memoryOnTurnEnd, memoryDefaults);
    if (!trigger.enabled) return;

    if (!getWorkflow(trigger.workflowId)) return;

    const role = typeof input.role === "string" ? input.role : undefined;
    if (role !== "assistant") return;

    const agentId = typeof input.agent === "string" ? input.agent : undefined;
    const sessionId = typeof input.sessionID === "string" ? input.sessionID : undefined;
    if (!sessionId) return;
    const memoryWorkerId = selectWorkflowWorker(context, trigger.workflowId, "memory");
    if (agentId === memoryWorkerId) return;

    const text = extractTextFromMessage(input);
    if (!text) return;

    const summary = normalizeForMemory(text, context.config.memory?.maxChars ?? 2000);
    if (!summary) return;

    const decisions = extractSectionItems(text, ["decision", "decisions"]);
    const todos = extractSectionItems(text, ["todo", "todos", "action items", "next steps"]);
    const entities = extractSectionItems(text, ["entities", "entity", "people", "systems"]);

    const scope = (context.config.memory?.scope ?? "project") as "project" | "global";
    if (scope === "project" && !context.projectId) return;

    const payload = createMemoryTask({
      sessionId,
      projectId: context.projectId,
      scope,
      turn: {
        role,
        agent: agentId,
        messageId: typeof input.messageID === "string" ? input.messageID : undefined,
        summary,
        ...(decisions.length ? { decisions } : {}),
        ...(todos.length ? { todos } : {}),
        ...(entities.length ? { entities } : {}),
      },
    });

    const taskText = JSON.stringify(payload, null, 2);

    const run = async () => {
      try {
        const limits = resolveWorkflowLimits(context, trigger.workflowId);
        const result = await runWorkflow(
          {
            workflowId: trigger.workflowId,
            task: taskText,
            autoSpawn: trigger.autoSpawn,
            limits,
          },
          { sessionId }
        );

        const picked = pickWorkflowResponse(result);
        if (!picked.success && picked.error) {
          failMemoryTask(payload.taskId, picked.error);
          return;
        }

        if (isMemoryTaskPending(payload.taskId)) {
          // no-op
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failMemoryTask(payload.taskId, msg);
      }
    };

    if (trigger.blocking) {
      await run();
    } else {
      void run();
    }
  };

  return {
    handleVisionMessage,
    handleMemoryTurnEnd,
    processedMessageIds,
  };
}
