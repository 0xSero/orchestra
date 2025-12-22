/**
 * Worker Spawner - Creates and manages OpenCode worker instances
 */

import { createOpencodeClient } from "@opencode-ai/sdk";
import type { WorkerProfile, WorkerInstance } from "../types";
import { registry } from "../core/registry";
import { hydrateProfileModelsFromOpencode } from "../models/hydrate";
import { buildPromptParts, extractTextFromPromptResponse, type WorkerAttachment } from "./prompt";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ensureRuntime, registerWorkerInDeviceRegistry } from "../core/runtime";
import { listDeviceRegistry, removeWorkerEntriesByPid, type DeviceRegistryWorkerEntry } from "../core/device-registry";
import { getUserConfigDir } from "../helpers/format";
import { withWorkerProfileLock } from "../core/profile-lock";
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

const inFlightSpawns = new Map<string, Promise<WorkerInstance>>();

function isValidPort(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 65535;
}

function parseProviderId(model: string): { providerId?: string; modelKey?: string } {
  const slash = model.indexOf("/");
  if (slash > 0) return { providerId: model.slice(0, slash), modelKey: model.slice(slash + 1) };
  return {};
}

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

const workerBridgeToolIds = ["message_tool", "worker_inbox", "wakeup_orchestrator"] as const;

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

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Find an existing worker from the device registry that matches the profile
 * and is still alive.
 */
async function findExistingWorker(
  profileId: string
): Promise<DeviceRegistryWorkerEntry | undefined> {
  const entries = await listDeviceRegistry();
  const candidates = entries.filter(
    (e): e is DeviceRegistryWorkerEntry =>
      e.kind === "worker" &&
      e.workerId === profileId &&
      (e.status === "ready" || e.status === "busy") &&
      isProcessAlive(e.pid)
  );
  // Prefer the most recently updated entry
  candidates.sort((a, b) => b.updatedAt - a.updatedAt);
  return candidates[0];
}

/**
 * Try to reconnect to an existing worker process instead of spawning a new one.
 * Returns undefined if reconnection fails or no suitable worker exists.
 */
async function tryReuseExistingWorker(
  profile: WorkerProfile,
  directory: string
): Promise<WorkerInstance | undefined> {
  const existing = await findExistingWorker(profile.id);
  if (!existing || !existing.url) return undefined;

  try {
    const client = createOpencodeClient({ baseUrl: existing.url });

    // Verify the worker is still responsive and get existing sessions
    const sessionsResult = await Promise.race([
      client.session.list({ query: { directory } } as any),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Health check timeout")), 3000)
      ),
    ]);

    if (!sessionsResult.data) return undefined;

    const sessions = sessionsResult.data as Array<{ id: string }>;

    const toolCheck = await checkWorkerBridgeTools(client, directory).catch(() => undefined);
    if (toolCheck && !toolCheck.ok) {
      await client.instance.dispose({ query: { directory } } as any).catch(() => {});
      await removeWorkerEntriesByPid(existing.pid).catch(() => {});
      return undefined;
    }

    // Determine which session to use:
    // 1. Prefer the session stored in registry (continuity)
    // 2. Fall back to first existing session
    // 3. Create new session only if none exist
    let sessionId: string | undefined;

    if (existing.sessionId && sessions.some((s) => s.id === existing.sessionId)) {
      // Stored session still exists, reuse it
      sessionId = existing.sessionId;
    } else if (sessions.length > 0) {
      // Use first available session
      sessionId = sessions[0].id;
    } else {
      // No sessions exist, create a new one
      const newSession = await client.session.create({
        body: { title: `Worker: ${profile.name}` },
        query: { directory },
      });
      if (!newSession.data) return undefined;
      sessionId = newSession.data.id;
    }

    const instance: WorkerInstance = {
      profile,
      status: existing.status === "busy" ? "busy" : "ready",
      port: existing.port ?? 0,
      serverUrl: existing.url,
      directory,
      startedAt: new Date(existing.startedAt),
      lastActivity: new Date(),
      client,
      pid: existing.pid,
      sessionId,
      modelResolution: "reused existing worker",
    };

    // Register in the in-memory registry
    registry.register(instance);

    // Update device registry with current session
    await registerWorkerInDeviceRegistry({
      workerId: profile.id,
      pid: existing.pid,
      url: existing.url,
      port: existing.port,
      sessionId,
      status: instance.status,
      startedAt: existing.startedAt,
    }).catch(() => {});

    return instance;
  } catch {
    // Worker is dead or unresponsive, clean up the stale entry
    await removeWorkerEntriesByPid(existing.pid).catch(() => {});
    return undefined;
  }
}

