import { buildPromptParts, prepareWorkerAttachments, type WorkerAttachment } from "./prompt/attachments";
import { extractWorkerResponse } from "./prompt/extract";

export type SendToWorkerOptions = {
  attachments?: WorkerAttachment[];
  timeout?: number;
  jobId?: string;
  /** Source worker ID (for worker-to-worker communication) */
  from?: string;
  /** Parent session id for agent backend */
  sessionId?: string;
};

export function buildWorkerTaskText(input: {
  message: string;
  jobId?: string;
  from?: string;
  allowStreaming?: boolean;
}): string {
  const sourceFrom = input.from ?? "orchestrator";
  const jobIdStr = input.jobId ?? "none";
  const allowStreaming = input.allowStreaming !== false;
  const sourceInfo =
    `<message-source from="${sourceFrom}" jobId="${jobIdStr}">\n` +
    `This message was sent by ${sourceFrom === "orchestrator" ? "the orchestrator" : `worker \"${sourceFrom}\"`}\n` +
    `</message-source>\n\n`;

  let taskText = sourceInfo + input.message;
  if (input.jobId) {
    taskText +=
      `\n\n<orchestrator-job id="${input.jobId}">\n` +
      `IMPORTANT:\n` +
      `- Include your full result as plain text in your assistant response.\n` +
      (allowStreaming
        ? `- For long tasks, stream progress with stream_chunk and include this jobId.\n`
        : "") +
      `</orchestrator-job>`;
  } else {
    taskText +=
      `\n\n<orchestrator-sync>\n` +
      `IMPORTANT: Reply with your final answer as plain text in your assistant response.\n` +
      (allowStreaming
        ? `Stream with stream_chunk if the response is long or incremental.\n`
        : "") +
      `If you do call any tools, still include the full answer as plain text.\n` +
      `</orchestrator-sync>`;
  }

  return taskText;
}

export async function sendWorkerPrompt(input: {
  client: any;
  sessionId: string;
  directory: string;
  workerId: string;
  message: string;
  attachments?: WorkerAttachment[];
  timeoutMs?: number;
  jobId?: string;
  from?: string;
  allowStreaming?: boolean;
  agent?: string;
  debugLabel?: string;
}): Promise<string> {
  const taskText = buildWorkerTaskText({
    message: input.message,
    jobId: input.jobId,
    from: input.from,
    allowStreaming: input.allowStreaming,
  });

  const prepared = await prepareWorkerAttachments({
    attachments: input.attachments,
    baseDir: input.directory,
    workerId: input.workerId,
  });

  try {
    const parts = await buildPromptParts({ message: taskText, attachments: prepared.attachments });

    const abort = new AbortController();
    const timeoutMs = input.timeoutMs ?? 600_000;
    const timer = setTimeout(() => abort.abort(new Error("worker prompt timed out")), timeoutMs);

    const result = await input.client.session
      .prompt({
        path: { id: input.sessionId },
        body: {
          ...(input.agent ? { agent: input.agent } : {}),
          parts: parts as any,
        },
        query: { directory: input.directory },
        signal: abort.signal as any,
      } as any)
      .finally(() => clearTimeout(timer));

    const sdkError: any = (result as any)?.error;
    if (sdkError) {
      const msg =
        sdkError?.data?.message ??
        sdkError?.message ??
        (typeof sdkError === "string" ? sdkError : JSON.stringify(sdkError));
      const err = new Error(msg);
      (err as any).isSdkError = true;
      throw err;
    }

    const promptData = result.data as any;
    return await extractWorkerResponse({
      client: input.client,
      sessionId: input.sessionId,
      directory: input.directory,
      promptData,
      timeoutMs,
      debugLabel: input.debugLabel,
    });
  } finally {
    await prepared.cleanup();
  }
}
