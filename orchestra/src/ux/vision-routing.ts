import type { Message, Part } from "@opencode-ai/sdk";
import { extractVisionAttachments } from "./vision-attachments";
import { formatVisionAnalysis, hasVisionParts, replaceImagesWithText } from "./vision-parts";
import type { VisionChatInput, VisionChatOutput, VisionRoutingDeps, VisionRoutingState } from "./vision-types";

export { extractVisionAttachments } from "./vision-attachments";
export { formatVisionAnalysis, hasVisionParts, replaceImagesWithText } from "./vision-parts";
export type {
  VisionChatInput,
  VisionChatOutput,
  VisionPart,
  VisionRoutingDeps,
  VisionRoutingState,
} from "./vision-types";

const DEFAULT_PROMPT =
  "Describe this image precisely and concisely. Include: any visible text (exact wording), code snippets, UI elements, error messages, diagrams, or data. Be factual - do not interpret or answer questions about the image.";

const VISION_PLACEHOLDER =
  "[VISION ANALYSIS IN PROGRESS]\n" +
  "An image is being analyzed by the vision worker. " +
  "The orchestrator will receive the analysis results automatically via the await_worker_job tool.\n" +
  "Do NOT respond about the image until the analysis is complete.";

/** Create a tracking state for processed vision messages. */
export function createVisionRoutingState(): VisionRoutingState {
  return { processedMessageIds: new Set() };
}

/**
 * Route image-bearing user messages through the vision worker.
 * Uses async job-based approach: immediately replaces images with placeholder,
 * starts analysis in background, orchestrator uses await_worker_job to get results.
 */
