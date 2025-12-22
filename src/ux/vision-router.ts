/**
 * Vision Auto-Router - Simple implementation
 * 
 * Detects images in user messages and routes them to vision worker ONCE.
 */

import { registry } from "../core/registry";
import { builtInProfiles } from "../config/profiles";
import { spawnWorker, sendToWorker } from "../workers/spawner";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// Global lock - only ONE vision request at a time across ALL sessions
let visionLock: Promise<void> | null = null;
// Synchronous flag to prevent race conditions
let visionLockSync = false;

/**
 * Check if message parts contain images
 */
export function hasImages(parts: any[]): boolean {
  if (!Array.isArray(parts)) return false;
  return parts.some((p) => {
    if (!p || typeof p !== "object") return false;
    if (p.type === "image") return true;
    if (p.type === "file" && typeof p.mime === "string" && p.mime.startsWith("image/")) return true;
    if (p.type === "file" && typeof p.url === "string" && p.url.startsWith("data:image/")) return true;
    if (typeof p.url === "string" && (p.url === "clipboard" || p.url.startsWith("clipboard:"))) return true;
    return false;
  });
}

/**
 * Extract image attachments from parts
 */
async function extractAttachments(parts: any[]): Promise<Array<{ type: "image"; base64?: string; mimeType?: string }>> {
  const attachments: Array<{ type: "image"; base64?: string; mimeType?: string }> = [];
  
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    
    const isImage = 
      part.type === "image" ||
      (part.type === "file" && typeof part.mime === "string" && part.mime.startsWith("image/")) ||
      (part.type === "file" && typeof part.url === "string" && part.url.startsWith("data:image/")) ||
      (typeof part.url === "string" && (part.url === "clipboard" || part.url.startsWith("clipboard:")));
    
    if (!isImage) continue;

    // Handle file URLs or plain filesystem paths.
    const partUrl = typeof part.url === "string" ? part.url : undefined;
    if (partUrl) {
      if (partUrl.startsWith("file://")) {
        try {
          const path = fileURLToPath(partUrl);
          const buf = await readFile(path);
          attachments.push({ type: "image", mimeType: part.mime ?? "image/png", base64: buf.toString("base64") });
          continue;
        } catch {
          // fall through
        }
      }

      // Some clients may provide a direct path instead of a file:// URL.
      if (partUrl.startsWith("/") || /^[A-Za-z]:[\\/]/.test(partUrl)) {
        try {
          const buf = await readFile(partUrl);
          attachments.push({ type: "image", mimeType: part.mime ?? "image/png", base64: buf.toString("base64") });
          continue;
        } catch {
          // fall through
        }
      }
    }
    
    // Handle data URL
    if (part.url && typeof part.url === "string" && part.url.startsWith("data:")) {
      const match = part.url.match(/^data:(image\/[^;]+);base64,(.*)$/);
      if (match) {
        attachments.push({ type: "image", mimeType: match[1], base64: match[2] });
        continue;
      }
    }

    // Handle "clipboard" placeholder URLs by reading the system clipboard.
    // Best-effort: only implemented where the OS provides a stable way to export clipboard images.
    if (partUrl === "clipboard" || (typeof partUrl === "string" && partUrl.startsWith("clipboard:"))) {
      const clip = await readClipboardImageAsBase64().catch(() => undefined);
      if (clip?.base64) {
        attachments.push({ type: "image", mimeType: clip.mimeType, base64: clip.base64 });
        continue;
      }
    }
    
    // Handle direct base64
    if (part.base64 && typeof part.base64 === "string") {
      attachments.push({ type: "image", mimeType: part.mime ?? "image/png", base64: part.base64 });
    }
  }
  
  return attachments;
}

async function readClipboardImageAsBase64(): Promise<{ mimeType: string; base64: string } | undefined> {
  const execFileAsync = promisify(execFile);

  if (process.platform === "darwin") {
    const outPath = join(tmpdir(), `opencode-clipboard-${process.pid}.png`);
    // AppleScript writes the clipboard PNG bytes to disk; if no image is present, it throws.
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
      if (buf.length === 0) return undefined;
      return { mimeType: "image/png", base64: buf.toString("base64") };
    } finally {
      await unlink(outPath).catch(() => {});
    }
  }

  // Best-effort for Linux clipboard tools (Wayland/X11). If unavailable, just return undefined.
  if (process.platform === "linux") {
    // Prefer wl-paste (Wayland)
    try {
      const { stdout } = await execFileAsync("wl-paste", ["--no-newline", "--type", "image/png"], {
        encoding: "buffer" as any,
        timeout: 2000,
        maxBuffer: 20 * 1024 * 1024,
      });
      const buf = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout as any);
      if (buf.length > 0) return { mimeType: "image/png", base64: buf.toString("base64") };
    } catch {
      // ignore
    }

    // Fallback to xclip (X11)
    try {
      const { stdout } = await execFileAsync("xclip", ["-selection", "clipboard", "-t", "image/png", "-o"], {
        encoding: "buffer" as any,
        timeout: 2000,
        maxBuffer: 20 * 1024 * 1024,
      });
      const buf = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout as any);
      if (buf.length > 0) return { mimeType: "image/png", base64: buf.toString("base64") };
    } catch {
      // ignore
    }
  }

  return undefined;
}

