import type { CommunicationService } from "../communication";
import type { WorkerInstance } from "../types";
import { prepareWorkerAttachments } from "./attachments";
import type { WorkerAttachment } from "./prompt";
import { buildPromptParts, extractTextFromPromptResponse } from "./prompt";
import type { WorkerRegistry } from "./registry";

export type WorkerSendOptions = {
  attachments?: WorkerAttachment[];
  timeoutMs?: number;
  jobId?: string;
  from?: string;
  /** Optional communication service to emit streaming events */
  communication?: CommunicationService;
};

export type WorkerSendResult = {
  success: boolean;
  response?: string;
  error?: string;
  durationMs?: number;
};

const DEFAULT_TIMEOUT_MS = 600_000;
const READY_WAIT_CAP_MS = 5 * 60_000;

type WorkerClient = NonNullable<WorkerInstance["client"]>;
type SessionPromptArgs = Parameters<WorkerClient["session"]["prompt"]>[0] & { throwOnError?: false };

const asRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const extractSdkError = (value: unknown): unknown | undefined => {
  if (asRecord(value) && "error" in value) return (value as { error?: unknown }).error;
  return undefined;
};

const extractSdkData = (value: unknown): unknown => {
  if (asRecord(value) && "data" in value) return (value as { data?: unknown }).data ?? value;
  return value;
};

const extractSdkErrorMessage = (value: unknown): string => {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (asRecord(value)) {
    const data = value.data;
    if (asRecord(data) && typeof data.message === "string") return data.message;
    if (typeof value.message === "string") return value.message;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, abort?: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      abort?.abort(new Error("worker prompt timed out"));
      reject(new Error("worker prompt timed out"));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

function buildTaskText(message: string, options?: { jobId?: string; from?: string }): string {
  const sourceFrom = options?.from ?? "orchestrator";
  const jobIdStr = options?.jobId ?? "none";
  const sourceInfo =
    `<message-source from="${sourceFrom}" jobId="${jobIdStr}">\n` +
    `This message was sent by ${sourceFrom === "orchestrator" ? "the orchestrator" : `worker "${sourceFrom}"`}.
` +
    `</message-source>\n\n`;

  let taskText = sourceInfo + message;
  if (options?.jobId) {
    taskText +=
      `\n\n<orchestrator-job id="${options.jobId}">\n` +
      `IMPORTANT: Reply with your full answer as plain text.\n` +
      `</orchestrator-job>`;
  } else {
    taskText +=
      "\n\n<orchestrator-sync>\n" + "IMPORTANT: Reply with your final answer as plain text.\n" + "</orchestrator-sync>";
  }

  return taskText;
}

export async function sendWorkerMessage(input: {
  registry: WorkerRegistry;
  workerId: string;
  message: string;
  options?: WorkerSendOptions;
  beforePrompt?: (instance: WorkerInstance) => Promise<void>;
}): Promise<WorkerSendResult> {
  const instance = input.registry.get(input.workerId);
  if (!instance) return { success: false, error: `Worker "${input.workerId}" not found` };

  if (instance.status === "error" || instance.status === "stopped") {
    return { success: false, error: `Worker "${input.workerId}" is ${instance.status}` };
  }

  const timeoutMs = input.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (instance.status !== "ready") {
    const waitMs = Math.min(timeoutMs, READY_WAIT_CAP_MS);
    const ready = await input.registry.waitForStatus(input.workerId, "ready", waitMs);
    if (!ready) {
      return { success: false, error: `Worker "${input.workerId}" did not become ready within ${waitMs}ms` };
    }
  }

  if (!instance.client || !instance.sessionId) {
    return { success: false, error: `Worker "${input.workerId}" not properly initialized` };
  }

  const startedAt = Date.now();
  input.registry.updateStatus(input.workerId, "busy");
  instance.currentTask = input.message.slice(0, 140);

  let cleanupAttachments: (() => Promise<void>) | undefined;
  try {
    if (input.beforePrompt) {
      try {
        await input.beforePrompt(instance);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        instance.warning = `Pre-prompt hook failed: ${msg}`;
      }
    }

    const taskText = buildTaskText(input.message, { jobId: input.options?.jobId, from: input.options?.from });

    const prepared = await prepareWorkerAttachments({
      attachments: input.options?.attachments,
      baseDir: instance.directory ?? process.cwd(),
      workerId: input.workerId,
    });
    cleanupAttachments = prepared.cleanup;

    const parts = await buildPromptParts({ message: taskText, attachments: prepared.attachments });

    const abort = new AbortController();
    const promptArgs: SessionPromptArgs = {
      path: { id: instance.sessionId },
      body: { parts },
      query: { directory: instance.directory ?? process.cwd() },
      signal: abort.signal,
      throwOnError: false,
    };

    const communication = input.options?.communication;
    const emitStreamChunk = (chunk: string, final = false) => {
      if (!communication) return;
      communication.emit(
        "orchestra.worker.stream",
        {
          chunk: {
            workerId: input.workerId,
            jobId: input.options?.jobId,
            chunk,
            timestamp: Date.now(),
            final,
          },
        },
        { source: "worker", workerId: input.workerId, jobId: input.options?.jobId },
      );
    };

    // Emit start event
    emitStreamChunk("", false);

    const result = await withTimeout(instance.client.session.prompt(promptArgs), timeoutMs, abort);

    const sdkError = extractSdkError(result);
    if (sdkError) {
      const msg = extractSdkErrorMessage(sdkError);
      instance.warning = `Last request failed: ${msg}`;
      emitStreamChunk(`Error: ${msg}`, true);
      throw new Error(msg);
    }

    const promptData = extractSdkData(result);
    const extracted = extractTextFromPromptResponse(promptData);
    const responseText = extracted.text.trim();

    // Emit the full response as a stream chunk (SDK doesn't support true streaming yet)
    emitStreamChunk(responseText, true);

    instance.lastResult = {
      at: new Date(),
      jobId: input.options?.jobId,
      response: responseText,
      durationMs: Date.now() - startedAt,
    };
    instance.lastActivity = new Date();
    input.registry.updateStatus(input.workerId, "ready");

    return {
      success: true,
      response: responseText,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    instance.error = errorMsg;
    input.registry.updateStatus(input.workerId, "error", errorMsg);
    return { success: false, error: errorMsg };
  } finally {
    try {
      await cleanupAttachments?.();
    } catch {
      // ignore
    }
  }
}
