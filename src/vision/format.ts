import type { VisionResult } from "./types";
import { isImagePart } from "./extract";

export function formatVisionAnalysis(result: VisionResult): string | undefined {
  if (result.success && result.analysis) {
    const trimmed = result.analysis.trim();
    if (!trimmed) return undefined;
    const durationInfo = result.durationMs ? ` (${(result.durationMs / 1000).toFixed(1)}s)` : "";
    const modelInfo = result.model ? ` via ${result.model}` : "";
    return [
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `🖼️ **Vision Analysis**${modelInfo}${durationInfo}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      trimmed,
      ``,
    ].join("\n");
  }
  if (result.error) {
    return [
      ``,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `⚠️ **Vision Analysis Failed**`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      result.error.trim(),
      ``,
    ].join("\n");
  }
  return undefined;
}

export function replaceImagesWithAnalysis(
  parts: any[],
  analysisText: string,
  meta?: { sessionID?: string; messageID?: string }
): any[] {
  if (!Array.isArray(parts)) return parts;

  const withoutImages = parts.filter((p) => !isImagePart(p));
  if (withoutImages.length === parts.length) return parts;

  for (let i = withoutImages.length - 1; i >= 0; i--) {
    const p = withoutImages[i];
    if (p?.type === "text" && typeof p.text === "string") {
      p.text += `\n\n${analysisText}\n`;
      return withoutImages;
    }
  }

  withoutImages.push({
    type: "text",
    text: analysisText,
    id: `${meta?.messageID ?? "msg"}-vision-analysis`,
    sessionID: meta?.sessionID ?? "",
    messageID: meta?.messageID ?? "",
    synthetic: true,
  });

  return withoutImages;
}
