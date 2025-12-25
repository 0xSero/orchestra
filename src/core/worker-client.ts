import { logger } from "./logger";
import { createStreamBuffer } from "./stream-formatter";
import type { StreamChunk } from "./stream-events";
import type { WorkerPool } from "./worker-pool";
import { buildPromptParts, extractTextFromPromptResponse, type WorkerAttachment } from "../workers/prompt";
import { prepareWorkerAttachments } from "../workers/attachments";

export type WorkerStreamUpdate = {
  chunk: StreamChunk;
  formatted: string;
  accumulated: string;
};

export interface WorkerClientOptions {
  workerId: string;
  timeoutMs?: number;
  onProgress?: (stage: string, percent?: number) => void;
  onStreamChunk?: (update: WorkerStreamUpdate) => void;
}

export interface WorkerSendOptions {
  attachments?: WorkerAttachment[];
  timeoutMs?: number;
  jobId?: string;
  from?: string;
  onProgress?: (stage: string, percent?: number) => void;
  onStreamChunk?: (update: WorkerStreamUpdate) => void;
}

export type WorkerSendResult = {
  success: boolean;
  response?: string;
  error?: string;
  durationMs?: number;
  streamed?: {
    chunks: number;
    text: string;
  };
};

const DEFAULT_TIMEOUT_MS = 600_000;
const READY_WAIT_CAP_MS = 5 * 60_000;

function buildTaskText(message: string, options?: { jobId?: string; from?: string }): string {
  const sourceFrom = options?.from ?? "orchestrator";
  const jobIdStr = options?.jobId ?? "none";
  const sourceInfo =
    `<message-source from="${sourceFrom}" jobId="${jobIdStr}">\n` +
    `This message was sent by ${sourceFrom === "orchestrator" ? "the orchestrator" : `worker "${sourceFrom}"`}.\n` +
    `</message-source>\n\n`;

  let taskText = sourceInfo + message;
  if (options?.jobId) {
    taskText +=
      `\n\n<orchestrator-job id="${options.jobId}">\n` +
      `IMPORTANT:\n` +
      `- Include your full result as plain text in your assistant response.\n` +
      `- For long tasks, stream progress with stream_chunk and include this jobId.\n` +
      `</orchestrator-job>`;
  } else {
    taskText +=
      `\n\n<orchestrator-sync>\n` +
      `IMPORTANT: Reply with your final answer as plain text in your assistant response.\n` +
      `Stream with stream_chunk if the response is long or incremental.\n` +
      `If you do call any tools, still include the full answer as plain text.\n` +
      `</orchestrator-sync>`;
  }

  return taskText;
}

function extractStreamChunks(value: any): string {
  const parts = Array.isArray(value?.parts)
    ? value.parts
    : Array.isArray(value?.message?.parts)
      ? value.message.parts
      : [];
  if (!Array.isArray(parts) || parts.length === 0) return "";
  const chunks = parts
    .filter((part: any) => part?.type === "tool" && part?.tool === "stream_chunk")
    .map((part: any) => {
      const input = part?.state?.input;
      return typeof input?.chunk === "string" ? input.chunk : "";
    })
    .filter((chunk: string) => chunk.length > 0);
  return chunks.join("");
}

function extractReasoningText(value: any): string {
  const parts = Array.isArray(value?.parts)
    ? value.parts
    : Array.isArray(value?.message?.parts)
      ? value.message.parts
      : [];
  if (!Array.isArray(parts) || parts.length === 0) return "";
  return parts
    .filter((part: any) => part?.type === "reasoning" && typeof part?.text === "string")
    .map((part: any) => part.text)
    .join("\n");
}

function summarizeChunk(chunk: string, maxLen: number = 140): string {
  const single = chunk.replace(/\s+/g, " ").trim();
  if (single.length <= maxLen) return single;
  return `${single.slice(0, maxLen - 3)}...`;
}

export class WorkerClient {
  constructor(private readonly pool: WorkerPool, private readonly options: WorkerClientOptions) {}

