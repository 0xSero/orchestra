type TextPart = { type?: string; text?: string };

/** Extract text-only output from a parts array. */
export const extractText = (parts: TextPart[] | undefined): string => {
  if (!parts || parts.length === 0) return "";
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n");
};
