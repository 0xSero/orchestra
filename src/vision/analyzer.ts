/**
 * Vision Analyzer - Simplified image analysis
 *
 * Replaces the complex vision-router.ts (680 lines) with a focused ~200 line module.
 *
 * Key simplifications:
 * - No internal queue (worker-pool handles spawn deduplication)
 * - No internal deduplication (handled at plugin level via message ID)
 * - No internal logging (uses progress API for user feedback)
 * - Focused responsibility: just analyze, don't manage workers
 */

import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "../core/logger";
import type { ProgressHandle } from "../core/progress";
import { createVisionProgress, type ToastFn } from "../core/progress";

const execFileAsync = promisify(execFile);

// =============================================================================
// Types
// =============================================================================

export interface VisionResult {
  success: boolean;
  analysis?: string;
  error?: string;
  model?: string;
  durationMs?: number;
}

export interface ImageAttachment {
  type: "image";
  base64?: string;
  mimeType?: string;
}

export interface AnalyzeOptions {
  /** Function to send message to vision worker */
  sendToVisionWorker: (
    message: string,
    attachments: ImageAttachment[],
    timeout: number
  ) => Promise<{ success: boolean; response?: string; error?: string }>;
  /** Vision model name (for progress display) */
  model?: string;
  /** Progress handle for user feedback */
  progress?: ProgressHandle;
  /** Toast function for notifications */
  showToast?: ToastFn;
  /** Analysis timeout in ms */
  timeout?: number;
  /** Custom prompt for analysis */
  prompt?: string;
}

// =============================================================================
// Image Detection
// =============================================================================

function isImagePart(part: any): boolean {
  if (!part || typeof part !== "object") return false;
  if (part.type === "image") return true;
  if (part.type === "file" && typeof part.mime === "string" && part.mime.startsWith("image/")) return true;
  if (part.type === "file" && typeof part.url === "string" && part.url.startsWith("data:image/")) return true;
  if (typeof part.url === "string" && (part.url === "clipboard" || part.url.startsWith("clipboard:"))) return true;
  return false;
}

/**
 * Check if message parts contain images
 */
export function hasImages(parts: any[]): boolean {
  if (!Array.isArray(parts)) return false;
  return parts.some((p) => isImagePart(p));
}

// =============================================================================
// Image Extraction (parallel for performance)
// =============================================================================

/**
 * Extract images from message parts as base64 attachments
 */
export async function extractImages(parts: any[]): Promise<ImageAttachment[]> {
  if (!Array.isArray(parts)) return [];

  const imageParts = parts.filter(isImagePart);
  if (imageParts.length === 0) return [];

  // Extract all images in parallel
  const results = await Promise.all(imageParts.map(extractSingleImage));
  return results.filter((r): r is ImageAttachment => r !== null);
}