  async send(message: string, options: WorkerSendOptions = {}): Promise<WorkerSendResult> {
    const workerId = this.options.workerId;
    const instance = this.pool.get(workerId);
    if (!instance) return { success: false, error: `Worker "${workerId}" not found` };

    if (instance.status === "error" || instance.status === "stopped") {
      return { success: false, error: `Worker "${workerId}" is ${instance.status}` };
    }

    const timeoutMs = options.timeoutMs ?? this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const onProgress = options.onProgress ?? this.options.onProgress;
    const onStreamChunk = options.onStreamChunk ?? this.options.onStreamChunk;

    if (instance.status !== "ready") {
      onProgress?.("waiting_for_worker", 10);
      const waitMs = Math.min(timeoutMs, READY_WAIT_CAP_MS);
      const ready = await this.pool.waitForStatus(workerId, "ready", waitMs);
      if (!ready) {
        return {
          success: false,
          error: `Worker "${workerId}" did not become ready within ${waitMs}ms`,
        };
      }
    }

    if (!instance.client || !instance.sessionId) {
      return { success: false, error: `Worker "${workerId}" not properly initialized` };
    }

    const startedAt = Date.now();
    this.pool.updateStatus(workerId, "busy");
    instance.currentTask = message.slice(0, 140);
    logger.info(`[worker-client] ${workerId} sending${options.jobId ? ` job=${options.jobId}` : ""}`);

    const streamBuffer = createStreamBuffer(workerId);
    let streamChunks = 0;
    const unsubscribe = this.pool.subscribeToStream(
      workerId,
      (chunk) => {
        streamChunks += 1;
        const formatted = streamBuffer.add(chunk.chunk, Boolean(chunk.final));
        const accumulated = streamBuffer.getFullContent();
        if (onStreamChunk) {
          onStreamChunk({ chunk, formatted, accumulated });
        }
        logger.debug(
          `[worker-client] ${workerId} stream_chunk${chunk.jobId ? `:${chunk.jobId}` : ""} ${summarizeChunk(chunk.chunk)}`
        );
        onProgress?.("streaming", 70);
      },
      { jobId: options.jobId }
    );

    let cleanupAttachments: (() => Promise<void>) | undefined;

    try {
      onProgress?.("sending", 30);
      const taskText = buildTaskText(message, { jobId: options.jobId, from: options.from });

      const prepared = await prepareWorkerAttachments({
        attachments: options.attachments,
        baseDir: instance.directory ?? process.cwd(),
        workerId,
      });
      cleanupAttachments = prepared.cleanup;

      const parts = await buildPromptParts({ message: taskText, attachments: prepared.attachments });

      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(new Error("worker prompt timed out")), timeoutMs);

      const result = await instance.client.session
        .prompt({
          path: { id: instance.sessionId },
          body: { parts: parts as any },
          query: { directory: instance.directory ?? process.cwd() },
          signal: abort.signal as any,
        } as any)
        .finally(() => clearTimeout(timer));

      const sdkError: any = (result as any)?.error;
      if (sdkError) {
        const msg =
          sdkError?.data?.message ??
          sdkError?.message ??
          (typeof sdkError === "string" ? sdkError : JSON.stringify(sdkError));
        instance.warning = `Last request failed: ${msg}`;
        throw new Error(msg);
      }

      const promptData = (result as any)?.data ?? result;
      const extracted = extractTextFromPromptResponse(promptData);

      let responseText = extracted.text.trim();
      if (!responseText) responseText = extractReasoningText(promptData).trim();
      if (!responseText) responseText = streamBuffer.getFullContent().trim();
      if (!responseText) responseText = extractStreamChunks(promptData).trim();

      if (!responseText) {
        const messageId = promptData?.info?.id ?? promptData?.message?.info?.id;
        if (messageId) {
          for (let attempt = 0; attempt < 3 && !responseText; attempt += 1) {
            const messageRes = await instance.client.session.message({
              path: { id: instance.sessionId, messageID: messageId },
              query: { directory: instance.directory ?? process.cwd() },
            });
            const messageData = (messageRes as any)?.data ?? messageRes;
            const fromMessage = extractTextFromPromptResponse(messageData);
            responseText = fromMessage.text.trim();
            if (!responseText) responseText = extractReasoningText(messageData).trim();
            if (!responseText) responseText = extractStreamChunks(messageData).trim();
            if (!responseText) {
              await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
            }
          }
        }
      }

      if (!responseText) {
        const pollDeadline = Date.now() + Math.min(10_000, timeoutMs);
        while (!responseText && Date.now() < pollDeadline) {
          const messagesRes = await instance.client.session.messages({
            path: { id: instance.sessionId },
            query: { directory: instance.directory ?? process.cwd(), limit: 10 },
          });
          const messages = Array.isArray((messagesRes as any)?.data)
            ? (messagesRes as any).data
            : Array.isArray(messagesRes)
              ? messagesRes
              : [];
          const assistant = [...messages].reverse().find((m: any) => m?.info?.role === "assistant");
          if (assistant) {
            const fromMessage = extractTextFromPromptResponse(assistant);
            responseText = fromMessage.text.trim();
            if (!responseText) responseText = extractReasoningText(assistant).trim();
            if (!responseText) responseText = extractStreamChunks(assistant).trim();
          }
          if (!responseText) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      }

      if (!responseText) {
        if (process.env.OPENCODE_ORCH_SPAWNER_DEBUG === "1") {
          try {
            const messagesRes = await instance.client.session.messages({
              path: { id: instance.sessionId },
              query: { directory: instance.directory ?? process.cwd(), limit: 20 },
            });
            const messages = Array.isArray((messagesRes as any)?.data)
              ? (messagesRes as any).data
              : Array.isArray(messagesRes)
                ? messagesRes
                : [];
            const summary = messages.map((m: any) => ({
              role: m?.info?.role,
              id: m?.info?.id,
              finish: m?.info?.finish,
              error: m?.info?.error,
              parts: Array.isArray(m?.parts) ? m.parts.map((p: any) => p?.type).filter(Boolean) : [],
            }));
            logger.debug(`[worker-client] empty response summary ${JSON.stringify(summary)}`);
          } catch (error) {
            logger.debug(`[worker-client] empty response debug failed`, error);
          }
        }
        throw new Error(
          `Worker returned no text output (${extracted.debug ?? "unknown"}). ` +
            `This usually means the worker model/provider is misconfigured or unavailable.`
        );
      }

      onProgress?.("complete", 100);
      this.pool.updateStatus(workerId, "ready");
      instance.currentTask = undefined;
      instance.warning = undefined;

      const durationMs = Date.now() - startedAt;
      instance.lastResult = {
        at: new Date(),
        jobId: options.jobId ?? instance.lastResult?.jobId,
        response: responseText,
        report: instance.lastResult?.report,
        durationMs,
      };

      logger.info(`[worker-client] ${workerId} complete in ${durationMs}ms`);

      return {
        success: true,
        response: responseText,
        durationMs,
        streamed: {
          chunks: streamChunks,
          text: streamBuffer.getFullContent(),
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.pool.updateStatus(workerId, "ready");
      instance.currentTask = undefined;
      instance.warning = instance.warning ?? `Last request failed: ${errorMsg}`;
      logger.warn(`[worker-client] ${workerId} failed: ${errorMsg}`);
      return { success: false, error: errorMsg };
    } finally {
      unsubscribe();
      if (cleanupAttachments) {
        await cleanupAttachments();
      }
    }
  }
}
