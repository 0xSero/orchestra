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

/** Create a tracking state for processed vision messages. */
export function createVisionRoutingState(): VisionRoutingState {
  return { processedMessageIds: new Set() };
}

/** Route image-bearing user messages through the vision worker when needed. */
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

  try {
    if (deps.ensureWorker) {
      await deps.ensureWorker({ workerId: "vision", reason: "on-demand" });
    } else if (!deps.workers.getWorker("vision")) {
      await deps.workers.spawnById("vision");
    }

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

    const res = await deps.workers.send("vision", prompt, {
      attachments,
      timeout: timeoutMs,
      from: agentId ?? "orchestrator",
    });

    const trimmedResponse = typeof res.response === "string" ? res.response.trim() : "";
    const analysisText = formatVisionAnalysis({ response: trimmedResponse, error: res.error });
    output.parts = replaceImagesWithText(originalParts, analysisText, {
      sessionID: input.sessionID,
      messageID: input.messageID,
    });

    const succeeded = res.success && trimmedResponse.length > 0;
    try {
      await deps.logSink?.({
        status: succeeded ? "succeeded" : "failed",
        analysis: succeeded ? analysisText : undefined,
        error: succeeded ? undefined : (res.error ?? "Vision analysis failed"),
        sessionId: input.sessionID,
        messageId,
        workerId: "vision",
        model: visionModel,
        attachments: attachments.length,
        requestedBy: agentId,
        startedAt,
        finishedAt: Date.now(),
        durationMs: Date.now() - startedAt,
      });
    } catch {
      // ignore log sink failures
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[Vision] Failed to process image:", error);
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
        durationMs: Date.now() - startedAt,
      });
    } catch {
      // ignore log sink failures
    }
  }

  return undefined;
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
