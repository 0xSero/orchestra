import { execFile } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { CommunicationService } from "../communication";
import type { WorkerAttachment } from "../workers/prompt";
import { normalizeBase64Image } from "../workers/prompt";

const execFileAsync = promisify(execFile);

export type VisionRoutingState = {
  processedMessageIds: Set<string>;
};

export type VisionRoutingDeps = {
  workers: {
    getWorker: (id: string) => any | undefined;
    spawnById: (id: string) => Promise<any>;
    send: (
      workerId: string,
      message: string,
      options?: { attachments?: WorkerAttachment[]; timeout?: number; jobId?: string; from?: string },
    ) => Promise<{ success: boolean; response?: string; error?: string }>;
    jobs: {
      create: (input: { workerId: string; message: string; sessionId?: string; requestedBy?: string }) => {
        id: string;
        startedAt: number;
      };
      setResult: (id: string, result: { responseText?: string; error?: string }) => void;
    };
  };
  ensureWorker?: (input: { workerId: string; reason: "manual" | "on-demand" }) => Promise<any>;
  profiles: Record<string, { id: string; name?: string; model?: string; supportsVision?: boolean }>;
  communication?: Pick<CommunicationService, "emit">;
  timeoutMs?: number;
  prompt?: string;
  logSink?: (entry: Record<string, unknown>) => Promise<void> | void;
};

export type VisionChatInput = {
  sessionID: string;
  agent?: string;
  messageID?: string;
  role?: string;
};

export type VisionChatOutput = {
  message?: { role?: string };
  parts: any[];
};

const DEFAULT_PROMPT =
  "Analyze this image and describe what you see. Focus on any text, code, UI elements, errors, or relevant details.";

function isImagePart(part: any): boolean {
  if (!part || typeof part !== "object") return false;
  if (part.type === "image") return true;
  const mime = typeof part.mime === "string" ? part.mime : typeof part.mimeType === "string" ? part.mimeType : "";
  if (part.type === "file" && mime.startsWith("image/")) return true;
  if (part.type === "file" && typeof part.url === "string" && part.url.startsWith("data:image/")) return true;
  if (typeof part.url === "string" && (part.url === "clipboard" || part.url.startsWith("clipboard:"))) return true;
  return false;
}

