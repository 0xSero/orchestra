/**
 * Worker Spawner - Creates and manages OpenCode worker instances
 */

import { createOpencode, createOpencodeClient } from "@opencode-ai/sdk";
import type { WorkerProfile, WorkerInstance } from "../types";
import type { WorkerRegistry } from "../core/registry";
import { registry as defaultRegistry } from "../core/registry";
import { buildPromptParts, extractTextFromPromptResponse, type WorkerAttachment } from "./prompt";
import { realpath } from "node:fs/promises";
import { resolve as resolvePath, sep } from "node:path";
import { fileURLToPath } from "node:url";

interface SpawnOptions {
  /** Base port to start from */
  basePort: number;
  /** Timeout for startup (ms) */
  timeout: number;
  /** Directory to run in */
  directory: string;
  /** Registry instance to use (defaults to singleton for back-compat) */
  registry?: WorkerRegistry;
}

function isValidPort(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 65535;
}

function parseProviderId(model: string): { providerId?: string; modelKey?: string } {
  const slash = model.indexOf("/");
  if (slash > 0) return { providerId: model.slice(0, slash), modelKey: model.slice(slash + 1) };
  return {};
}

const DEFAULT_MAX_MESSAGE_CHARS = 50_000;
const DEFAULT_MAX_ATTACHMENTS = 8;
const DEFAULT_MAX_BASE64_CHARS = 6_000_000; // ~4.5MB raw, conservative

function isInsideDir(root: string, candidate: string): boolean {
  const rootAbs = resolvePath(root);
  const candAbs = resolvePath(candidate);
  return candAbs === rootAbs || candAbs.startsWith(rootAbs + sep);
}

async function sanitizeAttachmentPaths(input: {
  attachments?: WorkerAttachment[];
  allowedRoot: string;
}): Promise<WorkerAttachment[] | undefined> {
  const { attachments, allowedRoot } = input;
  if (!attachments || attachments.length === 0) return undefined;
  if (attachments.length > DEFAULT_MAX_ATTACHMENTS) {
    throw new Error(`Too many attachments (max ${DEFAULT_MAX_ATTACHMENTS}).`);
  }

  const rootReal = await realpath(allowedRoot).catch(() => resolvePath(allowedRoot));

  const out: WorkerAttachment[] = [];
  for (const a of attachments) {
    if (!a || (a.type !== "image" && a.type !== "file")) continue;

    // base64 payloads are allowed, but bounded.
    if (a.base64) {
      if (a.base64.length > DEFAULT_MAX_BASE64_CHARS) {
        throw new Error(`Attachment base64 too large (max ${DEFAULT_MAX_BASE64_CHARS} chars).`);
      }
      out.push(a);
      continue;
    }

    if (!a.path) continue;
    let p = a.path;
    if (p.startsWith("file://")) {
      try {
        p = fileURLToPath(p);
      } catch {
        throw new Error("Invalid file:// attachment URL.");
      }
    }

    // Resolve relative paths against the allowed root.
    const abs = resolvePath(rootReal, p);
    const absReal = await realpath(abs).catch(() => abs);
    if (!isInsideDir(rootReal, absReal)) {
      throw new Error("Attachment path is outside the allowed project directory.");
    }

    out.push({ ...a, path: absReal });
  }
  return out.length ? out : undefined;
}

function sanitizeMessage(message: string): string {
  if (typeof message !== "string") return "";
  if (message.length <= DEFAULT_MAX_MESSAGE_CHARS) return message;
  // Fail-closed rather than silently truncating (truncation can change meaning).
  throw new Error(`Message too large (max ${DEFAULT_MAX_MESSAGE_CHARS} chars).`);
}

/**
 * Spawn a new worker instance
 */
