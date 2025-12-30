import { logger } from "../../core/logger";

export function extractTextFromPromptResponse(data: unknown): { text: string; debug?: string } {
  const asObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
  const readParts = (v: unknown): unknown[] | undefined => {
    if (!asObj(v)) return undefined;
    const parts = (v as any).parts;
    if (Array.isArray(parts)) return parts;
    return undefined;
  };

  const parts = readParts(data) ?? readParts(asObj(data) ? (data as any).message : undefined) ?? [];
  if (!Array.isArray(parts) || parts.length === 0) return { text: "", debug: "no_parts" };

  let text = "";
  const partTypes: string[] = [];
  for (const part of parts) {
    if (!asObj(part)) continue;
    const type = typeof (part as any).type === "string" ? (part as any).type : "unknown";
    partTypes.push(type);
    if (type === "text" && typeof (part as any).text === "string") text += (part as any).text;
  }

  const debug = text.length > 0 ? undefined : `parts:${[...new Set(partTypes)].join(",")}`;
  return { text, debug };
}

export function extractStreamChunks(value: any): string {
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

export async function extractWorkerResponse(input: {
  client: any;
  sessionId: string;
  directory: string;
  promptData: any;
  timeoutMs: number;
  debugLabel?: string;
}): Promise<string> {
  const { client, sessionId, directory, promptData, timeoutMs, debugLabel } = input;

  const extracted = extractTextFromPromptResponse(promptData);
  let responseText = extracted.text.trim();
  if (responseText.length === 0) {
    const parts = Array.isArray(promptData?.parts) ? promptData.parts : [];
    const reasoning = parts
      .filter((p: any) => p?.type === "reasoning" && typeof p.text === "string")
      .map((p: any) => p.text)
      .join("\n");
    responseText = reasoning.trim();
  }
  if (responseText.length === 0) {
    const streamed = extractStreamChunks(promptData).trim();
    if (streamed.length > 0) responseText = streamed;
  }
  if (responseText.length === 0) {
    const messageId = promptData?.info?.id ?? promptData?.message?.info?.id;
    if (messageId) {
      for (let attempt = 0; attempt < 3 && responseText.length === 0; attempt += 1) {
        const messageRes = await client.session.message({
          path: { id: sessionId, messageID: messageId },
          query: { directory },
        });
        const messageData = (messageRes as any)?.data ?? messageRes;
        const extractedMessage = extractTextFromPromptResponse(messageData);
        responseText = extractedMessage.text.trim();
        if (responseText.length === 0) {
          const streamed = extractStreamChunks(messageData).trim();
          if (streamed.length > 0) responseText = streamed;
        }
        if (responseText.length > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
      }
    }
  }
  if (responseText.length === 0) {
    const pollDeadline = Date.now() + Math.min(10_000, timeoutMs);
    while (responseText.length === 0 && Date.now() < pollDeadline) {
      const messagesRes = await client.session.messages({
        path: { id: sessionId },
        query: { directory, limit: 10 },
      });
      const messages = Array.isArray((messagesRes as any)?.data)
        ? (messagesRes as any).data
        : Array.isArray(messagesRes)
          ? messagesRes
          : [];
      const assistant = [...messages].reverse().find((m: any) => m?.info?.role === "assistant");
      if (assistant) {
        const extractedMessage = extractTextFromPromptResponse(assistant);
        responseText = extractedMessage.text.trim();
        if (responseText.length === 0) {
          const streamed = extractStreamChunks(assistant).trim();
          if (streamed.length > 0) responseText = streamed;
        }
      }
      if (responseText.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  if (responseText.length === 0) {
    if (process.env.OPENCODE_ORCH_SPAWNER_DEBUG === "1") {
      try {
        const messagesRes = await client.session.messages({
          path: { id: sessionId },
          query: { directory, limit: 20 },
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
        logger.warn(`${debugLabel ?? "[worker]"} empty response summary`, JSON.stringify(summary, null, 2));
      } catch (error) {
        logger.warn(`${debugLabel ?? "[worker]"} empty response debug failed`, error);
      }
    }
    throw new Error(
      `Worker returned no text output (${extracted.debug ?? "unknown"}). ` +
        `This usually means the worker model/provider is misconfigured or unavailable.`
    );
  }

  return responseText;
}
