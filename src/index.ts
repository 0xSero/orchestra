import type { Plugin } from "@opencode-ai/plugin";
import { loadOrchestratorConfig } from "./config/orchestrator";
import { workerPool } from "./core/worker-pool";
import {
  coreOrchestratorTools,
  setClient,
  setDirectory,
  setModelAliases,
  setModelSelection,
  setProfiles,
  setProjectId,
  setSecurityConfig,
  setSpawnDefaults,
  setUiDefaults,
  setWorkflowConfig,
  setWorktree,
} from "./tools";
import { setSpawnPolicy } from "./tools/state";
import { spawnWorker, stopWorker } from "./workers/spawner";
import type { WorkerInstance } from "./types";
import type { Config } from "@opencode-ai/sdk";
import { createIdleNotifier } from "./ux/idle-notification";
import { createPruningTransform } from "./ux/pruning";
import { hasImages, analyzeImages, formatVisionAnalysis, replaceImagesWithAnalysis } from "./ux/vision-router";

import { resolveModelRef } from "./models/catalog";
import { ensureRuntime, shutdownAllWorkers } from "./core/runtime";
import { setLoggerConfig } from "./core/logger";
import { loadWorkflows } from "./workflows";
import { recordMessageMemory } from "./memory/auto";
import { initTelemetry, flushTelemetry, trackSpawn } from "./core/telemetry";
import { orchestratorPrompt } from "../prompts/orchestrator";
import { workerJobs } from "./core/jobs";
import { buildPassthroughSystemPrompt, clearPassthrough, getPassthrough, isPassthroughExitMessage } from "./core/passthrough";
import { buildMemoryInjection } from "./memory/inject";
import { HealthMonitor, defaultHealthCheckConfig } from "./core/health-monitor";
import { warmPool } from "./core/warm-pool";
import { canReuseExisting } from "./core/spawn-policy";