export async function spawnWorker(
  profile: WorkerProfile,
  options: SpawnOptions
): Promise<WorkerInstance> {
  const registry = options.registry ?? defaultRegistry;
  if (!profile.model.includes("/") && !profile.model.startsWith("auto")) {
    throw new Error(
      `Invalid model "${profile.model}". OpenCode models must be in "provider/model" format. ` +
        `Run list_models({}) to see configured models and copy the full ID.`
    );
  }

  const hostname = "127.0.0.1";
  const fixedPort = isValidPort(profile.port) ? profile.port : undefined;
  // Use port 0 to let OpenCode choose a free port dynamically.
  const requestedPort = fixedPort ?? 0;

  // Create initial instance
  const instance: WorkerInstance = {
    profile,
    status: "starting",
    port: requestedPort,
    directory: options.directory,
    startedAt: new Date(),
  };

  // Register immediately so TUI can show it
  registry.register(instance);

  try {
    // Start the opencode server for this worker (port=0 => dynamic port)
    const { client, server } = await createOpencode({
      hostname,
      port: requestedPort,
      timeout: options.timeout,
      config: {
        model: profile.model,
        // Apply any tool restrictions
        ...(profile.tools && { tools: profile.tools }),
      },
    });

    instance.client = client;
    instance.shutdown = () => server.close();

    // Preflight provider availability to avoid "ready but never responds" workers.
    const { providerId, modelKey } = parseProviderId(profile.model);
    if (providerId) {
      const providersRes = await client.config.providers({ query: { directory: options.directory } });
      const providers = (providersRes.data as any)?.providers as Array<{ id: string; models?: Record<string, unknown> }> | undefined;
      const provider = providers?.find((p) => p.id === providerId);
      if (!provider) {
        throw new Error(
          `Provider "${providerId}" is not configured for this worker (model: "${profile.model}"). ` +
            `Update your OpenCode config/providers or override the profile model.`
        );
      }
      if (modelKey && provider.models && typeof provider.models === "object") {
        const modelMap = provider.models as Record<string, unknown>;
        const candidates = new Set([profile.model, modelKey, `${providerId}/${modelKey}`, `${providerId}:${modelKey}`]);
        const found = [...candidates].some((k) => k in modelMap);
        if (!found) {
          console.warn(
            `[Orchestrator] Model "${profile.model}" not found in provider "${providerId}" models. ` +
              `Worker may not respond until configured.`
          );
        }
      }
    }

    // If we used a dynamic port, update the instance.port to the actual one.
    if (!fixedPort) {
      try {
        const url = new URL(server.url);
        const actualPort = Number(url.port);
        if (Number.isFinite(actualPort) && actualPort > 0) {
          instance.port = actualPort;
          registry.updateStatus(profile.id, "starting");
        }
      } catch {
        // ignore
      }
    }

    // Create a dedicated session for this worker
    const sessionResult = await client.session.create({
      body: {
        title: `Worker: ${profile.name}`,
      },
      query: { directory: options.directory },
    });

    // SDK returns { data, error } - extract data
    const session = sessionResult.data;
    if (!session) {
      const err = sessionResult.error as any;
      throw new Error(err?.message ?? err?.toString?.() ?? "Failed to create session");
    }

    instance.sessionId = session.id;

    // Inject the system context if provided
    if (profile.systemPrompt) {
      await client.session.prompt({
        path: { id: session.id },
        body: {
          noReply: true,
          parts: [
            {
              type: "text",
              text: `<system-context>\n${profile.systemPrompt}\n</system-context>`,
            },
          ],
        },
        query: { directory: options.directory },
      });
    }

    // Mark as ready
    instance.status = "ready";
    instance.lastActivity = new Date();
    registry.updateStatus(profile.id, "ready");

    console.log(`[Orchestrator] Worker "${profile.name}" ready on ${server.url}`);

    return instance;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    try {
      instance.shutdown?.();
    } catch {
      // ignore
    }
    instance.status = "error";
    instance.error = errorMsg;
    registry.updateStatus(profile.id, "error", errorMsg);
    console.error(`[Orchestrator] Failed to spawn worker "${profile.name}":`, errorMsg);
    throw error;
  }
}

/**
 * Connect to an existing worker (if it was started externally)
 */
export async function connectToWorker(
  profile: WorkerProfile,
  port: number,
  options?: { registry?: WorkerRegistry; directory?: string }
): Promise<WorkerInstance> {
  const registry = options?.registry ?? defaultRegistry;
  const instance: WorkerInstance = {
    profile,
    status: "starting",
    port,
    directory: options?.directory ?? process.cwd(),
    startedAt: new Date(),
  };

  registry.register(instance);

  try {
    const client = createOpencodeClient({
      baseUrl: `http://127.0.0.1:${port}`,
    });

    // Verify connection - SDK returns { data, error }
    const sessionsResult = await client.session.list();
    const sessions = sessionsResult.data;

    instance.client = client;
    instance.status = "ready";
    instance.lastActivity = new Date();

    // Use existing session or create new one
    if (sessions && sessions.length > 0) {
      instance.sessionId = sessions[0].id;
    } else {
      const sessionResult = await client.session.create({
        body: { title: `Worker: ${profile.name}` },
      });
      const session = sessionResult.data;
      if (!session) {
        throw new Error("Failed to create session");
      }
      instance.sessionId = session.id;
    }

    registry.updateStatus(profile.id, "ready");
    return instance;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    instance.status = "error";
    instance.error = errorMsg;
    registry.updateStatus(profile.id, "error", errorMsg);
    throw error;
  }
}