async function extractSingleImage(part: any): Promise<ImageAttachment | null> {
  try {
    const partUrl = typeof part.url === "string" ? part.url : undefined;

    // File URL (file://...)
    if (partUrl?.startsWith("file://")) {
      const path = fileURLToPath(partUrl);
      const buf = await readFile(path);
      return { type: "image", mimeType: part.mime ?? inferMimeType(path), base64: buf.toString("base64") };
    }

    // Direct filesystem path
    if (partUrl && (partUrl.startsWith("/") || /^[A-Za-z]:[\\/]/.test(partUrl))) {
      const buf = await readFile(partUrl);
      return { type: "image", mimeType: part.mime ?? inferMimeType(partUrl), base64: buf.toString("base64") };
    }

    // Data URL
    if (partUrl?.startsWith("data:")) {
      const match = partUrl.match(/^data:(image\/[^;]+);base64,(.*)$/);
      if (match) {
        return { type: "image", mimeType: match[1], base64: match[2] };
      }
    }

    // Clipboard
    if (partUrl === "clipboard" || partUrl?.startsWith("clipboard:")) {
      const clip = await readClipboardImage();
      if (clip) {
        return { type: "image", mimeType: clip.mimeType, base64: clip.base64 };
      }
    }

    // Direct base64
    if (part.base64 && typeof part.base64 === "string") {
      return { type: "image", mimeType: part.mime ?? "image/png", base64: part.base64 };
    }

    return null;
  } catch (err) {
    logger.warn(`[VISION] Failed to extract image: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function inferMimeType(path: string): string {
  const ext = path.toLowerCase().split(".").pop();
  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
  };
  return mimeMap[ext ?? ""] ?? "image/png";
}

async function readClipboardImage(): Promise<{ mimeType: string; base64: string } | null> {
  // macOS
  if (process.platform === "darwin") {
    try {
      const outPath = join(tmpdir(), `opencode-clipboard-${process.pid}.png`);
      const script = [
        `set outPath to "${outPath.replace(/"/g, '\\"')}"`,
        `set outFile to POSIX file outPath`,
        `set f to open for access outFile with write permission`,
        `set eof f to 0`,
        `write (the clipboard as «class PNGf») to f`,
        `close access f`,
        `return outPath`,
      ].join("\n");

      await execFileAsync("osascript", ["-e", script], { timeout: 2000 });
      try {
        const buf = await readFile(outPath);
        if (buf.length === 0) return null;
        return { mimeType: "image/png", base64: buf.toString("base64") };
      } finally {
        await unlink(outPath).catch(() => {});
      }
    } catch {
      return null;
    }
  }

  // Linux (Wayland)
  if (process.platform === "linux") {
    try {
      const { stdout } = await execFileAsync("wl-paste", ["--no-newline", "--type", "image/png"], {
        encoding: "buffer" as any,
        timeout: 2000,
        maxBuffer: 20 * 1024 * 1024,
      });
      const buf = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout as any);
      if (buf.length > 0) {
        return { mimeType: "image/png", base64: buf.toString("base64") };
      }
    } catch {
      // Try X11 fallback
      try {
        const { stdout } = await execFileAsync("xclip", ["-selection", "clipboard", "-t", "image/png", "-o"], {
          encoding: "buffer" as any,
          timeout: 2000,
          maxBuffer: 20 * 1024 * 1024,
        });
        const buf = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout as any);
        if (buf.length > 0) {
          return { mimeType: "image/png", base64: buf.toString("base64") };
        }
      } catch {
        // ignore
      }
    }
  }

  return null;
}

// =============================================================================
// Analysis
// =============================================================================

const DEFAULT_PROMPT = `Analyze this image and describe what you see. Focus on any text, code, UI elements, errors, or relevant details.`;

/**
 * Analyze images using vision worker
 */
export async function analyzeImages(
  parts: any[],
  options: AnalyzeOptions
): Promise<VisionResult> {
  const startTime = Date.now();
  const timeout = options.timeout ?? 300_000;
  const prompt = options.prompt ?? DEFAULT_PROMPT;
  const model = options.model ?? "vision";

  // Create progress helper if toast provided
  const visionProgress = options.showToast
    ? createVisionProgress(options.showToast)
    : null;

  // Use provided progress or create new one
  const progress = options.progress ?? visionProgress?.start();

  try {
    // Step 1: Extract images
    progress?.update("Extracting images...", 10);
    visionProgress?.extracting(parts.filter(isImagePart).length);

    const attachments = await extractImages(parts);

    if (attachments.length === 0) {
      const error = "No valid images found";
      progress?.fail(error);
      return { success: false, error };
    }

    logger.debug(`[VISION] Extracted ${attachments.length} image(s)`);

    // Step 2: Send to worker
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

// =============================================================================
// Result Formatting
// =============================================================================

/**
 * Format vision analysis result for injection into message
 */
export function formatVisionAnalysis(result: VisionResult): string | undefined {
  if (result.success && result.analysis) {
    const trimmed = result.analysis.trim();
    if (!trimmed) return undefined;
    return `[VISION ANALYSIS]\n${trimmed}`;
  }
  if (result.error) {
    return `[VISION ANALYSIS FAILED]\n${result.error.trim()}`;
  }
  return undefined;
}

/**
 * Replace image parts with analysis text
 */
export function replaceImagesWithAnalysis(
  parts: any[],
  analysisText: string,
  meta?: { sessionID?: string; messageID?: string }
): any[] {
  if (!Array.isArray(parts)) return parts;

  const withoutImages = parts.filter((p) => !isImagePart(p));
  if (withoutImages.length === parts.length) return parts; // No images to replace

  // Try to append to last text part
  for (let i = withoutImages.length - 1; i >= 0; i--) {
    const p = withoutImages[i];
    if (p?.type === "text" && typeof p.text === "string") {
      p.text += `\n\n${analysisText}\n`;
      return withoutImages;
    }
  }

  // Create new text part
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

// =============================================================================
// Re-export for backwards compatibility
// =============================================================================

export { createVisionProgress } from "../core/progress";
