import {
  basename,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { pathToFileURL } from "node:url";
import { copyFile, mkdir, unlink, writeFile } from "node:fs/promises";

export type WorkerAttachment = {
  type: "image" | "file";
  path?: string;
  base64?: string;
  mimeType?: string;
};

function inferImageMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/png";
}

export function normalizeBase64Image(input: string): string {
  // Allow passing data URLs.
  const match = input.match(/^data:.*?;base64,(.*)$/);
  return match ? match[1] : input;
}

export async function buildPromptParts(input: {
  message: string;
  attachments?: WorkerAttachment[];
}): Promise<Array<Record<string, unknown>>> {
  const parts: Array<Record<string, unknown>> = [
    { type: "text", text: input.message },
  ];

  if (!input.attachments || input.attachments.length === 0) return parts;

  for (const attachment of input.attachments) {
    if (attachment.type !== "image") continue;

    const mimeType =
      attachment.mimeType ??
      (attachment.path ? inferImageMimeType(attachment.path) : "image/png");
    const filename = attachment.path ? basename(attachment.path) : undefined;

    // OpenCode message inputs accept images as FilePartInput:
    // { type: "file", mime, url: "file://..." } or a data: URL.
    if (attachment.path) {
      const url = attachment.path.startsWith("file://")
        ? attachment.path
        : pathToFileURL(resolve(attachment.path)).toString();
      parts.push({
        type: "file",
        mime: mimeType,
        url,
        ...(filename ? { filename } : {}),
      });
      continue;
    }

    const base64 = attachment.base64
      ? normalizeBase64Image(attachment.base64)
      : undefined;
    if (!base64) continue;
    parts.push({
      type: "file",
      mime: mimeType,
      url: `data:${mimeType};base64,${base64}`,
      ...(filename ? { filename } : {}),
    });
  }

  return parts;
}

function isPathInside(baseDir: string, targetPath: string): boolean {
  const base = resolve(baseDir);
  const target = resolve(targetPath);
  const rel = relative(base, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export async function prepareWorkerAttachments(input: {
  attachments?: WorkerAttachment[];
  baseDir: string;
  workerId: string;
}): Promise<{
  attachments?: WorkerAttachment[];
  cleanup: () => Promise<void>;
}> {
  if (!input.attachments || input.attachments.length === 0) {
    return { attachments: input.attachments, cleanup: async () => {} };
  }

  const tempDir = join(input.baseDir, ".opencode", "attachments");
  const created: string[] = [];
  const normalized: WorkerAttachment[] = [];

  const ensureTempDir = async () => {
    await mkdir(tempDir, { recursive: true });
  };

  const extForMime = (mimeType?: string, fallbackPath?: string): string => {
    if (fallbackPath) {
      const ext = extname(fallbackPath);
      if (ext) return ext;
    }
    if (!mimeType) return ".png";
    if (mimeType.includes("png")) return ".png";
    if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return ".jpg";
    if (mimeType.includes("webp")) return ".webp";
    if (mimeType.includes("gif")) return ".gif";
    return ".bin";
  };

  let counter = 0;
  for (const attachment of input.attachments) {
    if (attachment.type !== "image") {
      normalized.push(attachment);
      continue;
    }

    if (attachment.path) {
      if (isPathInside(input.baseDir, attachment.path)) {
        normalized.push(attachment);
        continue;
      }
      await ensureTempDir();
      const ext = extForMime(attachment.mimeType, attachment.path);
      const dest = join(
        tempDir,
        `${input.workerId}-${Date.now()}-${counter++}${ext}`,
      );
      await copyFile(attachment.path, dest);
      created.push(dest);
      normalized.push({ ...attachment, path: dest, base64: undefined });
      continue;
    }

    if (attachment.base64) {
      await ensureTempDir();
      const ext = extForMime(attachment.mimeType);
      const dest = join(
        tempDir,
        `${input.workerId}-${Date.now()}-${counter++}${ext}`,
      );
      const decoded = Buffer.from(
        normalizeBase64Image(attachment.base64),
        "base64",
      );
      await writeFile(dest, decoded);
      created.push(dest);
      normalized.push({
        type: "image",
        path: dest,
        mimeType: attachment.mimeType,
      });
      continue;
    }

    normalized.push(attachment);
  }

  return {
    attachments: normalized,
    cleanup: async () => {
      await Promise.all(
        created.map(async (path) => {
          try {
            await unlink(path);
          } catch {
            // ignore
          }
        }),
      );
    },
  };
}
