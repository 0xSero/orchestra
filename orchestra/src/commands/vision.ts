import { existsSync } from "node:fs";
import { isAbsolute, resolve as resolvePath } from "node:path";
import { extractVisionAttachments, formatVisionAnalysis } from "../ux/vision-routing";
import type { CommandDefinition } from "./index";

const DEFAULT_PROMPT =
  "Analyze this image and describe what you see. Focus on any text, code, UI elements, errors, or relevant details.";

function resolveCandidatePath(projectDir: string, inputPath: string): string {
  if (isAbsolute(inputPath)) return inputPath;
  return resolvePath(projectDir, inputPath);
}

function pickFirstString(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

export function createVisionCommands(): Record<string, CommandDefinition> {
  return {
    "vision.analyze": {
      description: "Analyze an image from the clipboard or a file",
      usage: "[--path <file>] [--prompt <text>]",
      async execute(ctx) {
        const named = ctx.parsed.named;
        const positional = ctx.parsed.positional;

        const explicitPath = pickFirstString(named.path ?? named.file);
        let candidatePath: string | undefined;
        let remainingPositional = positional;

        if (explicitPath) {
          candidatePath = resolveCandidatePath(ctx.deps.projectDir, explicitPath);
        } else if (positional.length > 0) {
          const guess = resolveCandidatePath(ctx.deps.projectDir, positional[0]);
          if (existsSync(guess)) {
            candidatePath = guess;
            remainingPositional = positional.slice(1);
          }
        }

        if (candidatePath && !existsSync(candidatePath)) {
          return `File not found: ${candidatePath}`;
        }

        const promptOverride =
          pickFirstString(named.prompt ?? named.question) ||
          (remainingPositional.length > 0 ? remainingPositional.join(" ") : undefined);
        const prompt = promptOverride?.trim() || process.env.OPENCODE_VISION_PROMPT?.trim() || DEFAULT_PROMPT;

        if (!ctx.deps.workers.getProfile("vision")) {
          return "Vision profile is not available.";
        }

        const mimeType = pickFirstString(named.mime ?? named.mimeType);
        const base64 = pickFirstString(named.base64);
        const parts: any[] = [];

        if (base64) {
          parts.push({ type: "image", base64, ...(mimeType ? { mimeType } : {}) });
        } else if (candidatePath) {
          parts.push({ type: "image", url: candidatePath, ...(mimeType ? { mimeType } : {}) });
        } else {
          parts.push({ type: "image", url: "clipboard" });
        }

        const attachments = await extractVisionAttachments(parts);
        if (attachments.length === 0) {
          return "No image was found in the clipboard or provided file.";
        }

        await ctx.deps.orchestrator.ensureWorker({ workerId: "vision", reason: "manual" });

        const timeoutMsRaw = pickFirstString(named.timeoutMs ?? named.timeout);
        const parsedTimeout = timeoutMsRaw ? Number(timeoutMsRaw) : undefined;
        const timeoutMs =
          Number.isFinite(parsedTimeout ?? NaN) && (parsedTimeout as number) > 0
            ? (parsedTimeout as number)
            : undefined;

        const res = await ctx.deps.workers.send("vision", prompt, {
          attachments,
          ...(timeoutMs ? { timeout: timeoutMs } : {}),
          from: ctx.input.agent ?? "orchestrator",
        });

        const analysis = formatVisionAnalysis({ response: res.response, error: res.error });
        return analysis;
      },
    },
  };
}