export function hasVisionParts(parts: any[]): boolean {
  if (!Array.isArray(parts)) return false;
  return parts.some((part) => isImagePart(part));
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

async function readClipboardImage(): Promise<{ mimeType: string; base64: string } | undefined> {
  if (process.platform === "darwin") {
    const outPath = join(tmpdir(), `opencode-clipboard-${process.pid}.png`);
    const script = [
      `set outPath to "${outPath.replace(/"/g, '\\"')}"`,
      `set outFile to POSIX file outPath`,
      `set f to open for access outFile with write permission`,
      `set eof f to 0`,
      `write (the clipboard as \u00abclass PNGf\u00bb) to f`,
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

  if (process.platform === "linux") {
    try {
      const { stdout } = await execFileAsync("wl-paste", ["--no-newline", "--type", "image/png"], {
        encoding: "buffer" as any,
        timeout: 2000,
        maxBuffer: 20 * 1024 * 1024,
      });
      const buf = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout as any);
      if (buf.length > 0) return { mimeType: "image/png", base64: buf.toString("base64") };
    } catch {
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
  }

  return undefined;
}

async function extractSingleImage(part: any): Promise<WorkerAttachment | null> {
  try {
    const partUrl = typeof part.url === "string" ? part.url : undefined;
    const mimeType =
      typeof part.mime === "string" ? part.mime : typeof part.mimeType === "string" ? part.mimeType : undefined;

    if (partUrl?.startsWith("file://")) {
      const path = fileURLToPath(partUrl);
      const buf = await readFile(path);
      return { type: "image", mimeType: mimeType ?? inferMimeType(path), base64: buf.toString("base64") };
    }

    if (partUrl && (partUrl.startsWith("/") || /^[A-Za-z]:[\\/]/.test(partUrl))) {
      const buf = await readFile(partUrl);
      return { type: "image", mimeType: mimeType ?? inferMimeType(partUrl), base64: buf.toString("base64") };
    }

    if (partUrl?.startsWith("data:")) {
      const match = partUrl.match(/^data:(image\/[^;]+);base64,(.*)$/);
      if (match) {
        return { type: "image", mimeType: match[1], base64: match[2] };
      }
    }

    if (partUrl === "clipboard" || partUrl?.startsWith("clipboard:")) {
      const clip = await readClipboardImage();
      if (clip) {
        return { type: "image", mimeType: clip.mimeType, base64: clip.base64 };
      }
    }

    if (part.base64 && typeof part.base64 === "string") {
      return { type: "image", mimeType: mimeType ?? "image/png", base64: normalizeBase64Image(part.base64) };
    }
  } catch {
    return null;
  }

  return null;
}

export async function extractVisionAttachments(parts: any[]): Promise<WorkerAttachment[]> {
  if (!Array.isArray(parts)) return [];
  const imageParts = parts.filter((part) => isImagePart(part));
  if (imageParts.length === 0) return [];
  const results = await Promise.all(imageParts.map((part) => extractSingleImage(part)));
  return results.filter((result): result is WorkerAttachment => Boolean(result));
}

export function formatVisionAnalysis(input: { response?: string; error?: string }): string {
  if (input.response) {
    const trimmed = input.response.trim();
    if (trimmed) return `[VISION ANALYSIS]\n${trimmed}`;
  }
  if (input.error) {
    const trimmed = input.error.trim();
    if (trimmed) return `[VISION ANALYSIS FAILED]\n${trimmed}`;
  }
  return "[VISION ANALYSIS FAILED]\nVision analysis unavailable.";
}

export function replaceImagesWithText(
  parts: any[],
  text: string,
  meta?: { sessionID?: string; messageID?: string },
): any[] {
  if (!Array.isArray(parts)) return parts;
  const withoutImages = parts.filter((part) => !isImagePart(part));
  if (withoutImages.length === parts.length) return parts;

  for (let i = withoutImages.length - 1; i >= 0; i -= 1) {
    const part = withoutImages[i];
    if (part?.type === "text" && typeof part.text === "string") {
      part.text += `\n\n${text}\n`;
      return withoutImages;
    }
  }

  withoutImages.push({
    type: "text",
    text,
    id: `${meta?.messageID ?? "msg"}-vision-placeholder`,
    sessionID: meta?.sessionID ?? "",
    messageID: meta?.messageID ?? "",
    synthetic: true,
  });

  return withoutImages;
}

export function createVisionRoutingState(): VisionRoutingState {
  return { processedMessageIds: new Set() };
}

export async function routeVisionMessage(
  input: VisionChatInput,
  output: VisionChatOutput,
  deps: VisionRoutingDeps,
  state: VisionRoutingState,
): Promise<string | undefined> {
  const role =
    typeof output.message?.role === "string"
      ? output.message?.role
      : typeof input.role === "string"
        ? input.role
        : undefined;
  if (role && role !== "user") return undefined;

  const originalParts = Array.isArray(output.parts) ? output.parts : [];
  if (!hasVisionParts(originalParts)) return undefined;

  const messageId = typeof input.messageID === "string" ? input.messageID : undefined;
  if (messageId && state.processedMessageIds.has(messageId)) return undefined;

  const agentId = typeof input.agent === "string" ? input.agent : undefined;
  const agentProfile = agentId ? deps.profiles[agentId] : undefined;
  const agentSupportsVision = Boolean(agentProfile?.supportsVision) || agentId === "vision";
  if (agentSupportsVision) return undefined;

  const visionProfile = deps.profiles.vision;
  const visionModel = visionProfile?.model ?? "vision";

  if (messageId) state.processedMessageIds.add(messageId);

  const timeoutMs = deps.timeoutMs ?? 300_000;
  const prompt = deps.prompt ?? DEFAULT_PROMPT;
  const startedAt = Date.now();

  try {
    if (deps.ensureWorker) {
      await deps.ensureWorker({ workerId: "vision", reason: "on-demand" });
    } else if (!deps.workers.getWorker("vision")) {
      await deps.workers.spawnById("vision");
    }

    const attachments = await extractVisionAttachments(originalParts);
    if (attachments.length === 0) {
      const error = "No valid image attachments found";
      output.parts = replaceImagesWithText(originalParts, formatVisionAnalysis({ error }), {
        sessionID: input.sessionID,
        messageID: input.messageID,
      });
      try {
        await deps.logSink?.({
          status: "failed",
          error,
          sessionId: input.sessionID,
          messageId,
          workerId: "vision",
          model: visionModel,
          startedAt,
          finishedAt: Date.now(),
        });
      } catch {
        // ignore log sink failures
      }
      return undefined;
    }

    const res = await deps.workers.send("vision", prompt, {
      attachments,
      timeout: timeoutMs,
      from: agentId ?? "orchestrator",
    });

    const trimmedResponse = typeof res.response === "string" ? res.response.trim() : "";
    const analysisText = formatVisionAnalysis({ response: trimmedResponse, error: res.error });
    output.parts = replaceImagesWithText(originalParts, analysisText, {
      sessionID: input.sessionID,
      messageID: input.messageID,
    });

    const succeeded = res.success && trimmedResponse.length > 0;
    try {
      await deps.logSink?.({
        status: succeeded ? "succeeded" : "failed",
        analysis: succeeded ? analysisText : undefined,
        error: succeeded ? undefined : (res.error ?? "Vision analysis failed"),
        sessionId: input.sessionID,
        messageId,
        workerId: "vision",
        model: visionModel,
        attachments: attachments.length,
        requestedBy: agentId,
        startedAt,
        finishedAt: Date.now(),
        durationMs: Date.now() - startedAt,
      });
    } catch {
      // ignore log sink failures
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[Vision] Failed to process image:", error);
    output.parts = replaceImagesWithText(originalParts, formatVisionAnalysis({ error }), {
      sessionID: input.sessionID,
      messageID: input.messageID,
    });
    try {
      await deps.logSink?.({
        status: "failed",
        error,
        sessionId: input.sessionID,
        messageId,
        workerId: "vision",
        model: visionModel,
        startedAt,
        finishedAt: Date.now(),
        durationMs: Date.now() - startedAt,
      });
    } catch {
      // ignore log sink failures
    }
  }

  return undefined;
}

export function syncVisionProcessedMessages(
  output: { messages: Array<{ info?: { id?: string; role?: string }; parts?: any[] }> },
  state: VisionRoutingState,
) {
  const messages = output.messages ?? [];
  for (const msg of messages) {
    const info = msg?.info ?? {};
    if (info.role !== "user") continue;
    const messageId = typeof info.id === "string" ? info.id : undefined;
    if (!messageId || state.processedMessageIds.has(messageId)) continue;
    const parts = Array.isArray(msg.parts) ? msg.parts : [];
    const hasMarker = parts.some(
      (part: any) => part?.type === "text" && typeof part.text === "string" && part.text.includes("[VISION ANALYSIS"),
    );
    if (hasMarker) state.processedMessageIds.add(messageId);
  }
}
