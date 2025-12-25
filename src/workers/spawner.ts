/**
 * Worker Spawner - Creates and manages OpenCode worker instances
 *
 * NOTE: This module handles the low-level spawn and communication operations.
 * For worker lifecycle management (reuse, pooling, deduplication), use worker-pool.ts.
 */

import { createOpencodeClient } from "@opencode-ai/sdk";
import type { WorkerProfile, WorkerInstance } from "../types";
import { workerPool } from "../core/worker-pool";
import { hydrateProfileModelsFromOpencode } from "../models/hydrate";
import type { WorkerAttachment } from "./prompt";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { WorkerClient, type WorkerStreamUpdate } from "../core/worker-client";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ensureRuntime } from "../core/runtime";
import { getUserConfigDir } from "../helpers/format";
import { mergeOpenCodeConfig } from "../config/opencode";
import { getRepoContextForWorker } from "../ux/repo-context";
import { buildToolConfigFromPermissions, summarizePermissions } from "../permissions/validator";
import { ensureSupervisorWorker } from "../core/supervisor-client";

function shouldUseSupervisor(options?: { supervisorUrl?: string }): boolean {
  if (process.env.OPENCODE_SUPERVISOR_MODE === "1") return false;
  if (process.env.OPENCODE_ORCH_SUPERVISOR_DISABLED === "1") return false;
  if (options?.supervisorUrl) return true;
  if (process.env.OPENCODE_ORCH_SUPERVISOR_URL) return true;
  return process.env.OPENCODE_ORCH_SUPERVISOR_ENABLE === "1";
}

interface SpawnOptions {
  /** Base port to start from */
  basePort: number;
  /** Timeout for startup (ms) */
  timeout: number;
  /** Directory to run in */
  directory: string;
  /** Orchestrator client used to resolve model nodes (auto/node tags) */
  client?: any;
  /** Model selection preferences */
  modelSelection?: import("../types").OrchestratorConfig["modelSelection"];
  /** Model alias table */
  modelAliases?: import("../types").OrchestratorConfig["modelAliases"];
  /** Deprecated (device registry removed); no effect */
  reuseExisting?: boolean;
  /** Force local spawn even if a supervisor is available */
  forceLocal?: boolean;
  /** Optional supervisor URL override */
  supervisorUrl?: string;
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

// This module now handles only the core spawn operation

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
    // Allow workers to self-terminate if the orchestrator process disappears.
    OPENCODE_ORCH_PARENT_PID: String(process.pid),
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
  // When configured, delegate spawning to the external supervisor and attach to the ensured worker.
  if (!options.forceLocal && shouldUseSupervisor(options)) {
    const port = await ensureSupervisorWorker(profile, options).catch(() => undefined);
    if (port && Number.isFinite(port)) {
      return connectToWorker(profile, port);
    }
  }

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
    const isExplicitModel = modelSpec.includes("/");

    // When spawning from inside the plugin, we always pass the orchestrator client.
    // Without it, we can only accept fully-qualified provider/model IDs.
    if (!options.client) {
      if (isNodeTag || !isExplicitModel) {
        throw new Error(
          `Profile "${profile.id}" uses "${profile.model}", but model resolution is unavailable. ` +
            `Set a concrete provider/model ID for this profile.`
        );
      }
      return profile;
    }

    // Skip expensive provider resolution for explicit provider/model IDs.
    if (!isNodeTag && isExplicitModel) {
      return profile;
    }

    const { profiles } = await hydrateProfileModelsFromOpencode({
      client: options.client,
      directory: options.directory,
      profiles: { [profile.id]: profile },
      modelAliases: options.modelAliases,
      modelSelection: options.modelSelection,
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

  const toolConfig = buildToolConfigFromPermissions({
    permissions: resolvedProfile.permissions,
    baseTools: resolvedProfile.tools,
  });
  const permissionSummary = summarizePermissions(resolvedProfile.permissions);

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
        ...(toolConfig && { tools: toolConfig }),
        ...(resolvedProfile.permissions && { permissions: resolvedProfile.permissions }),
      },
      env: {
        OPENCODE_ORCH_BRIDGE_URL: rt.bridge.url,
        OPENCODE_ORCH_BRIDGE_TOKEN: rt.bridge.token,
        OPENCODE_ORCH_WORKER_ID: resolvedProfile.id,
        OPENCODE_ORCH_PROJECT_DIR: options.directory,
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
    const permissionsSection = permissionSummary
      ? `<worker-permissions>\n${permissionSummary}\n</worker-permissions>\n\n`
      : "";

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
                permissionsSection +
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
    onProgress?: (stage: string, percent?: number) => void;
    onStreamChunk?: (update: WorkerStreamUpdate) => void;
  }
): Promise<{ success: boolean; response?: string; error?: string }> {
  try {
    const client = new WorkerClient(workerPool, {
      workerId,
      timeoutMs: options?.timeout,
      onProgress: options?.onProgress,
      onStreamChunk: options?.onStreamChunk,
    });

    const result = await client.send(message, {
      attachments: options?.attachments,
      timeoutMs: options?.timeout,
      jobId: options?.jobId,
      from: options?.from,
      onProgress: options?.onProgress,
      onStreamChunk: options?.onStreamChunk,
    });

    return { success: result.success, response: result.response, error: result.error };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMsg };
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
