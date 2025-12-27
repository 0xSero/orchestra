import { execFile } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { WorkerAttachment } from "../workers/prompt";
import { normalizeBase64Image } from "../workers/prompt";
import { isImagePart } from "./vision-parts";
import type { VisionPart } from "./vision-types";

const execFileAsync = promisify(execFile);

const inferMimeType = (path: string): string => {
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
};

const readClipboardImage = async (): Promise<{ mimeType: string; base64: string } | undefined> => {
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
      const { stdout } = (await execFileAsync("wl-paste", ["--no-newline", "--type", "image/png"], {
        encoding: null,
        timeout: 2000,
        maxBuffer: 20 * 1024 * 1024,
      })) as { stdout: Buffer | string };
      const buf = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
      if (buf.length > 0) return { mimeType: "image/png", base64: buf.toString("base64") };
    } catch {
      try {
        const { stdout } = (await execFileAsync("xclip", ["-selection", "clipboard", "-t", "image/png", "-o"], {
          encoding: null,
          timeout: 2000,
          maxBuffer: 20 * 1024 * 1024,
        })) as { stdout: Buffer | string };
        const buf = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
        if (buf.length > 0) return { mimeType: "image/png", base64: buf.toString("base64") };
      } catch {
        // ignore
      }
    }
  }

  return undefined;
};

const extractSingleImage = async (part: VisionPart): Promise<WorkerAttachment | null> => {
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
};

/** Convert image parts into worker attachments that can be sent to vision models. */
export const extractVisionAttachments = async (parts: VisionPart[]): Promise<WorkerAttachment[]> => {
  if (!Array.isArray(parts)) return [];
  const imageParts = parts.filter((part) => isImagePart(part));
  if (imageParts.length === 0) return [];
  const results = await Promise.all(imageParts.map((part) => extractSingleImage(part)));
  return results.filter((result): result is WorkerAttachment => Boolean(result));
};
