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

/** Check if vision analysis is currently in progress (placeholder present). */
const isVisionAnalyzing = (text: string): boolean =>
  text.includes("[VISION ANALYSIS IN PROGRESS]") || text.includes('job="');

/** Extract the job ID from vision placeholder if present. */
const extractVisionJobId = (text: string): string | undefined => {
  const match = text.match(/job="([^"]+)"/);
  return match?.[1];
};

export type MessageDisplay = {
  text: string;
  files: FilePart[];
  /** True if vision analysis is currently in progress for this message */
  visionAnalyzing: boolean;
  /** The job ID for pending vision analysis */
  visionJobId?: string;
};

/** Build text + attachment payloads for a message. */
export const getMessageDisplay = (message: Message, getMessageParts: (messageId: string) => Part[]): MessageDisplay => {
  const parts = getMessageParts(message.id);
  const text = getMessageText(parts);
  const allFiles = getFileParts(parts);

  // Hide images if vision analysis was performed or is in progress
  const hasVision = hasVisionAnalysis(text);
  const visionAnalyzing = isVisionAnalyzing(text);
  const files = hasVision || visionAnalyzing ? allFiles.filter((f) => !f.mime?.startsWith("image/")) : allFiles;

  return {
    text,
    files,
    visionAnalyzing,
    visionJobId: visionAnalyzing ? extractVisionJobId(text) : undefined,
  };
};
