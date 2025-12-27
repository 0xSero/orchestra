import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

type VisionLogEntry = Record<string, unknown>;

/** Resolve vision runtime settings (timeout, prompt, logging) from env and project dir. */
export const getVisionRuntimeConfig = (projectDir: string) => {
  const rawTimeout = process.env.OPENCODE_VISION_TIMEOUT_MS;
  const timeoutValue = rawTimeout ? Number(rawTimeout) : undefined;
  const timeoutMs =
    Number.isFinite(timeoutValue ?? NaN) && (timeoutValue as number) > 0 ? (timeoutValue as number) : 300_000;
  const prompt = process.env.OPENCODE_VISION_PROMPT?.trim() || undefined;

  const logSink = async (entry: VisionLogEntry) => {
    try {
      const logDir = join(projectDir, ".opencode", "vision");
      await mkdir(logDir, { recursive: true });
      const payload = { loggedAt: new Date().toISOString(), ...entry };
      await appendFile(join(logDir, "jobs.jsonl"), `${JSON.stringify(payload)}\n`);
    } catch {
      // ignore logging failures
    }
  };

  return { timeoutMs, prompt, logSink };
};
