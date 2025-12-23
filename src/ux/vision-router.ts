/**
 * Vision Auto-Router - Backwards compatibility wrapper
 *
 * This module is deprecated. New code should import from "../vision/analyzer".
 *
 * The implementation has been simplified and moved to src/vision/analyzer.ts.
 * This file provides the same API for backwards compatibility.
 */

import { registry } from "../core/registry";
import { builtInProfiles } from "../config/profiles";
import { spawnWorker, sendToWorker } from "../workers/spawner";
import { createVisionProgress, type ToastFn } from "../core/progress";
import {
  analyzeImages as _analyzeImages,
  type VisionResult,
} from "../vision/analyzer";

// =============================================================================
// Re-exports for backwards compatibility
// =============================================================================

export { hasImages } from "../vision/analyzer";
export { formatVisionAnalysis } from "../vision/analyzer";
export { replaceImagesWithAnalysis } from "../vision/analyzer";

// =============================================================================
// Types (backwards compatible)
// =============================================================================

type VisionAnalysisResult = VisionResult & {
  workerAge?: number;
};

// =============================================================================
// Legacy API - analyzeImages with spawner integration
// =============================================================================

export interface AnalyzeImagesOptions {
  spawnIfNeeded?: boolean;
  directory?: string;
  client?: any;
  timeout?: number;
  basePort?: number;
  requestKey?: string;
  profiles?: Record<string, any>;
  showToast?: ToastFn;
  prompt?: string;
}

/**
 * Analyze images in message parts using the vision worker.
 * This is the backwards-compatible wrapper that handles worker spawning.
 */
export async function analyzeImages(
  parts: any[],
  options: AnalyzeImagesOptions = {}
): Promise<VisionAnalysisResult> {
  const timeout = options.timeout ?? 300_000;

  // Create progress helper
  const visionProgress = options.showToast
    ? createVisionProgress(options.showToast)
    : undefined;
  visionProgress?.start();

  // Early check: if parts have no images, fail fast
  const { hasImages: checkHasImages, extractImages } = await import("../vision/analyzer");
  if (!checkHasImages(parts)) {
    const error = "No valid image attachments found (no image parts detected)";
    visionProgress?.fail(error);
    return { success: false, error };
  }

  // Extract images early to validate we have valid attachments
  const attachments = await extractImages(parts);
  if (attachments.length === 0) {
    const error = "No valid image attachments found";
    visionProgress?.fail(error);
    return { success: false, error };
  }

  // Find or spawn vision worker
  let visionWorker = registry.getVisionWorkers().find((w) => w.status === "ready")
    ?? registry.getVisionWorkers()[0];

  const visionProfile = options.profiles?.vision ?? builtInProfiles.vision;

  if (!visionWorker && options.spawnIfNeeded && visionProfile && options.client) {
    visionProgress?.spawning(visionProfile.model);

    try {
      visionWorker = await spawnWorker(visionProfile, {
        directory: options.directory ?? process.cwd(),
        client: options.client,
        basePort: options.basePort ?? 14096,
        timeout: 30000,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      visionProgress?.fail(error);
      return { success: false, error: `Failed to spawn vision worker: ${error}` };
    }
  }

  if (!visionWorker) {
    const error = "No vision worker available";
    visionProgress?.fail(error);
    return { success: false, error };
  }

  // Wait for worker to be ready
  if (visionWorker.status !== "ready") {
    visionProgress?.waiting(visionWorker.profile.model);

    const waitMs = Math.min(timeout, 5 * 60_000);
    const ready = await waitForWorkerReady(visionWorker.profile.id, waitMs);
    if (!ready) {
      const error = `Vision worker did not become ready within ${waitMs}ms`;
      visionProgress?.fail(error);
      return { success: false, error };
    }
  }

  // Use the new analyzer with a custom sendToVisionWorker function
  const result = await _analyzeImages(parts, {
    sendToVisionWorker: async (message, attachments, timeoutMs) => {
      return sendToWorker(visionWorker!.profile.id, message, {
        attachments: attachments as any,
        timeout: timeoutMs,
      });
    },
    model: visionWorker.profile.model,
    showToast: options.showToast,
    timeout,
    prompt: options.prompt,
  });

  // Add worker age for compatibility
  const workerAge = visionWorker.startedAt
    ? Date.now() - visionWorker.startedAt.getTime()
    : undefined;

  return {
    ...result,
    workerAge,
  };
}

// =============================================================================
// Helpers
// =============================================================================

async function waitForWorkerReady(workerId: string, timeoutMs: number): Promise<boolean> {
  const existing = registry.getWorker(workerId);
  if (existing?.status === "ready") return true;

  return new Promise<boolean>((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      registry.off("updated", onUpdate);
      resolve(ok);
    };

    const onUpdate = (instance: any) => {
      if (instance?.profile?.id !== workerId) return;
      if (instance?.status === "ready") finish(true);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);
    registry.on("updated", onUpdate);
  });
}

// =============================================================================
// Diagnostics (backwards compatible)
// =============================================================================

export function getVisionDiagnostics(): Record<string, unknown> {
  const visionWorkers = registry.getVisionWorkers();

  return {
    queueDepth: 0, // No longer used
    inFlightRequests: 0, // No longer tracked here
    visionWorkers: visionWorkers.map((w) => ({
      id: w.profile.id,
      model: w.profile.model,
      status: w.status,
      port: w.port,
      pid: w.pid,
      sessionId: w.sessionId,
      ageMs: Date.now() - w.startedAt.getTime(),
    })),
  };
}