export const OrchestratorPlugin: Plugin = async (ctx) => {
  // CRITICAL: Prevent recursive spawning - if this is a worker process, skip orchestrator initialization
  if (process.env.OPENCODE_ORCHESTRATOR_WORKER === "1") {
    return {}; // Return empty plugin - workers don't need orchestrator capabilities
  }

  const { config } = await loadOrchestratorConfig({
    directory: ctx.directory,
    worktree: ctx.worktree || undefined,
  });

  // Ensure the orchestrator runtime is online (bridge + cleanup handlers).
  await ensureRuntime();

  setDirectory(ctx.directory);
  setWorktree(ctx.worktree);
  setProjectId(ctx.project.id);
  setClient(ctx.client);
  setSpawnDefaults({ basePort: config.basePort, timeout: config.startupTimeout });
  setProfiles(config.profiles);
  setUiDefaults({ defaultListFormat: config.ui?.defaultListFormat });
  setLoggerConfig({});
  setWorkflowConfig(config.workflows);
  setSecurityConfig(config.security);
  setModelSelection(config.modelSelection);
  setModelAliases(config.modelAliases);
  setSpawnPolicy(config.spawnPolicy);
  loadWorkflows(config);

  const getAgentSupportsVision = async (agentId: string | undefined): Promise<boolean> => {
    const agentProfile = agentId ? (config.profiles as any)?.[agentId] : undefined;
    return agentId === "vision" || Boolean(agentProfile?.supportsVision);
  };

  // Start health monitoring if configured.
  const healthConfig = config.healthCheck ?? {
    enabled: true,
    intervalMs: config.healthCheckInterval,
    timeoutMs: defaultHealthCheckConfig.timeoutMs,
    maxRetries: defaultHealthCheckConfig.maxRetries,
  };
  const healthMonitor = new HealthMonitor(workerPool, healthConfig);
  healthMonitor.start();

  // Configure warm pool pre-spawns if enabled.
  warmPool.configure({
    config: config.warmPool,
    profiles: config.profiles,
    spawnOptions: {
      basePort: config.basePort,
      timeout: config.startupTimeout,
      directory: ctx.directory,
      client: ctx.client,
      modelSelection: config.modelSelection,
      modelAliases: config.modelAliases,
    },
    spawnFn: spawnWorker,
  });

  // Initialize telemetry if enabled
  if (config.telemetry?.enabled !== false) {
    initTelemetry(config.telemetry?.apiKey, config.telemetry?.host);
  }

  const showToast = async (message: string, variant: "success" | "info" | "warning" | "error") => {
    if (config.ui?.toasts === false) return;
    await ctx.client.tui.showToast({ body: { message, variant } }).catch(() => {});
  };

  const visionTimeoutMs = (() => {
    const raw = process.env.OPENCODE_VISION_TIMEOUT_MS;
    const ms = raw ? Number(raw) : 300_000;
    return Number.isFinite(ms) && ms > 0 ? ms : 300_000;
  })();


  const lastStatus = new Map<string, string>();
  const onWorkerUpdate = (instance: WorkerInstance) => {
    const id = instance.profile.id;
    const status = instance.status;
    const prev = lastStatus.get(id);
    if (prev === status) return;
    lastStatus.set(id, status);

    if (status === "ready") {
      // Track but don't toast individual workers - we toast once at the end
      if (prev === "starting") {
        trackSpawn(id, "ready", { model: instance.profile.model });
      }
    } else if (status === "error") {
      // Only toast errors - these are important
      void showToast(`Worker "${instance.profile.name}" error: ${instance.error ?? "unknown"}`, "error");
      trackSpawn(id, "error", { error: instance.error });
    }
  };
  const onWorkerRemove = (instance: WorkerInstance) => {
    lastStatus.delete(instance.profile.id);
  };
  workerPool.on("update", onWorkerUpdate);
  workerPool.on("spawn", onWorkerUpdate);
  workerPool.on("stop", onWorkerRemove);

  const injectOrchestratorNotice = async (sessionId: string | undefined, text: string): Promise<void> => {
    if (!sessionId || config.ui?.wakeupInjection === false) return;
    try {
      await ctx.client.session.prompt({
        path: { id: sessionId },
        body: { noReply: true, parts: [{ type: "text", text }] as any },
        query: { directory: ctx.directory },
      } as any);
    } catch {
      // Ignore injection failures (session may have ended, etc.)
    }
  };

  // Auto-spawn workers if configured - single toast at the end
  if (config.autoSpawn && config.spawn.length > 0) {
    void (async () => {
      const profilesToSpawn = config.spawn.map((id) => config.profiles[id]).filter(Boolean);
      const succeeded: WorkerInstance[] = [];
      const failed: Array<{ profile: WorkerInstance["profile"]; error: string }> = [];
      for (const profile of profilesToSpawn) {
        try {
          const instance = await spawnWorker(profile, {
            basePort: config.basePort,
            timeout: config.startupTimeout,
            directory: ctx.directory,
            client: ctx.client,
            modelSelection: config.modelSelection,
            modelAliases: config.modelAliases,
            reuseExisting: canReuseExisting(config.spawnPolicy, profile.id),
          });
          succeeded.push(instance);
        } catch (err) {
          failed.push({ profile, error: err instanceof Error ? err.message : String(err) });
        }
      }
      if (failed.length === 0) {
        void showToast(`Spawned ${succeeded.length} worker(s)`, "success");
      } else {
        void showToast(
          `Spawned ${succeeded.length} worker(s), ${failed.length} failed`,
          succeeded.length > 0 ? "warning" : "error"
        );
      }
    })().catch((err) => {
      void showToast(`Auto-spawn failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    });
  }

  const idleNotifier = createIdleNotifier(ctx, config.notifications?.idle ?? {});
  const pruneTransform = createPruningTransform(config.pruning);
  const visionProcessedMessageIds = new Set<string>();

  const visionMessageTransform = async (_input: {}, output: { messages: Array<{ info: any; parts: any[] }> }) => {
    const messages = output.messages ?? [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const info = msg?.info ?? {};
      const messageId = typeof info?.id === "string" ? info.id : undefined;
      if (info?.role !== "user") continue;
      const parts = Array.isArray(msg?.parts) ? msg.parts : [];
      if (!hasImages(parts)) continue;

      const agentId = typeof info?.agent === "string" ? info.agent : undefined;
      const agentSupportsVision = await getAgentSupportsVision(agentId);
      if (agentSupportsVision) break;

      if (messageId && visionProcessedMessageIds.has(messageId)) break;

      const alreadyInjected = parts.some(
        (p: any) => p?.type === "text" && typeof p.text === "string" && p.text.includes("[VISION ANALYSIS")
      );
      if (alreadyInjected) {
        if (messageId) visionProcessedMessageIds.add(messageId);
        break;
      }

      // IMPORTANT: This hook should not trigger new vision analysis.
      // It only marks already-processed history messages (those with [VISION ANALYSIS] injected).
      break;
    }
  };
  const orchestratorAgentName = config.agent?.name ?? "orchestrator";

  return {
    tool: coreOrchestratorTools,
    config: async (opencodeConfig: Config) => {
      const providersFromConfig = (): Array<{ id: string; models?: Record<string, unknown> }> => {
        const out: Array<{ id: string; models?: Record<string, unknown> }> = [];
        const providerObj = (opencodeConfig as any).provider as Record<string, any> | undefined;
        if (!providerObj || typeof providerObj !== "object") return out;
        for (const [id, cfg] of Object.entries(providerObj)) {
          if (!cfg || typeof cfg !== "object") continue;
          const models = (cfg as any).models;
          out.push({ id, models: (models && typeof models === "object") ? models : undefined });
        }
        return out;
      };

      const resolveInConfig = (model: string | undefined): string | undefined => {
        if (!model) return undefined;
        if (model.startsWith("auto") || model.startsWith("node")) return undefined;
        if (model.startsWith("opencode/")) return model;
        const providers = providersFromConfig();
        const resolved = resolveModelRef(model, providers as any);
        if ("error" in resolved) return undefined;
        return resolved.full;
      };

      // macOS: ctrl+left/right are often reserved by Mission Control / desktop switching.
      // Override to alt+left/right by default to avoid a broken "child session switching" UX.
      if (process.platform === "darwin") {
        const keybinds = ((opencodeConfig as any).keybinds ?? {}) as Record<string, unknown>;
        const cycle = String(keybinds.session_child_cycle ?? "");
        const reverse = String(keybinds.session_child_cycle_reverse ?? "");
        const isMacBlocked = (v: string) => v === "ctrl+right" || v === "ctrl+left";
        if (!cycle || isMacBlocked(cycle)) keybinds.session_child_cycle = "alt+right";
        if (!reverse || isMacBlocked(reverse)) keybinds.session_child_cycle_reverse = "alt+left";
        (opencodeConfig as any).keybinds = keybinds;
      }

      const isFullModel = (m: unknown): m is string =>
        typeof m === "string" && m.includes("/") && !m.startsWith("auto") && !m.startsWith("node");
        const desiredOrchestratorModel = isFullModel(config.agent?.model) ? config.agent?.model : undefined;
      const resolvedOrchestratorModel = resolveInConfig(desiredOrchestratorModel);

      if (config.agent?.enabled !== false) {
        const name = config.agent?.name ?? "orchestrator";
        const agentPrompt = config.agent?.prompt ?? orchestratorPrompt;

        const existing = (opencodeConfig.agent ?? {}) as Record<string, any>;
        const prior = (existing[name] ?? {}) as Record<string, unknown>;
        opencodeConfig.agent = {
          ...existing,
          [name]: {
            ...prior,
            description: "Coordinates specialized workers for multi-agent workflows",
            model: resolvedOrchestratorModel ?? desiredOrchestratorModel ?? (opencodeConfig as any).model,
            prompt: agentPrompt,
            mode: config.agent?.mode ?? "primary",
            ...(config.agent?.color ? { color: config.agent.color } : {}),
          },
        } as any;
      }

      // Optional: if enabled, also default the built-in `build` agent to the orchestrator model.
      if (config.agent?.applyToBuild === true && (resolvedOrchestratorModel ?? desiredOrchestratorModel)) {
        const agents = (opencodeConfig.agent ?? {}) as Record<string, any>;
        const buildAgent = agents.build;
        const target = resolvedOrchestratorModel ?? desiredOrchestratorModel!;
        if (buildAgent && typeof buildAgent === "object") buildAgent.model = target;
        if (!buildAgent) agents.build = { model: target };
        (opencodeConfig as any).agent = agents;
      }

      // Keep profile models as configured (often `node:*` or canonical IDs).
      // Resolution happens at spawn-time based on last-used model + configured providers.

      const toolDefaults: Record<string, boolean> = {
        enable_worker_agent: false,
        disable_worker_agent: false,
        list_worker_agents: false,
        orchestrator_output: false,
        orchestrator_results: false,
        orchestrator_diagnostics: false,
      };
      const existingTools = (opencodeConfig as any).tools;
      if (!existingTools || typeof existingTools !== "object") {
        (opencodeConfig as any).tools = { ...toolDefaults };
      } else {
        (opencodeConfig as any).tools = { ...toolDefaults, ...existingTools };
      }

      if (config.commands?.enabled !== false) {
        const prefix = config.commands?.prefix ?? "orchestrator.";
        const existing = (opencodeConfig.command ?? {}) as Record<string, any>;

        // Simplified commands - only essential ones
        const baseCommands: Record<string, any> = {
          [`${prefix}status`]: {
            description: "Show orchestrator status (workers, profiles, config)",
            template: "Call orchestrator_status({ format: 'markdown' }).",
          },
          [`${prefix}output`]: {
            description: "Show unified orchestrator output (jobs + logs)",
            template: "Call orchestrator_output({ format: 'markdown' }).",
          },
          [`${prefix}models`]: {
            description: "List available models from your OpenCode config",
            template: "Call list_models({ format: 'markdown' }).",
          },
          [`${prefix}profiles`]: {
            description: "List available worker profiles",
            template: "Call list_profiles({ format: 'markdown' }).",
          },
          [`${prefix}workers`]: {
            description: "List running workers",
            template: "Call list_workers({ format: 'markdown' }).",
          },
        };

        if (config.workflows?.enabled !== false) {
          baseCommands[`${prefix}workflows`] = {
            description: "List available workflows",
            template: "Call list_workflows({ format: 'markdown' }).",
          };
          baseCommands[`${prefix}boomerang`] = {
            description: "Run the RooCode boomerang workflow (plan, implement, review, fix)",
            template: "Call run_workflow({ workflowId: 'roocode-boomerang', task: '<task>' }).",
          };
        }

        const profileCommands: Record<string, any> = {};
        for (const profile of Object.values(config.profiles)) {
          profileCommands[`${prefix}spawn.${profile.id}`] = {
            description: `Spawn worker: ${profile.name} (${profile.id})`,
            template: `Call spawn_worker({ profileId: '${profile.id}' }).`,
          };
        }

        opencodeConfig.command = {
          ...baseCommands,
          ...profileCommands,
          ...existing,
        } as any;
      }
    },
    "experimental.chat.system.transform": async (input, output) => {
      const sessionId = (input as any)?.sessionID as string | undefined;
      const agent = (input as any)?.agent as string | undefined;

      const passthrough = getPassthrough(sessionId);
      if (passthrough && agent === orchestratorAgentName) {
        output.system.push(buildPassthroughSystemPrompt(passthrough.workerId));
      }

      if (config.memory?.enabled !== false && config.memory?.autoInject !== false) {
        const injected = await buildMemoryInjection({
          enabled: true,
          scope: (config.memory?.scope ?? "project") as any,
          projectId: ctx.project.id,
          sessionId,
          inject: config.memory?.inject,
        }).catch(() => undefined);
        if (injected) output.system.push(injected);
      }

      if (config.ui?.injectSystemContext === false) return;
      if (workerPool.workers.size === 0) return;
      output.system.push(workerPool.getSummary({ maxWorkers: config.ui?.systemContextMaxWorkers ?? 12 }));
    },
    "experimental.chat.messages.transform": async (input, output) => {
      await visionMessageTransform(input as any, output as any);
      await pruneTransform(input as any, output as any);
    },
    "chat.message": async (input, output) => {

      // Passthrough auto-exit (server-side): if the user issues an exit command, disable passthrough for this session.
      const role = typeof (input as any)?.role === "string" ? String((input as any).role) : undefined;
      if (role === "user") {
        const passthrough = getPassthrough(input.sessionID);
        if (passthrough) {
          const parts = Array.isArray(output.parts) ? output.parts : [];
          const text = parts
            .filter((p: any) => p?.type === "text" && typeof p.text === "string")
            .map((p: any) => p.text)
            .join("\n");
          if (isPassthroughExitMessage(text)) {
            clearPassthrough(input.sessionID);
            void showToast("Passthrough disabled", "info");
          }
        }
      }

      // Vision fallback: ensure current message parts are sanitized and analyzed.
      const originalParts = Array.isArray(output.parts) ? output.parts : [];
      if (hasImages(originalParts)) {
        const messageId = typeof input.messageID === "string" ? input.messageID : undefined;
        if (!messageId || !visionProcessedMessageIds.has(messageId)) {
          const agentSupportsVision = await getAgentSupportsVision(
            typeof input.agent === "string" ? input.agent : undefined
          );
          if (!agentSupportsVision) {
            // Do not block the user message on vision analysis.
            // Schedule analysis async, inject a placeholder immediately, then send a wakeup when done.
            const job = workerJobs.create({
              workerId: "vision",
              message: "auto: vision analysis",
              sessionId: input.sessionID,
              requestedBy: typeof input.agent === "string" ? input.agent : undefined,
            });

            // Get vision worker info for better UX
            const visionProfile = (config.profiles as any)?.["vision"] as { name?: string; model?: string } | undefined;
            const visionWorkerName = visionProfile?.name ?? "Vision Worker";
            const visionModel = visionProfile?.model ?? "vision model";

            // Clean, readable placeholder format
            const placeholder = [
              ``,
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
              `🔍 **Vision Analysis Pending**`,
              ``,
              `   Worker: ${visionWorkerName}`,
              `   Model:  ${visionModel}`,
              `   Job:    \`${job.id}\``,
              ``,
              `   → \`await_worker_job({ jobId: "${job.id}" })\``,
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
              ``,
            ].join("\n");

            output.parts = replaceImagesWithAnalysis(originalParts, placeholder, {
              sessionID: input.sessionID,
              messageID: input.messageID,
            });
            if (messageId) visionProcessedMessageIds.add(messageId);

            void (async () => {
              const result = await analyzeImages(originalParts, {
                spawnIfNeeded: true,
                directory: ctx.directory,
                client: ctx.client,
                basePort: config.basePort,
                timeout: visionTimeoutMs,
                profiles: config.profiles,
                showToast,
              });

              const analysisText =
                formatVisionAnalysis(result) ?? "[VISION ANALYSIS FAILED]\nVision analysis unavailable.";

              if (result.success) {
                workerJobs.setResult(job.id, { responseText: analysisText });
              } else {
                workerJobs.setError(job.id, { error: result.error ?? "Vision analysis failed" });
              }

              const reason = result.success ? "result_ready" : "error";
              const icon = result.success ? "✅" : "⚠️";
              const status = result.success ? "Complete" : "Failed";
              const detail = result.success ? "Analysis ready" : (result.error ?? "Vision analysis failed");
              const wakeupMessage = [
                `<orchestrator-internal kind="wakeup" workerId="vision" reason="${reason}" jobId="${job.id}">`,
                ``,
                `${icon} **Vision Analysis ${status}**`,
                ``,
                `   ${detail}`,
                `   Job: \`${job.id}\``,
                ``,
                `   → \`await_worker_job({ jobId: "${job.id}" })\``,
                ``,
                `</orchestrator-internal>`,
              ].join("\n");
              void injectOrchestratorNotice(input.sessionID, wakeupMessage);

              if (!result.success && result.error) {
                void showToast(`Vision analysis failed: ${result.error}`, "warning");
              }
            })().catch((err) => {
              const msg = err instanceof Error ? err.message : String(err);
              workerJobs.setError(job.id, { error: msg });
              const wakeupMessage = [
                `<orchestrator-internal kind="wakeup" workerId="vision" reason="error" jobId="${job.id}">`,
                ``,
                `❌ **Vision Analysis Error**`,
                ``,
                `   ${msg}`,
                `   Job: \`${job.id}\``,
                ``,
                `   → \`await_worker_job({ jobId: "${job.id}" })\``,
                ``,
                `</orchestrator-internal>`,
              ].join("\n");
              void injectOrchestratorNotice(input.sessionID, wakeupMessage);
              void showToast(`Vision analysis crashed: ${msg}`, "error");
            });
          }
        }
      }

      if (config.memory?.enabled !== false && config.memory?.autoRecord !== false) {
        const extractText = (msg: any): string => {
          if (!msg) return "";
          if (typeof msg.message === "string") return msg.message;
          if (typeof msg.content === "string") return msg.content;
          if (typeof msg.text === "string") return msg.text;
          const parts = Array.isArray(msg.parts) ? msg.parts : Array.isArray(msg.content?.parts) ? msg.content.parts : [];
          if (Array.isArray(parts)) {
            return parts.map((p: any) => (p?.type === "text" && typeof p.text === "string" ? p.text : "")).join("\n");
          }
          return "";
        };

        const text = extractText(input);
        if (text) {
          void recordMessageMemory({
            text,
            sessionId: input.sessionID,
            messageId: input.messageID,
            role: typeof (input as any).role === "string" ? (input as any).role : undefined,
            userId: typeof input.agent === "string" ? input.agent : undefined,
            scope: config.memory?.scope ?? "project",
            projectId: ctx.project.id,
            maxChars: config.memory?.maxChars,
            summaries: config.memory?.summaries,
            trim: config.memory?.trim,
          });
        }
      }
    },
    event: async ({ event }) => {
      if (event.type === "server.instance.disposed") {
        workerPool.off("update", onWorkerUpdate);
        workerPool.off("spawn", onWorkerUpdate);
        workerPool.off("stop", onWorkerRemove);
        healthMonitor.stop();
        warmPool.stop();
        await shutdownAllWorkers().catch(() => {});
        await flushTelemetry().catch(() => {});
      }
      if (event.type === "session.deleted") {
        const sessionId = (event as any)?.properties?.info?.id as string | undefined;
        if (sessionId) {
          clearPassthrough(sessionId);
          const owned = workerPool.getWorkersForSession(sessionId);
          for (const workerId of owned) {
            await stopWorker(workerId).catch(() => {});
          }
          workerPool.clearSessionOwnership(sessionId);
        }
      }
      await idleNotifier({ event });
    },
  };
};

export default OrchestratorPlugin;

// Re-export types for external consumers (runtime values exported separately to avoid bundler issues)
export type { StreamChunk } from "./core/bridge-server";
