/**
 * Vision Analyzer - Simplified image analysis
 *
 * Key simplifications:
 * - No internal queue (worker manager handles spawn deduplication)
 * - No internal deduplication (handled at plugin level via message ID)
 * - No internal logging (uses progress API for user feedback)
 * - Focused responsibility: just analyze, don't manage workers
 */

import { createVisionProgress } from "./progress";
import type { AnalyzeOptions, VisionResult } from "./types";
import { extractImages, isImagePart } from "./extract";

const DEFAULT_PROMPT =
  "Analyze this image and describe what you see. Focus on any text, code, UI elements, errors, or relevant details.";

export async function analyzeImages(parts: any[], options: AnalyzeOptions): Promise<VisionResult> {
  const startTime = Date.now();
  const timeout = options.timeout ?? 300_000;
  const prompt = options.prompt ?? DEFAULT_PROMPT;
  const model = options.model ?? "vision";

  const visionProgress = options.showToast
    ? createVisionProgress(options.showToast)
    : null;

  const progress = options.progress ?? visionProgress?.start();

  try {
    progress?.update("Extracting images...", 10);
    const imageCount = Array.isArray(parts) ? parts.filter(isImagePart).length : 0;
    visionProgress?.extracting(imageCount);

    const attachments = await extractImages(parts);

    if (attachments.length === 0) {
      const error = "No valid images found";
      progress?.fail(error);
      visionProgress?.fail(error);
      return { success: false, error };
    }

    progress?.update(`Analyzing ${attachments.length} image(s)...`, 50);
    visionProgress?.analyzing(attachments.length, model);

    const result = await options.sendToVisionWorker(prompt, attachments, timeout);

    const durationMs = Date.now() - startTime;

    if (result.success && result.response) {
      progress?.complete(`${(durationMs / 1000).toFixed(1)}s`);
      visionProgress?.complete(durationMs, model);

      return {
        success: true,
        analysis: result.response,
        model,
        durationMs,
      };
    }

    const error = result.error ?? "No response from vision worker";
    progress?.fail(error);
    visionProgress?.fail(error);

    return { success: false, error, durationMs };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    progress?.fail(error);
    visionProgress?.fail(error);

    return {
      success: false,
      error,
      durationMs: Date.now() - startTime,
    };
  }
}

export { hasImages, extractImages } from "./extract";
export { formatVisionAnalysis, replaceImagesWithAnalysis } from "./format";
export { createVisionProgress } from "./progress";
export type { VisionResult, ImageAttachment, AnalyzeOptions } from "./types";
export type { ProgressHandle, ToastFn } from "./progress";
