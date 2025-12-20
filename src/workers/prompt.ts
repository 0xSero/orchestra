import { extname, basename, resolve as resolvePath, relative, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { stat } from "node:fs/promises";

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
  security?: {
    /**
     * Absolute directories that attachment paths must live under.
     * If omitted, `path` attachments are rejected (base64 still allowed).
     */
    allowedRoots?: string[];
    /** Allow non-image file attachments (default: false). */
    allowFileAttachments?: boolean;
    /** Max attachment bytes for `path` inputs (default: 10 MiB). */
    maxFileBytes?: number;
    /** Max base64 chars for inline attachments (default: 10 MiB-ish). */
    maxBase64Chars?: number;
    /** Max attachments per message (default: 8). */
    maxAttachments?: number;
  };
}): Promise<Array<Record<string, unknown>>> {
  const parts: Array<Record<string, unknown>> = [{ type: "text", text: input.message }];

  if (!input.attachments || input.attachments.length === 0) return parts;

  const maxAttachments = input.security?.maxAttachments ?? 8;
  const maxFileBytes = input.security?.maxFileBytes ?? 10 * 1024 * 1024;
  const maxBase64Chars = input.security?.maxBase64Chars ?? 14 * 1024 * 1024; // base64 overhead considered
  const allowFileAttachments = input.security?.allowFileAttachments ?? false;
  const allowedRoots = (input.security?.allowedRoots ?? []).filter((p) => typeof p === "string" && p.length > 0);

  const isPathWithinRoot = (root: string, candidateAbs: string): boolean => {
    const rootAbs = resolvePath(root);
    const rel = relative(rootAbs, candidateAbs);
    // rel==='' means same dir; ensure it doesn't escape upwards.
    return rel === "" || (!rel.startsWith("..") && !rel.startsWith("../") && !isAbsolute(rel));
  };

  const toSafeFileUrl = async (rawPath: string): Promise<{ url: string; filename?: string }> => {
    // Normalize file:// URLs to a filesystem path.
    let filePath = rawPath;
    if (rawPath.startsWith("file://")) {
      try {
        filePath = new URL(rawPath).pathname;
      } catch {
        throw new Error("Invalid file:// attachment URL");
      }
    }
    const abs = resolvePath(filePath);

    if (allowedRoots.length === 0) {
      throw new Error("Attachment paths are disabled (no allowedRoots configured). Use base64 attachments instead.");
    }
    const ok = allowedRoots.some((r) => isPathWithinRoot(r, abs));
    if (!ok) {
      throw new Error("Attachment path is outside allowed roots.");
    }

    const s = await stat(abs).catch(() => undefined);
    if (!s || !s.isFile()) throw new Error("Attachment path is not a readable file.");
    if (s.size > maxFileBytes) throw new Error(`Attachment file too large (${s.size} bytes > ${maxFileBytes}).`);

    const filename = basename(abs);
    return { url: pathToFileURL(abs).toString(), filename };
  };

  let count = 0;
  for (const attachment of input.attachments) {
    if (count >= maxAttachments) break;
    if (attachment.type === "file" && !allowFileAttachments) {
      // Default-deny non-image attachments; reduces risk of inadvertent data exfiltration.
      continue;
    }

    const mimeType = attachment.mimeType ?? (attachment.path ? inferImageMimeType(attachment.path) : "image/png");
    const filename = attachment.path ? basename(attachment.path) : undefined;

    // OpenCode message inputs accept images as FilePartInput:
    // { type: "file", mime, url: "file://..." } or a data: URL.
    if (attachment.path) {
      const safe = await toSafeFileUrl(attachment.path);
      parts.push({ type: "file", mime: mimeType, url: safe.url, ...(safe.filename ? { filename: safe.filename } : {}) });
      count++;
      continue;
    }

    const base64 = attachment.base64 ? normalizeBase64Image(attachment.base64) : undefined;
    if (!base64) continue;
    if (base64.length > maxBase64Chars) throw new Error(`Attachment base64 too large (${base64.length} chars > ${maxBase64Chars}).`);
    parts.push({ type: "file", mime: mimeType, url: `data:${mimeType};base64,${base64}`, ...(filename ? { filename } : {}) });
    count++;
  }

  return parts;
}

export function extractTextFromPromptResponse(data: unknown): { text: string; debug?: string } {
  const asObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
  const readParts = (v: unknown): unknown[] | undefined => {
    if (!asObj(v)) return undefined;
    const parts = (v as any).parts;
    if (Array.isArray(parts)) return parts;
    return undefined;
  };

  const parts = readParts(data) ?? readParts(asObj(data) ? (data as any).message : undefined) ?? [];
  if (!Array.isArray(parts) || parts.length === 0) return { text: "", debug: "no_parts" };

  let text = "";
  const partTypes: string[] = [];
  for (const part of parts) {
    if (!asObj(part)) continue;
    const type = typeof (part as any).type === "string" ? (part as any).type : "unknown";
    partTypes.push(type);
    if (type === "text" && typeof (part as any).text === "string") text += (part as any).text;
  }

  const debug = text.length > 0 ? undefined : `parts:${[...new Set(partTypes)].join(",")}`;
  return { text, debug };
}
