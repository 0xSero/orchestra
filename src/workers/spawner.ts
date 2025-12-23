/**
 * Worker Spawner - Creates and manages OpenCode worker instances
 *
 * NOTE: This module handles the low-level spawn and communication operations.
 * For worker lifecycle management (reuse, pooling, deduplication), use worker-pool.ts.
 */

import { createOpencodeClient } from "@opencode-ai/sdk";
import type { WorkerProfile, WorkerInstance } from "../types";
import { workerPool, listDeviceRegistry, removeWorkerEntriesByPid, type DeviceRegistryWorkerEntry } from "../core/worker-pool";
import { hydrateProfileModelsFromOpencode } from "../models/hydrate";
import { buildPromptParts, extractTextFromPromptResponse, normalizeBase64Image, type WorkerAttachment } from "./prompt";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, unlink, writeFile } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ensureRuntime, registerWorkerInDeviceRegistry } from "../core/runtime";
import { getUserConfigDir } from "../helpers/format";
import { mergeOpenCodeConfig } from "../config/opencode";
import { getRepoContextForWorker } from "../ux/repo-context";

interface SpawnOptions {
  /** Base port to start from */
  basePort: number;
  /** Timeout for startup (ms) */
  timeout: number;
  /** Directory to run in */
  directory: string;
  /** Orchestrator client used to resolve model nodes (auto/node tags) */
  client?: any;
}

// In-flight spawn deduplication moved to worker-pool.ts
// This module now focuses on pure spawn operations

function isValidPort(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 65535;
}

// Provider parsing moved inline where needed; keeping function for potential future use
// function parseProviderId(model: string): { providerId?: string; modelKey?: string } {
//   const slash = model.indexOf("/");
//   if (slash > 0) return { providerId: model.slice(0, slash), modelKey: model.slice(slash + 1) };
//   return {};
// }

function resolveWorkerBridgePluginSpecifier(): string | undefined {
  const configPluginPath = join(
    getUserConfigDir(),
    "opencode",
    "plugin",
    "worker-bridge-plugin.mjs"
  );
  // OpenCode treats `file://...` as a local plugin. A plain absolute path can be misinterpreted
  // as a package specifier and trigger a Bun install attempt.
  if (existsSync(configPluginPath)) return pathToFileURL(configPluginPath).href;

  const candidates = [
    // When running from `dist/workers/spawner.js`
    new URL("../../src/worker-bridge-plugin.mjs", import.meta.url),
    // When running from `src/workers/spawner.ts`
    new URL("../worker-bridge-plugin.mjs", import.meta.url),
  ];
  for (const url of candidates) {
    try {
      const path = fileURLToPath(url);
      if (existsSync(path)) return pathToFileURL(path).href;
    } catch {
      // ignore
    }
  }
  return undefined;
}

