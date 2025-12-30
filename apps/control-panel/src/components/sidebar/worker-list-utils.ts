import type { Message, Part, Session, WorkerRuntime } from "@/context/opencode";

/** Resolve the model label to show for a session row. */
export const getSessionModel = (session: Session, worker?: WorkerRuntime): string => {
  const sessionDetails = session as unknown as {
    model?: string;
    agent?: { model?: string };
    metadata?: { model?: string };
  };
  const sessionModel = sessionDetails.model ?? sessionDetails.agent?.model ?? sessionDetails.metadata?.model;
  return worker?.model || sessionModel || "default";
};

const getPartText = (part: Part): string | undefined => {
  if (part.type !== "text" && part.type !== "reasoning") return undefined;
  const text = (part as { text?: string }).text;
  return typeof text === "string" ? text : undefined;
};

/** Build a short preview of the last message in a session. */
export const getMessagePreview = (
  messages: Message[],
  getMessageParts: (messageId: string) => Part[],
): string | null => {
  if (messages.length === 0) return null;
  const lastMsg = messages[messages.length - 1];
  const parts = getMessageParts(lastMsg.id);
  const text = parts
    .map((part) => getPartText(part)?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" ");
  if (!text) return `[${lastMsg.role} message]`;
  return text.length > 80 ? `${text.slice(0, 80)}...` : text;
};
