import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ImageAttachment } from "./types";

const execFileAsync = promisify(execFile);

const MIME_MAP: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

export function isImagePart(part: any): boolean {
  if (!part || typeof part !== "object") return false;
  if (part.type === "image") return true;
  if (part.type === "file" && typeof part.mime === "string" && part.mime.startsWith("image/")) return true;
  if (part.type === "file" && typeof part.url === "string" && part.url.startsWith("data:image/")) return true;
  if (typeof part.url === "string" && (part.url === "clipboard" || part.url.startsWith("clipboard:"))) return true;
  return false;
}

export function hasImages(parts: any[]): boolean {
  if (!Array.isArray(parts)) return false;
  return parts.some((p) => isImagePart(p));
}

export async function extractImages(parts: any[]): Promise<ImageAttachment[]> {
  if (!Array.isArray(parts)) return [];

  const imageParts = parts.filter(isImagePart);
  if (imageParts.length === 0) return [];

  const results = await Promise.all(imageParts.map(extractSingleImage));
  return results.filter((r): r is ImageAttachment => r !== null);
}

async function extractSingleImage(part: any): Promise<ImageAttachment | null> {
  try {
    const partUrl = typeof part.url === "string" ? part.url : undefined;

    if (partUrl?.startsWith("file://")) {
      const path = fileURLToPath(partUrl);
      const buf = await readFile(path);
      return { type: "image", mimeType: part.mime ?? inferMimeType(path), base64: buf.toString("base64") };
    }

    if (partUrl && (partUrl.startsWith("/") || /^[A-Za-z]:[\\/]/.test(partUrl))) {
      const buf = await readFile(partUrl);
      return { type: "image", mimeType: part.mime ?? inferMimeType(partUrl), base64: buf.toString("base64") };
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
      return { type: "image", mimeType: part.mime ?? "image/png", base64: part.base64 };
    }

    return null;
  } catch {
    return null;
  }
}

function inferMimeType(path: string): string {
  const ext = path.toLowerCase().split(".").pop();
  return MIME_MAP[ext ?? ""] ?? "image/png";
}

async function readClipboardImage(): Promise<{ mimeType: string; base64: string } | null> {
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
        return null;
      }
    }
  }

  return null;
}
