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

type TextPart = { type: "text" | "reasoning"; text?: string };

const isTextPart = (part: Part): part is TextPart => part.type === "text" || part.type === "reasoning";

/** Build a short preview of the last message in a session. */
export const getMessagePreview = (
  messages: Message[],
  getMessageParts: (messageId: string) => Part[],
): string | null => {
  if (messages.length === 0) return null;
  const lastMsg = messages[messages.length - 1];
  const parts = getMessageParts(lastMsg.id);
  const textParts = parts.filter(isTextPart);
  const text = textParts
    .map((part) => part.text?.trim())
    .filter(Boolean)
    .join(" ");
  if (!text) return `[${lastMsg.role} message]`;
  return text.length > 80 ? `${text.slice(0, 80)}...` : text;
};
