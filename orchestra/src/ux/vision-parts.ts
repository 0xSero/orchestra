import type { VisionPart } from "./vision-types";

const isImagePart = (part: VisionPart): boolean => {
  if (!part) return false;
  if (part.type === "image") return true;
  const mime = typeof part.mime === "string" ? part.mime : typeof part.mimeType === "string" ? part.mimeType : "";
  if (part.type === "file" && mime.startsWith("image/")) return true;
  if (part.type === "file" && typeof part.url === "string" && part.url.startsWith("data:image/")) return true;
  if (typeof part.url === "string" && (part.url === "clipboard" || part.url.startsWith("clipboard:"))) return true;
  return false;
};

/** Check whether any parts represent image data. */
export const hasVisionParts = (parts: VisionPart[]): boolean => {
  if (!Array.isArray(parts)) return false;
  return parts.some((part) => isImagePart(part));
};

/**
 * Wrap vision results in a formatted block with explicit instructions.
 * The instructions tell the model this is a TEXT DESCRIPTION of an image,
 * not the image itself, so it should use this description directly.
 */
export const formatVisionAnalysis = (input: { response?: string; error?: string }): string => {
  const instruction =
    "[This is a TEXT DESCRIPTION of an image the user pasted. The image has already been analyzed. " +
    "Use this description to answer the user's question. Do NOT say you cannot see images.]";

  if (input.response) {
    const trimmed = input.response.trim();
    if (trimmed) return `<pasted_image>\n${instruction}\n\n${trimmed}\n</pasted_image>`;
  }
  if (input.error) {
    const trimmed = input.error.trim();
    if (trimmed) return `<pasted_image>\n${instruction}\n\n[Image could not be analyzed: ${trimmed}]\n</pasted_image>`;
  }
  return `<pasted_image>\n${instruction}\n\n[Image could not be analyzed]\n</pasted_image>`;
};

/** Replace image parts with a text summary of the vision analysis. */
export const replaceImagesWithText = (
  parts: VisionPart[],
  text: string,
  meta?: { sessionID?: string; messageID?: string },
): VisionPart[] => {
  if (!Array.isArray(parts)) return parts;
  const withoutImages = parts.filter((part) => !isImagePart(part));
  if (withoutImages.length === parts.length) return parts;

  // Find first text part and prepend image description to it
  for (let i = 0; i < withoutImages.length; i += 1) {
    const part = withoutImages[i];
    if (part?.type !== "text" || typeof part.text !== "string") continue;
    part.text = `${text}\n\n${part.text}`;
    return withoutImages;
  }

  // No text part found - create one with just the image description
  withoutImages.unshift({
    type: "text",
    text,
    id: `${meta?.messageID ?? "msg"}-vision-placeholder`,
    sessionID: meta?.sessionID ?? "",
    messageID: meta?.messageID ?? "",
    synthetic: true,
  });

  return withoutImages;
};

/** Predicate for image-like parts (images, files, or clipboard references). */
export { isImagePart };