/**
 * Stop a worker
 */
export async function stopWorker(workerId: string, options?: { registry?: WorkerRegistry }): Promise<boolean> {
  const registry = options?.registry ?? defaultRegistry;
  const instance = registry.getWorker(workerId);
  if (!instance) {
    return false;
  }

  try {
    // The SDK doesn't expose a direct shutdown, but we can mark it stopped
    instance.shutdown?.();
    instance.status = "stopped";
    registry.updateStatus(workerId, "stopped");
    registry.unregister(workerId);
    return true;
  } catch (error) {
    console.error(`[Orchestrator] Error stopping worker "${workerId}":`, error);
    return false;
  }
}

/**
 * Send a message to a worker and get a response
 */
export async function sendToWorker(
  workerId: string,
  message: string,
  options?: {
    attachments?: WorkerAttachment[];
    timeout?: number;
    registry?: WorkerRegistry;
  }
): Promise<{ success: boolean; response?: string; error?: string }> {
  const registry = options?.registry ?? defaultRegistry;
  const instance = registry.getWorker(workerId);

  if (!instance) {
    return { success: false, error: `Worker "${workerId}" not found` };
  }

  if (instance.status !== "ready") {
    return { success: false, error: `Worker "${workerId}" is ${instance.status}, not ready` };
  }

  if (!instance.client || !instance.sessionId) {
    return { success: false, error: `Worker "${workerId}" not properly initialized` };
  }

  let safeMessage: string;
  try {
    safeMessage = sanitizeMessage(message);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Invalid message: ${msg}` };
  }

  // Mark as busy
  registry.updateStatus(workerId, "busy");

  try {
    const safeAttachments = await sanitizeAttachmentPaths({
      attachments: options?.attachments,
      allowedRoot: instance.directory ?? process.cwd(),
    });
    const parts = await buildPromptParts({ message: safeMessage, attachments: safeAttachments });

    const abort = new AbortController();
    const timeoutMs = options?.timeout ?? 120_000;
    const timer = setTimeout(() => abort.abort(new Error("worker prompt timed out")), timeoutMs);

    // Send prompt and wait for response - SDK returns { data, error }
    const result = await instance.client.session
      .prompt({
        path: { id: instance.sessionId },
        body: {
          parts: parts as any,
        },
        query: { directory: instance.directory ?? process.cwd() },
        signal: abort.signal as any,
      } as any)
      .finally(() => clearTimeout(timer));

    const extracted = extractTextFromPromptResponse(result.data);
    const responseText = extracted.text.trim();
    if (responseText.length === 0) {
      throw new Error(
        `Worker returned no text output (${extracted.debug ?? "unknown"}). ` +
          `This usually means the worker model/provider is misconfigured or unavailable.`
      );
    }

    // Mark as ready again
    registry.updateStatus(workerId, "ready");
    instance.lastActivity = new Date();

    return { success: true, response: responseText };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    registry.updateStatus(workerId, "ready"); // Reset to ready so it can be used again
    return { success: false, error: errorMsg };
  }
}

/**
 * Spawn multiple workers in parallel
 */
export async function spawnWorkers(
  profiles: WorkerProfile[],
  options: SpawnOptions
): Promise<{ succeeded: WorkerInstance[]; failed: Array<{ profile: WorkerProfile; error: string }> }> {
  const results = await Promise.allSettled(
    profiles.map((profile) => spawnWorker(profile, options))
  );

  const succeeded: WorkerInstance[] = [];
  const failed: Array<{ profile: WorkerProfile; error: string }> = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      succeeded.push(result.value);
    } else {
      failed.push({
        profile: profiles[index],
        error: result.reason?.message || String(result.reason),
      });
    }
  });

  return { succeeded, failed };
}