function isPathInside(baseDir: string, targetPath: string): boolean {
  const base = resolve(baseDir);
  const target = resolve(targetPath);
  const rel = relative(base, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

async function prepareWorkerAttachments(input: {
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

const workerBridgeToolIds = ["stream_chunk"] as const;

async function checkWorkerBridgeTools(
  client: ReturnType<typeof createOpencodeClient>,
  directory: string | undefined
): Promise<{ ok: boolean; missing: string[]; toolIds: string[] }> {
  const result = await client.tool.ids({ query: { directory } } as any);
  const sdkError: any = (result as any)?.error;
  if (sdkError) {
    const msg =
      sdkError?.data?.message ??
      sdkError?.message ??
      (typeof sdkError === "string" ? sdkError : JSON.stringify(sdkError));
    throw new Error(msg);
  }
  const toolIds = Array.isArray(result.data) ? (result.data as string[]) : [];
  const missing = workerBridgeToolIds.filter((id) => !toolIds.includes(id));
  return { ok: missing.length === 0, missing, toolIds };
}

// isProcessAlive, findExistingWorker, and tryReuseExistingWorker moved to worker-pool.ts
// This module now handles only the core spawn operation

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function spawnOpencodeServe(options: {
  hostname: string;
  port: number;
  timeout: number;
  config: Record<string, unknown>;
  env: Record<string, string | undefined>;
}): Promise<{ url: string; proc: ChildProcess; close: () => Promise<void> }> {
  const mergedConfig = await mergeOpenCodeConfig(options.config ?? {}, { dropOrchestratorPlugin: true });
  // CRITICAL: Mark this as a worker process to prevent recursive spawning.
  // Workers should NOT load the orchestrator plugin or spawn more workers.
  const workerEnv = {
    ...process.env,
    ...options.env,
    OPENCODE_CONFIG_CONTENT: JSON.stringify(mergedConfig ?? options.config ?? {}),
    OPENCODE_ORCHESTRATOR_WORKER: "1", // Signal that this is a worker, not the orchestrator
  };

  const proc = spawn(
    "opencode",
    ["serve", `--hostname=${options.hostname}`, `--port=${options.port}`],
    {
      env: workerEnv as any,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  const url = await new Promise<string>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`Timeout waiting for server to start after ${options.timeout}ms`)), options.timeout);
    let output = "";

    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const lines = output.split("\n");
      for (const line of lines) {
        if (line.startsWith("opencode server listening")) {
          const match = line.match(/on\s+(https?:\/\/[^\s]+)/);
          if (!match) continue;
          clearTimeout(id);
          cleanup();
          resolve(match[1]);
          return;
        }
      }
    };

    const onExit = (code: number | null) => {
      clearTimeout(id);
      cleanup();
      let msg = `Server exited with code ${code}`;
      if (output.trim()) msg += `\nServer output: ${output}`;
      reject(new Error(msg));
    };

    const onError = (err: Error) => {
      clearTimeout(id);
      cleanup();
      reject(err);
    };

    // Discard handler to consume but ignore output after startup
    const discard = () => {};

    const cleanup = () => {
      proc.stdout.off("data", onData);
      proc.stderr.off("data", onData);
      proc.off("exit", onExit);
      proc.off("error", onError);
      // Keep consuming output to prevent it from leaking to parent stdout/stderr
      proc.stdout.on("data", discard);
      proc.stderr.on("data", discard);
    };

    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
    proc.on("exit", onExit);
    proc.on("error", onError);
  });

  const close = async () => {
    if (proc.killed) return;
    try {
      // If detached, kill the whole process group (covers grand-children).
      if (process.platform !== "win32" && typeof proc.pid === "number") {
        process.kill(-proc.pid, "SIGTERM");
      } else {
        proc.kill("SIGTERM");
      }
    } catch {
      try {
        proc.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try {
          if (process.platform !== "win32" && typeof proc.pid === "number") {
            process.kill(-proc.pid, "SIGKILL");
          } else {
            proc.kill("SIGKILL");
          }
        } catch {
          // ignore
        }
        resolve();
      }, 2000);
      proc.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  };

  return { url, proc, close };
}

/**
 * Spawn a new worker instance.
 *
 * NOTE: This function performs a fresh spawn. For deduplication and reuse,
 * use workerPool.getOrSpawn() from worker-pool.ts instead.
 */
export async function spawnWorker(
  profile: WorkerProfile,
  options: SpawnOptions & { forceNew?: boolean }
): Promise<WorkerInstance> {
  // Use workerPool.getOrSpawn for proper deduplication (prevents duplicate spawns)
  return workerPool.getOrSpawn(profile, options, _spawnWorkerCore);
}

/**
 * Core spawn implementation - called via workerPool.getOrSpawn() for deduplication.
 * Do not call directly - use spawnWorker() instead.
 */