async function spawnOpencodeServe(options: {
  hostname: string;
  port: number;
  timeout: number;
  config: Record<string, unknown>;
  env: Record<string, string | undefined>;
}): Promise<{ url: string; proc: ChildProcess; close: () => Promise<void> }> {
  // CRITICAL: Mark this as a worker process to prevent recursive spawning.
  // Workers should NOT load the orchestrator plugin or spawn more workers.
  const workerEnv = {
    ...process.env,
    ...options.env,
    OPENCODE_CONFIG_CONTENT: JSON.stringify(options.config ?? {}),
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
 * Spawn a new worker instance, or reuse an existing one if available.
 */
export async function spawnWorker(
  profile: WorkerProfile,
  options: SpawnOptions & { forceNew?: boolean }
): Promise<WorkerInstance> {
  // First, check if we already have this worker in our in-memory registry
  const existingInRegistry = registry.getWorker(profile.id);
  if (existingInRegistry && existingInRegistry.status !== "error" && existingInRegistry.status !== "stopped") {
    return existingInRegistry;
  }

  // De-dupe concurrent spawn requests in-process (per worker profile).
  // This enforces a hard "1 opencode session per profile" rule.
  const inFlight = inFlightSpawns.get(profile.id);
  if (inFlight) {
    return inFlight;
  }

  const spawnPromise = (async () => {
    // Try to reuse an existing worker from device registry (cross-session reuse)
    const reused = await tryReuseExistingWorker(profile, options.directory);
    if (reused) return reused;

    return await withWorkerProfileLock(
      profile.id,
      // Lock should cover the entire "reuse-or-spawn" flow to enforce "1 opencode session per profile" across processes.
      { timeoutMs: Math.max(15_000, options.timeout + 15_000) },
      async () => {
        // After waiting on the lock, re-check reuse. Another orchestrator may have spawned it.
        const reusedAfterLock = await tryReuseExistingWorker(profile, options.directory);
        if (reusedAfterLock) return reusedAfterLock;

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
        registry.register(instance);

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
          instance.shutdown = close;
          instance.pid = proc.pid ?? undefined;
          instance.serverUrl = url;

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

    // Preflight provider availability to avoid "ready but never responds" workers.
    // Note: We no longer warn about "api" sourced providers because:
    // 1. The warning is a false positive when env vars provide credentials
    // 2. The warning gets cleared after first successful response anyway
    // 3. If the provider truly isn't configured, the worker will fail with a clear error
    const { providerId, modelKey } = parseProviderId(resolvedProfile.model);
    if (providerId) {
      const providersRes = await client.config.providers({ query: { directory: options.directory } });
      const providers = (providersRes.data as any)?.providers as Array<{ id: string; models?: Record<string, unknown>; source?: string; key?: string }> | undefined;
      const provider = providers?.find((p) => p.id === providerId) as any;
      if (!provider) {
        throw new Error(
          `Provider "${providerId}" is not configured for this worker (model: "${resolvedProfile.model}"). ` +
            `Update your OpenCode config/providers or override the profile model.`
        );
      }
      // Only warn if model doesn't exist in provider's model catalog
      if (modelKey && provider.models && typeof provider.models === "object") {
        const modelMap = provider.models as Record<string, unknown>;
        const candidates = new Set([
          resolvedProfile.model,
          modelKey,
          `${providerId}/${modelKey}`,
          `${providerId}:${modelKey}`,
        ]);
        const found = [...candidates].some((k) => k in modelMap);
        if (!found) {
          // Don't warn - model catalogs can be incomplete. If the model doesn't work,
          // the worker will fail with a clear error message.
        }
      }
    }

    // If we used a dynamic port, update the instance.port to the actual one.
    if (!fixedPort) {
      try {
        const u = new URL(url);
        const actualPort = Number(u.port);
        if (Number.isFinite(actualPort) && actualPort > 0) {
          instance.port = actualPort;
          registry.updateStatus(resolvedProfile.id, "starting");
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
                `You have these tools for communicating with the orchestrator and other workers:\n\n` +
                `1. **message_tool** - Send reports or messages\n` +
                `   - kind="report": Use at END of every task. Include summary, details, issues.\n` +
                `   - kind="message": Send to another worker or the orchestrator. Set "to" field.\n\n` +
                `2. **worker_inbox** - Check for messages from other workers or the orchestrator\n` +
                `   - Call this if you need to check for incoming messages\n` +
                `   - Use "after" param to get only new messages\n\n` +
                `3. **wakeup_orchestrator** - CRITICAL for async jobs!\n` +
                `   - Call this when you complete an async job (reason="result_ready")\n` +
                `   - Call this if you need attention (reason="needs_attention")\n` +
                `   - Call this on errors (reason="error")\n` +
                `   - Include the jobId if one was provided\n\n` +
                `## Required Behavior\n\n` +
                `1. At the END of every task, call message_tool with kind="report"\n` +
                `2. If you received a jobId in <orchestrator-job>, include it in your report AND call wakeup_orchestrator\n` +
                `3. If you need to communicate with another worker, use message_tool with kind="message"\n` +
                `4. Check worker_inbox if you're waiting for responses from other agents\n` +
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
        registry.updateStatus(resolvedProfile.id, "ready");
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
          registry.updateStatus(resolvedProfile.id, "error", errorMsg);
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
    );
  })();

  inFlightSpawns.set(profile.id, spawnPromise);
  try {
    const result = await spawnPromise;
    return result;
  } finally {
    if (inFlightSpawns.get(profile.id) === spawnPromise) {
      inFlightSpawns.delete(profile.id);
    }
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

  registry.register(instance);

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
export async function stopWorker(workerId: string): Promise<boolean> {
  const instance = registry.getWorker(workerId);
  if (!instance) {
    return false;
  }

  try {
    // The SDK doesn't expose a direct shutdown, but we can mark it stopped
    await instance.shutdown?.();
    instance.status = "stopped";
    registry.updateStatus(workerId, "stopped");
    registry.unregister(workerId);
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

  // Mark as busy
  registry.updateStatus(workerId, "busy");
  instance.currentTask = message.slice(0, 140);

  try {
    const startedAt = Date.now();
    
    // Build source identification for the message
    const sourceFrom = options?.from ?? "orchestrator";
    const jobIdStr = options?.jobId ?? "none";
    const sourceInfo = `<message-source from="${sourceFrom}" jobId="${jobIdStr}">\nThis message was sent by ${sourceFrom === "orchestrator" ? "the orchestrator" : `worker "${sourceFrom}"`}.\n</message-source>\n\n`;
    
    // Build the full task text with source info and job instructions
    let taskText = sourceInfo + message;
    if (options?.jobId) {
      taskText += `\n\n<orchestrator-job id="${options.jobId}">IMPORTANT: When done, call wakeup_orchestrator with reason="result_ready" and this jobId, then call message_tool with kind="report".</orchestrator-job>`;
    }
    
    const parts = await buildPromptParts({ message: taskText, attachments: options?.attachments });

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

    const extracted = extractTextFromPromptResponse(result.data);
    let responseText = extracted.text.trim();
    if (responseText.length === 0) {
      // Fallback: some providers emit only reasoning parts.
      const data: any = result.data as any;
      const parts = Array.isArray(data?.parts) ? data.parts : [];
      const reasoning = parts.filter((p: any) => p?.type === "reasoning" && typeof p.text === "string").map((p: any) => p.text).join("\n");
      responseText = reasoning.trim();
    }
    if (responseText.length === 0) {
      throw new Error(
        `Worker returned no text output (${extracted.debug ?? "unknown"}). ` +
          `This usually means the worker model/provider is misconfigured or unavailable.`
      );
    }

    // Mark as ready again
    registry.updateStatus(workerId, "ready");
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
    registry.updateStatus(workerId, "ready"); // Reset to ready so it can be used again
    instance.currentTask = undefined;
    instance.warning = instance.warning ?? `Last request failed: ${errorMsg}`;
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

/**
 * List all reusable workers from the device registry (alive processes not yet in our registry).
 */
export async function listReusableWorkers(): Promise<DeviceRegistryWorkerEntry[]> {
  const entries = await listDeviceRegistry();
  const inRegistry = new Set([...registry.workers.keys()]);

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
