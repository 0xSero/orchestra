import { basename, extname, resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import type { FilePartInput, TextPartInput } from "@opencode-ai/sdk";

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

type PromptPart = TextPartInput | FilePartInput;

export async function buildPromptParts(input: {
  message: string;
  attachments?: WorkerAttachment[];
}): Promise<PromptPart[]> {
  const parts: PromptPart[] = [{ type: "text", text: input.message }];

  if (!input.attachments || input.attachments.length === 0) return parts;

  for (const attachment of input.attachments) {
    if (attachment.type !== "image") continue;

    const mimeType = attachment.mimeType ?? (attachment.path ? inferImageMimeType(attachment.path) : "image/png");
    const filename = attachment.path ? basename(attachment.path) : undefined;

    // OpenCode message inputs accept images as FilePartInput:
    // { type: "file", mime, url: "file://..." } or a data: URL.
    if (attachment.path) {
      const url = attachment.path.startsWith("file://")
        ? attachment.path
        : pathToFileURL(resolvePath(attachment.path)).toString();
      parts.push({ type: "file", mime: mimeType, url, ...(filename ? { filename } : {}) });
      continue;
    }

    const base64 = attachment.base64 ? normalizeBase64Image(attachment.base64) : undefined;
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

export function extractTextFromPromptResponse(data: unknown): { text: string; debug?: string } {
  const asObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
  const readParts = (v: unknown): Record<string, unknown>[] | undefined => {
    if (!asObj(v)) return undefined;
    const parts = v.parts;
    if (Array.isArray(parts)) return parts.filter(asObj);
    return undefined;
  };

  const message = asObj(data) ? data.message : undefined;
  const parts = readParts(data) ?? readParts(message) ?? [];
  if (!Array.isArray(parts) || parts.length === 0) return { text: "", debug: "no_parts" };

  let text = "";
  let reasoning = "";
  const partTypes: string[] = [];
  for (const part of parts) {
    if (!asObj(part)) continue;
    const type = typeof part.type === "string" ? part.type : "unknown";
    partTypes.push(type);
    if (type === "text" && typeof part.text === "string") text += part.text;
    if (type === "reasoning" && typeof part.text === "string") reasoning += part.text;
  }

  const output = text.length > 0 ? text : reasoning;
  const debug = output.length > 0 ? undefined : `parts:${[...new Set(partTypes)].join(",")}`;
  return { text: output, debug };
}