async function _spawnWorkerCore(
  profile: WorkerProfile,
  options: SpawnOptions & { forceNew?: boolean }
): Promise<WorkerInstance> {
  // Resolve profile model if needed
  const resolvedProfile = await (async (): Promise<WorkerProfile> => {
    const modelSpec = profile.model.trim();
    const isNodeTag = modelSpec.startsWith("auto") || modelSpec.startsWith("node");

    // When spawning from inside the plugin, we always pass the orchestrator client.
    // Without it, we can only accept fully-qualified provider/model IDs.
    if (!options.client) {
      if (isNodeTag) {
        throw new Error(
          `Profile "${profile.id}" uses "${profile.model}", but model resolution is unavailable. ` +
            `Set a concrete provider/model ID for this profile.`
        );
      }
      if (!modelSpec.includes("/")) {
        throw new Error(
          `Invalid model "${profile.model}". OpenCode models must be in "provider/model" format. ` +
            `Run list_models({}) to see configured models and copy the full ID.`
        );
      }
      return profile;
    }

    const { profiles } = await hydrateProfileModelsFromOpencode({
      client: options.client,
      directory: options.directory,
      profiles: { [profile.id]: profile },
    });
    return profiles[profile.id] ?? profile;
  })();

  const hostname = "127.0.0.1";
  const fixedPort = isValidPort(resolvedProfile.port) ? resolvedProfile.port : undefined;
  // Use port 0 to let OpenCode choose a free port dynamically.
  const requestedPort = fixedPort ?? 0;

  const modelResolution =
    profile.model.trim().startsWith("auto") || profile.model.trim().startsWith("node")
      ? `resolved from ${profile.model.trim()}`
      : resolvedProfile.model === profile.model
        ? "configured"
        : `resolved from ${profile.model.trim()}`;

  // Create initial instance
  const instance: WorkerInstance = {
    profile: resolvedProfile,
    status: "starting",
    port: requestedPort,
    directory: options.directory,
    startedAt: new Date(),
    modelResolution,
  };

  // Register immediately so TUI can show it
  workerPool.register(instance);

  try {
    const rt = await ensureRuntime();
    const pluginSpecifier = resolveWorkerBridgePluginSpecifier();
    if (process.env.OPENCODE_ORCH_SPAWNER_DEBUG === "1") {
      console.error(
        `[spawner] pluginSpecifier=${pluginSpecifier}, profile=${resolvedProfile.id}, model=${resolvedProfile.model}`
      );
    }

    // Start the opencode server for this worker (port=0 => dynamic port)
    const { url, proc, close } = await spawnOpencodeServe({
      hostname,
      port: requestedPort,
      timeout: options.timeout,
      config: {
        model: resolvedProfile.model,
        plugin: pluginSpecifier ? [pluginSpecifier] : [],
        // Apply any tool restrictions
        ...(resolvedProfile.tools && { tools: resolvedProfile.tools }),
      },
      env: {
        OPENCODE_ORCH_BRIDGE_URL: rt.bridge.url,
        OPENCODE_ORCH_BRIDGE_TOKEN: rt.bridge.token,
        OPENCODE_ORCH_INSTANCE_ID: rt.instanceId,
        OPENCODE_ORCH_WORKER_ID: resolvedProfile.id,
      },
    });

    // Assign shutdown immediately so cleanup works if validation fails
    instance.shutdown = close;
    instance.pid = proc.pid ?? undefined;
    instance.serverUrl = url;

    const client = createOpencodeClient({ baseUrl: url });
    const toolCheck = await checkWorkerBridgeTools(client, options.directory).catch((error) => {
      instance.warning = `Unable to verify worker bridge tools: ${error instanceof Error ? error.message : String(error)}`;
      return undefined;
    });
    if (toolCheck && !toolCheck.ok) {
      throw new Error(
        `Worker bridge tools missing (${toolCheck.missing.join(", ")}). ` +
          `Loaded tools: ${toolCheck.toolIds.join(", ")}. ` +
          `Check worker plugin path (${pluginSpecifier ?? "none"}) and OpenCode config.`
      );
    }

    instance.client = client;

    // Record the process early so other orchestrator instances can reuse rather than spawn.
    if (typeof instance.pid === "number") {
      await registerWorkerInDeviceRegistry({
        workerId: resolvedProfile.id,
        pid: instance.pid,
        url,
        port: instance.port,
        sessionId: instance.sessionId,
        status: "starting",
        startedAt: instance.startedAt.getTime(),
      });
    }

    // Note: We skip provider preflight checks here because OpenCode has built-in providers
    // that aren't visible via client.config.providers(). The spawn will fail naturally
    // if the provider/model is unavailable.

    // If we used a dynamic port, update the instance.port to the actual one.
    if (!fixedPort) {
      try {
        const u = new URL(url);
        const actualPort = Number(u.port);
        if (Number.isFinite(actualPort) && actualPort > 0) {
          instance.port = actualPort;
          workerPool.updateStatus(resolvedProfile.id, "starting");
        }
      } catch {
        // ignore
      }
    }

    // Create a dedicated session for this worker
    const sessionResult = await client.session.create({
      body: {
        title: `Worker: ${resolvedProfile.name}`,
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

    if (typeof instance.pid === "number") {
      await registerWorkerInDeviceRegistry({
        workerId: resolvedProfile.id,
        pid: instance.pid,
        url,
        port: instance.port,
        sessionId: instance.sessionId,
        status: "starting",
        startedAt: instance.startedAt.getTime(),
      });
    }

    // Inject system context + reporting/messaging instructions.
    // For workers with injectRepoContext: true (like docs), also inject repo context.
    let repoContextSection = "";
    if (resolvedProfile.injectRepoContext) {
      const repoContext = await getRepoContextForWorker(options.directory).catch(() => undefined);
      if (repoContext) {
        repoContextSection = `\n\n${repoContext}\n`;
      }
    }

    const capabilitiesJson = JSON.stringify({
      vision: !!resolvedProfile.supportsVision,
      web: !!resolvedProfile.supportsWeb,
    });

    await client.session
      .prompt({
        path: { id: session.id },
        body: {
          noReply: true,
          parts: [
            {
              type: "text",
              text:
                (resolvedProfile.systemPrompt
                  ? `<system-context>\n${resolvedProfile.systemPrompt}\n</system-context>\n\n`
                  : "") +
                repoContextSection +
                `<worker-identity>\n` +
                `You are worker "${resolvedProfile.id}" (${resolvedProfile.name}).\n` +
                `Your capabilities: ${capabilitiesJson}\n` +
                `</worker-identity>\n\n` +
                `<orchestrator-instructions>\n` +
                `## Communication Tools Available\n\n` +
                `You have these tools for communicating with the orchestrator:\n\n` +
                `1. **stream_chunk** - Real-time streaming (RECOMMENDED for long responses)\n` +
                `   - Call multiple times during your response to stream output progressively\n` +
                `   - Each chunk is immediately shown to the user as you work\n` +
                `   - Set final=true on the last chunk to indicate completion\n` +
                `   - Include jobId if one was provided\n` +
                `   - Example: stream_chunk({ chunk: "Analyzing the image...", jobId: "abc123" })\n\n` +
                `## Required Behavior\n\n` +
                `1. Always return a direct plain-text answer to the prompt.\n` +
                `2. For long tasks, use stream_chunk to show progress (the user can see output in real-time).\n` +
                `3. If you received a jobId in <orchestrator-job>, include it when streaming chunks.\n` +
                `4. If bridge tools fail/unavailable, still return your answer in plain text.\n` +
                `</orchestrator-instructions>`,
            },
          ],
        },
        query: { directory: options.directory },
      } as any)
      .catch(() => {});

    // Mark as ready
    instance.status = "ready";
    instance.lastActivity = new Date();
    workerPool.updateStatus(resolvedProfile.id, "ready");
    if (typeof instance.pid === "number") {
      await registerWorkerInDeviceRegistry({
        workerId: resolvedProfile.id,
        pid: instance.pid,
        url,
        port: instance.port,
        sessionId: instance.sessionId,
        status: "ready",
        startedAt: instance.startedAt.getTime(),
      });
    }

    return instance;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[spawner] ERROR spawning ${resolvedProfile.id}: ${errorMsg}`);
    try {
      await instance.shutdown?.();
    } catch {
      // ignore
    }
    instance.status = "error";
    instance.error = errorMsg;
    workerPool.updateStatus(resolvedProfile.id, "error", errorMsg);
    if (typeof instance.pid === "number") {
      await registerWorkerInDeviceRegistry({
        workerId: resolvedProfile.id,
        pid: instance.pid,
        url: instance.serverUrl,
        port: instance.port,
        sessionId: instance.sessionId,
        status: "error",
        startedAt: instance.startedAt.getTime(),
        lastError: errorMsg,
      });
    }
    throw error;
  }
}

/**
 * Connect to an existing worker (if it was started externally)
 */
export async function connectToWorker(
  profile: WorkerProfile,
  port: number
): Promise<WorkerInstance> {
  const instance: WorkerInstance = {
    profile,
    status: "starting",
    port,
    serverUrl: `http://127.0.0.1:${port}`,
    directory: process.cwd(),
    startedAt: new Date(),
    modelResolution: "connected to existing worker",
  };

  workerPool.register(instance);

  try {
    const client = createOpencodeClient({
      baseUrl: instance.serverUrl,
    });

    // Verify connection - SDK returns { data, error }
    const sessionsResult = await client.session.list({ query: { directory: instance.directory } } as any);
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
        query: { directory: instance.directory },
      });
      const session = sessionResult.data;
      if (!session) {
        throw new Error("Failed to create session");
      }
      instance.sessionId = session.id;
    }

    workerPool.updateStatus(profile.id, "ready");
    return instance;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    instance.status = "error";
    instance.error = errorMsg;
    workerPool.updateStatus(profile.id, "error", errorMsg);
    throw error;
  }
}