/**
 * Route images to vision worker and return analysis
 */
export async function analyzeImages(
  parts: any[],
  options: {
    spawnIfNeeded?: boolean;
    directory?: string;
    client?: any;
    timeout?: number;
    basePort?: number;
    /** Pass the merged profiles from orchestrator config to use the correct vision model */
    profiles?: Record<string, any>;
    /** Show toast notifications for debugging */
    showToast?: (message: string, variant: "success" | "info" | "warning" | "error") => void;
  } = {}
): Promise<{ success: boolean; analysis?: string; error?: string }> {
  const toast = options.showToast ?? (() => {});
  
  // Check lock - if already processing, skip
  // Use synchronous flag to prevent race conditions between concurrent calls
  if (visionLock || visionLockSync) {
    return { success: false, error: "Vision worker is already processing an image" };
  }
  // Set sync flag immediately to block concurrent calls
  visionLockSync = true;
  
  // Debug: log what parts we received
  const partsDebug = parts.map((p: any) => ({
    type: p?.type,
    mime: p?.mime,
    hasUrl: !!p?.url,
    urlPrefix: typeof p?.url === "string" ? p.url.slice(0, 30) : undefined,
    hasBase64: !!p?.base64,
  }));
  toast(`Vision: analyzing ${parts.length} parts: ${JSON.stringify(partsDebug).slice(0, 100)}`, "info");
  
  const attachments = await extractAttachments(parts);
  if (attachments.length === 0) {
    visionLockSync = false;
    toast(`Vision: no valid attachments extracted from ${parts.length} parts`, "warning");
    return { success: false, error: `No valid image attachments found (received ${parts.length} parts: ${JSON.stringify(partsDebug)})` };
  }
  
  toast(`Vision: extracted ${attachments.length} image(s), sending to worker`, "info");
  
  // Find or spawn vision worker
  let visionWorker = Array.from(registry.workers.values()).find(
    (w) => w.profile.supportsVision && w.status === "ready"
  );
  
  if (visionWorker) {
    toast(`Vision: found existing worker "${visionWorker.profile.id}" (${visionWorker.profile.model})`, "info");
  }
  
  if (!visionWorker && options.spawnIfNeeded) {
    // Use profile from config (has user's model choice) or fall back to built-in
    const visionProfile = options.profiles?.vision ?? builtInProfiles.vision;
    toast(`Vision: spawning worker with model "${visionProfile?.model ?? 'unknown'}"`, "info");
    if (visionProfile && options.client) {
      try {
        visionWorker = await spawnWorker(visionProfile, {
          directory: options.directory ?? process.cwd(),
          client: options.client,
          basePort: options.basePort ?? 14096,
          timeout: 30000,
        });
        toast(`Vision: worker spawned on port ${visionWorker.port}`, "success");
      } catch (err) {
        visionLockSync = false;
        const msg = err instanceof Error ? err.message : String(err);
        toast(`Vision: spawn failed - ${msg}`, "error");
        return { success: false, error: `Failed to spawn vision worker: ${msg}` };
      }
    } else {
      toast(`Vision: cannot spawn - missing ${!visionProfile ? 'profile' : 'client'}`, "warning");
    }
  }
  
  if (!visionWorker) {
    visionLockSync = false;
    return { success: false, error: "No vision worker available" };
  }
  
  // Set lock
  let releaseLock: () => void;
  visionLock = new Promise((resolve) => { releaseLock = resolve; });
  
  try {
    const prompt = `Analyze this image and describe what you see. Focus on any text, code, UI elements, errors, or relevant details.`;
    
    toast(`Vision: sending ${attachments.length} image(s) to worker...`, "info");
    const result = await sendToWorker(visionWorker.profile.id, prompt, {
      attachments: attachments as any,
      timeout: options.timeout ?? 60000,
    });
    
    if (result.success && result.response) {
      toast(`Vision: analysis complete (${result.response.length} chars)`, "success");
      return { success: true, analysis: result.response };
    } else {
      toast(`Vision: worker error - ${result.error}`, "error");
      return { success: false, error: result.error ?? "No response from vision worker" };
    }
  } finally {
    // Release lock
    visionLock = null;
    visionLockSync = false;
    releaseLock!();
  }
}