export async function routeVisionMessage(
  input: VisionChatInput,
  output: VisionChatOutput,
  deps: VisionRoutingDeps,
  state: VisionRoutingState,
): Promise<string | undefined> {
  const role =
    typeof output.message?.role === "string"
      ? output.message?.role
      : typeof input.role === "string"
        ? input.role
        : undefined;
  if (role && role !== "user") return undefined;

  const originalParts = Array.isArray(output.parts) ? output.parts : [];
  if (!hasVisionParts(originalParts)) return undefined;

  const messageId = typeof input.messageID === "string" ? input.messageID : undefined;
  if (messageId && state.processedMessageIds.has(messageId)) return undefined;

  const agentId = typeof input.agent === "string" ? input.agent : undefined;
  const agentProfile = agentId ? deps.profiles[agentId] : undefined;
  const agentSupportsVision = Boolean(agentProfile?.supportsVision) || agentId === "vision";
  if (agentSupportsVision) return undefined;

  const visionProfile = deps.profiles.vision;
  const visionModel = visionProfile?.model ?? "vision";

  if (messageId) state.processedMessageIds.add(messageId);

  const timeoutMs = deps.timeoutMs ?? 300_000;
  const prompt = deps.prompt ?? DEFAULT_PROMPT;
  const startedAt = Date.now();

  // Extract attachments FIRST to check if we have valid images
  const attachments = await extractVisionAttachments(originalParts);
  if (attachments.length === 0) {
    const error = "No valid image attachments found";
    output.parts = replaceImagesWithText(originalParts, formatVisionAnalysis({ error }), {
      sessionID: input.sessionID,
      messageID: input.messageID,
    });
    try {
      await deps.logSink?.({
        status: "failed",
        error,
        sessionId: input.sessionID,
        messageId,
        workerId: "vision",
        model: visionModel,
        startedAt,
        finishedAt: Date.now(),
      });
    } catch {
      // ignore log sink failures
    }
    return undefined;
  }

  // Create a job for async vision analysis
  const job = deps.workers.jobs.create({
    workerId: "vision",
    message: prompt,
    sessionId: input.sessionID,
    requestedBy: agentId ?? "orchestrator",
  });

  // IMMEDIATELY replace images with placeholder showing analysis is in progress
  // This allows the hook to return quickly and the UI to show the message
  const placeholderText =
    `<pasted_image job="${job.id}">\n` +
    VISION_PLACEHOLDER +
    `\nJob ID: ${job.id} - Use await_worker_job({ jobId: "${job.id}" }) to get results.\n` +
    `</pasted_image>`;

  const placeholderParts = replaceImagesWithText(originalParts, placeholderText, {
    sessionID: input.sessionID,
    messageID: input.messageID,
  });

  // Mutate output.parts in place
  output.parts.length = 0;
  output.parts.push(...placeholderParts);

  // Emit vision started event for UI feedback
  deps.communication?.emit(
    "orchestra.vision.started",
    { sessionId: input.sessionID, messageId, jobId: job.id },
    { source: "vision" },
  );

  // Run vision analysis in background (non-blocking)
  void (async () => {
    try {
      // Ensure vision worker is running
      if (deps.ensureWorker) {
        await deps.ensureWorker({ workerId: "vision", reason: "on-demand" });
      } else if (!deps.workers.getWorker("vision")) {
        await deps.workers.spawnById("vision");
      }

      const res = await deps.workers.send("vision", prompt, {
        attachments,
        timeout: timeoutMs,
        from: agentId ?? "orchestrator",
        jobId: job.id,
      });

      const trimmedResponse = typeof res.response === "string" ? res.response.trim() : "";
      const succeeded = res.success && trimmedResponse.length > 0;
      const durationMs = Date.now() - startedAt;

      // Set the job result so await_worker_job can retrieve it
      if (succeeded) {
        const analysisText = formatVisionAnalysis({ response: trimmedResponse });
        deps.workers.jobs.setResult(job.id, { responseText: analysisText });
      } else {
        deps.workers.jobs.setResult(job.id, { error: res.error ?? "Vision analysis failed" });
      }

      // Emit vision completed event for UI feedback
      deps.communication?.emit(
        "orchestra.vision.completed",
        { success: succeeded, error: succeeded ? undefined : res.error, durationMs, jobId: job.id },
        { source: "vision" },
      );

      // Auto-stop vision worker after successful analysis (default: true)
      if (succeeded && deps.autoStopVisionWorker !== false) {
        try {
          await deps.workers.stopWorker("vision");
        } catch {
          // Ignore stop errors - worker may have already stopped
        }
      }

      try {
        await deps.logSink?.({
          status: succeeded ? "succeeded" : "failed",
          analysis: succeeded ? trimmedResponse : undefined,
          error: succeeded ? undefined : (res.error ?? "Vision analysis failed"),
          sessionId: input.sessionID,
          messageId,
          workerId: "vision",
          model: visionModel,
          attachments: attachments.length,
          requestedBy: agentId,
          startedAt,
          finishedAt: Date.now(),
          durationMs,
          jobId: job.id,
        });
      } catch {
        // ignore log sink failures
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const durationMs = Date.now() - startedAt;

      // Set error result on the job
      deps.workers.jobs.setResult(job.id, { error });

      // Emit vision failed event for UI feedback
      deps.communication?.emit(
        "orchestra.vision.completed",
        { success: false, error, durationMs, jobId: job.id },
        { source: "vision" },
      );

      try {
        await deps.logSink?.({
          status: "failed",
          error,
          sessionId: input.sessionID,
          messageId,
          workerId: "vision",
          model: visionModel,
          startedAt,
          finishedAt: Date.now(),
          durationMs,
          jobId: job.id,
        });
      } catch {
        // ignore log sink failures
      }
    }
  })();

  // Return the job ID so callers know analysis is pending
  return job.id;
}

/** Backfill processed vision message IDs by scanning message outputs. */
export function syncVisionProcessedMessages(
  output: { messages: Array<{ info?: Message; parts?: Part[] }> },
  state: VisionRoutingState,
) {
  const messages = output.messages ?? [];
  for (const msg of messages) {
    const info = msg?.info;
    if (info?.role !== "user") continue;
    const messageId = typeof info?.id === "string" ? info.id : undefined;
    if (!messageId || state.processedMessageIds.has(messageId)) continue;
    const parts = Array.isArray(msg.parts) ? msg.parts : [];
    const hasMarker = parts.some(
      (part) =>
        part.type === "text" &&
        typeof part.text === "string" &&
        (part.text.includes("<pasted_image>") || part.text.includes("[VISION ANALYSIS")),
    );
    if (hasMarker) state.processedMessageIds.add(messageId);
  }
}