/**
 * Stop a worker
 */
export async function stopWorker(workerId: string): Promise<boolean> {
  const instance = workerPool.get(workerId);
  if (!instance) {
    return false;
  }

  try {
    // The SDK doesn't expose a direct shutdown, but we can mark it stopped
    await instance.shutdown?.();
    instance.status = "stopped";
    workerPool.updateStatus(workerId, "stopped");
    workerPool.unregister(workerId);
    if (typeof instance.pid === "number") {
      await registerWorkerInDeviceRegistry({
        workerId,
        pid: instance.pid,
        url: instance.serverUrl,
        port: instance.port,
        sessionId: instance.sessionId,
        status: "stopped",
        startedAt: instance.startedAt.getTime(),
      });
      await removeWorkerEntriesByPid(instance.pid).catch(() => {});
    }
    return true;
  } catch {
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
    jobId?: string;
    /** Source worker ID (for worker-to-worker communication) */
    from?: string;
  }
): Promise<{ success: boolean; response?: string; error?: string }> {
  const extractStreamChunks = (value: any): string => {
    const parts = Array.isArray(value?.parts)
      ? value.parts
      : Array.isArray(value?.message?.parts)
        ? value.message.parts
        : [];
    if (!Array.isArray(parts) || parts.length === 0) return "";
    const chunks = parts
      .filter((part: any) => part?.type === "tool" && part?.tool === "stream_chunk")
      .map((part: any) => {
        const input = part?.state?.input;
        return typeof input?.chunk === "string" ? input.chunk : "";
      })
      .filter((chunk: string) => chunk.length > 0);
    return chunks.join("");
  };

  const instance = workerPool.get(workerId);

  if (!instance) {
    return { success: false, error: `Worker "${workerId}" not found` };
  }

  if (instance.status !== "ready") {
    return { success: false, error: `Worker "${workerId}" is ${instance.status}, not ready` };
  }

  if (!instance.client || !instance.sessionId) {
    return { success: false, error: `Worker "${workerId}" not properly initialized` };
  }

  // Mark as busy
  workerPool.updateStatus(workerId, "busy");
  instance.currentTask = message.slice(0, 140);

  let cleanupAttachments: (() => Promise<void>) | undefined;
  try {
    const startedAt = Date.now();
    
    // Build source identification for the message
    const sourceFrom = options?.from ?? "orchestrator";
    const jobIdStr = options?.jobId ?? "none";
    const sourceInfo = `<message-source from="${sourceFrom}" jobId="${jobIdStr}">\nThis message was sent by ${sourceFrom === "orchestrator" ? "the orchestrator" : `worker "${sourceFrom}"`}.\n</message-source>\n\n`;
    
    // Build the full task text with source info and job instructions
    let taskText = sourceInfo + message;
    if (options?.jobId) {
      taskText +=
        `\n\n<orchestrator-job id="${options.jobId}">\n` +
        `IMPORTANT:\n` +
        `- Include your full result as plain text in your assistant response.\n` +
        `- For long tasks, stream progress with stream_chunk and include this jobId.\n` +
        `</orchestrator-job>`;
    } else {
      taskText +=
        `\n\n<orchestrator-sync>\n` +
        `IMPORTANT: Reply with your final answer as plain text in your assistant response.\n` +
        `Stream with stream_chunk if the response is long or incremental.\n` +
        `If you do call any tools, still include the full answer as plain text.\n` +
        `</orchestrator-sync>`;
    }
    
    const prepared = await prepareWorkerAttachments({
      attachments: options?.attachments,
      baseDir: instance.directory ?? process.cwd(),
      workerId,
    });
    cleanupAttachments = prepared.cleanup;
    const parts = await buildPromptParts({ message: taskText, attachments: prepared.attachments });

    const abort = new AbortController();
    const timeoutMs = options?.timeout ?? 600_000;
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

    const sdkError: any = (result as any)?.error;
    if (sdkError) {
      const msg =
        sdkError?.data?.message ??
        sdkError?.message ??
        (typeof sdkError === "string" ? sdkError : JSON.stringify(sdkError));
      instance.warning = `Last request failed: ${msg}`;
      throw new Error(msg);
    }

    const promptData = result.data as any;
    const extracted = extractTextFromPromptResponse(promptData);
    let responseText = extracted.text.trim();
    if (responseText.length === 0) {
      // Fallback: some providers emit only reasoning parts.
      const parts = Array.isArray(promptData?.parts) ? promptData.parts : [];
      const reasoning = parts.filter((p: any) => p?.type === "reasoning" && typeof p.text === "string").map((p: any) => p.text).join("\n");
      responseText = reasoning.trim();
    }
    if (responseText.length === 0) {
      const streamed = extractStreamChunks(promptData).trim();
      if (streamed.length > 0) responseText = streamed;
    }
    if (responseText.length === 0) {
      const messageId = promptData?.info?.id ?? promptData?.message?.info?.id;
      if (messageId) {
        // Fallback: fetch the prompt message by id (sometimes parts arrive after the prompt response).
        for (let attempt = 0; attempt < 3 && responseText.length === 0; attempt += 1) {
          const messageRes = await instance.client.session.message({
            path: { id: instance.sessionId, messageID: messageId },
            query: { directory: instance.directory ?? process.cwd() },
          });
          const messageData = (messageRes as any)?.data ?? messageRes;
          const extractedMessage = extractTextFromPromptResponse(messageData);
          responseText = extractedMessage.text.trim();
          if (responseText.length === 0) {
            const streamed = extractStreamChunks(messageData).trim();
            if (streamed.length > 0) responseText = streamed;
          }
          if (responseText.length > 0) break;
          await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
        }
      }
    }
    if (responseText.length === 0) {
      // Fallback: poll for the latest assistant message (prompt may return before output is stored).
      const pollDeadline = Date.now() + Math.min(10_000, timeoutMs);
      while (responseText.length === 0 && Date.now() < pollDeadline) {
        const messagesRes = await instance.client.session.messages({
          path: { id: instance.sessionId },
          query: { directory: instance.directory ?? process.cwd(), limit: 10 },
        });
        const messages = Array.isArray((messagesRes as any)?.data) ? (messagesRes as any).data : Array.isArray(messagesRes) ? messagesRes : [];
        const assistant = [...messages].reverse().find((m: any) => m?.info?.role === "assistant");
        if (assistant) {
          const extractedMessage = extractTextFromPromptResponse(assistant);
          responseText = extractedMessage.text.trim();
          if (responseText.length === 0) {
            const streamed = extractStreamChunks(assistant).trim();
            if (streamed.length > 0) responseText = streamed;
          }
        }
        if (responseText.length > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    if (responseText.length === 0) {
      if (process.env.OPENCODE_ORCH_SPAWNER_DEBUG === "1") {
        try {
          const messagesRes = await instance.client.session.messages({
            path: { id: instance.sessionId },
            query: { directory: instance.directory ?? process.cwd(), limit: 20 },
          });
          const messages = Array.isArray((messagesRes as any)?.data) ? (messagesRes as any).data : Array.isArray(messagesRes) ? messagesRes : [];
          const summary = messages.map((m: any) => ({
            role: m?.info?.role,
            id: m?.info?.id,
            finish: m?.info?.finish,
            error: m?.info?.error,
            parts: Array.isArray(m?.parts) ? m.parts.map((p: any) => p?.type).filter(Boolean) : [],
          }));
          console.error(`[spawner] empty response summary`, JSON.stringify(summary, null, 2));
        } catch (error) {
          console.error(`[spawner] empty response debug failed`, error);
        }
      }
      throw new Error(
        `Worker returned no text output (${extracted.debug ?? "unknown"}). ` +
          `This usually means the worker model/provider is misconfigured or unavailable.`
      );
    }

    // Mark as ready again
    workerPool.updateStatus(workerId, "ready");
    instance.lastActivity = new Date();
    instance.currentTask = undefined;
    instance.warning = undefined;
    const durationMs = Date.now() - startedAt;
    instance.lastResult = {
      at: new Date(),
      jobId: options?.jobId ?? instance.lastResult?.jobId,
      response: responseText,
      report: instance.lastResult?.report,
      durationMs,
    };
    if (typeof instance.pid === "number") {
      await registerWorkerInDeviceRegistry({
        workerId,
        pid: instance.pid,
        url: instance.serverUrl,
        port: instance.port,
        sessionId: instance.sessionId,
        status: "ready",
        startedAt: instance.startedAt.getTime(),
      });
    }

    return { success: true, response: responseText };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    workerPool.updateStatus(workerId, "ready"); // Reset to ready so it can be used again
    instance.currentTask = undefined;
    instance.warning = instance.warning ?? `Last request failed: ${errorMsg}`;
    return { success: false, error: errorMsg };
  } finally {
    if (cleanupAttachments) {
      await cleanupAttachments();
    }
  }
}

/**
 * Spawn multiple workers sequentially by default (to avoid overwhelming system resources).
 * Each worker spawns its own MCP servers, so parallel spawning can be very expensive.
 */
export async function spawnWorkers(
  profiles: WorkerProfile[],
  options: SpawnOptions & { sequential?: boolean }
): Promise<{ succeeded: WorkerInstance[]; failed: Array<{ profile: WorkerProfile; error: string }> }> {
  const succeeded: WorkerInstance[] = [];
  const failed: Array<{ profile: WorkerProfile; error: string }> = [];

  // Default to sequential spawning to avoid resource contention
  const sequential = options.sequential !== false;

  if (sequential) {
    // Spawn one at a time to avoid resource contention
    for (const profile of profiles) {
      try {
        const instance = await spawnWorker(profile, options);
        succeeded.push(instance);
      } catch (err) {
        failed.push({
          profile,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } else {
    // Parallel spawning (use with caution)
    const results = await Promise.allSettled(
      profiles.map((profile) => spawnWorker(profile, options))
    );

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
  }

  return { succeeded, failed };
}

/**
 * List all reusable workers from the device registry (alive processes not yet in our registry).
 */
export async function listReusableWorkers(): Promise<DeviceRegistryWorkerEntry[]> {
  const entries = await listDeviceRegistry();
  const inRegistry = new Set([...workerPool.workers.keys()]);

  return entries.filter(
    (e): e is DeviceRegistryWorkerEntry =>
      e.kind === "worker" &&
      !inRegistry.has(e.workerId) &&
      (e.status === "ready" || e.status === "busy") &&
      isProcessAlive(e.pid)
  );
}

/**
 * Clean up all dead worker entries from the device registry.
 */
export async function cleanupDeadWorkers(): Promise<number> {
  const entries = await listDeviceRegistry();
  let cleaned = 0;

  for (const e of entries) {
    if (e.kind === "worker" && !isProcessAlive(e.pid)) {
      await removeWorkerEntriesByPid(e.pid).catch(() => {});
      cleaned++;
    }
  }

  return cleaned;
}
