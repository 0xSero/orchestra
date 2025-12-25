import { copyFile, mkdir, unlink, writeFile } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { normalizeBase64Image, type WorkerAttachment } from "./prompt";

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
}): Promise<{ attachments?: WorkerAttachment[]; cleanup: () => Promise<void> }> {
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
      const dest = join(tempDir, `${input.workerId}-${Date.now()}-${counter++}${ext}`);
      await copyFile(attachment.path, dest);
      created.push(dest);
      normalized.push({ ...attachment, path: dest, base64: undefined });
      continue;
    }

    if (attachment.base64) {
      await ensureTempDir();
      const ext = extForMime(attachment.mimeType);
      const dest = join(tempDir, `${input.workerId}-${Date.now()}-${counter++}${ext}`);
      const decoded = Buffer.from(normalizeBase64Image(attachment.base64), "base64");
      await writeFile(dest, decoded);
      created.push(dest);
      normalized.push({ type: "image", path: dest, mimeType: attachment.mimeType });
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
        })
      );
    },
  };
}
