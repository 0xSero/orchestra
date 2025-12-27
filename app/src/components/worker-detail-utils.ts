import type { Message, Part } from "@/context/opencode";

type TextPart = { type: "text" | "reasoning"; text?: string };
type FilePart = Part & { type: "file"; url: string; mime: string; filename?: string };

const isTextPart = (part: Part): part is TextPart => part.type === "text" || part.type === "reasoning";
const isFilePart = (part: Part): part is FilePart => part.type === "file";

/** Extract the combined text content from message parts. */
export const getMessageText = (parts: Part[]): string => {
  const textParts = parts.filter(isTextPart);
  return textParts
    .map((part) => part.text?.trim())
    .filter(Boolean)
    .join("\n");
};

/** Filter message parts down to file attachments. */
export const getFileParts = (parts: Part[]): FilePart[] => parts.filter(isFilePart);

/** Check if vision analysis has been performed (image replaced with text description). */
const hasVisionAnalysis = (text: string): boolean => text.includes("<pasted_image>");

/** Build text + attachment payloads for a message. */
export const getMessageDisplay = (message: Message, getMessageParts: (messageId: string) => Part[]) => {
  const parts = getMessageParts(message.id);
  const text = getMessageText(parts);
  const allFiles = getFileParts(parts);

  // Hide images if vision analysis was performed (they've been converted to text)
  const files = hasVisionAnalysis(text)
    ? allFiles.filter((f) => !f.mime?.startsWith("image/"))
    : allFiles;

  return { text, files };
};
