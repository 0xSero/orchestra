import type { Plugin } from "@opencode-ai/plugin";
import { loadOrchestratorConfig } from "./config/orchestrator";
import { workerPool, removeSessionEntry, upsertSessionEntry } from "./core/worker-pool";
import {
  createCoreOrchestratorTools,
  setClient,
  setDirectory,
  setProfiles,
  setProjectId,
  setSecurityConfig,
  setSpawnDefaults,
  setUiDefaults,
  setWorkflowConfig,
  setWorktree,
} from "./command";
import { spawnWorkers, stopWorker } from "./workers/spawner";
import type { WorkerInstance } from "./types";
import type { Config } from "@opencode-ai/sdk";
import { createIdleNotifier } from "./ux/idle-notification";
import { createPruningTransform } from "./ux/pruning";
import { hasImages } from "./vision/analyzer";

import { resolveModelRef } from "./models/catalog";
import { ensureRuntime, shutdownAllWorkers } from "./core/runtime";
import { setLoggerConfig } from "./core/logger";
import { loadWorkflows } from "./workflows";
import { initTelemetry, flushTelemetry, trackSpawn } from "./core/telemetry";
import { buildPassthroughSystemPrompt, clearPassthrough, getPassthrough, isPassthroughExitMessage } from "./core/passthrough";
import { buildMemoryInjection } from "./memory/inject";
import { loadPromptFile } from "./prompts/load";
import { createOrchestratorContext } from "./context/orchestrator-context";
import { createWorkflowTriggers } from "./workflows/triggers";
import { startEventPublisher } from "./ux/event-publisher";

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
  const runtime = await ensureRuntime();

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
  loadWorkflows(config);

  const orchestratorContext = createOrchestratorContext({
    directory: ctx.directory,
    worktree: ctx.worktree,
    projectId: ctx.project.id,
    client: ctx.client,
    config,
    runtime,
  });

  const coreOrchestratorTools = createCoreOrchestratorTools(orchestratorContext);

  // Initialize telemetry if enabled
  if (config.telemetry?.enabled !== false) {
    initTelemetry(config.telemetry?.apiKey, config.telemetry?.host);
  }

  const showToast = async (message: string, variant: "success" | "info" | "warning" | "error"): Promise<void> => {
    if (config.ui?.toasts === false) return;
    if (!ctx.client?.tui) return;
    try {
      await ctx.client.tui.showToast({ body: { message, variant } });
    } catch {
      // ignore toast failures
    }
  };
  const stopEventPublisher = startEventPublisher(showToast);

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


  // Auto-spawn workers if configured - single toast at the end
  if (config.autoSpawn && config.spawn.length > 0) {
    void (async () => {
      const profilesToSpawn = config.spawn.map((id) => config.profiles[id]).filter(Boolean);
      const { succeeded, failed } = await spawnWorkers(profilesToSpawn, {
        basePort: config.basePort,
        timeout: config.startupTimeout,
        directory: ctx.directory,
        client: ctx.client,
      });
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
  const workflowTriggers = createWorkflowTriggers(orchestratorContext, {
    visionTimeoutMs,
    processedMessageIds: visionProcessedMessageIds,
    showToast,
  });

  const isImagePart = (part: any): boolean => {
    if (!part || typeof part !== "object") return false;
    if (part.type === "image") return true;
    if (part.type === "file" && typeof part.mime === "string" && part.mime.startsWith("image/")) return true;
    if (part.type === "file" && typeof part.url === "string" && part.url.startsWith("data:image/")) return true;
    if (typeof part.url === "string" && (part.url === "clipboard" || part.url.startsWith("clipboard:"))) return true;
    return false;
  };

  const stripImageParts = (parts: any[]): { parts: any[]; stripped: boolean } => {
    if (!Array.isArray(parts)) return { parts, stripped: false };
    const withoutImages = parts.filter((p) => !isImagePart(p));
    if (withoutImages.length === parts.length) return { parts, stripped: false };
    const hasText = withoutImages.some((p) => p?.type === "text" && typeof p.text === "string" && p.text.trim().length > 0);
    if (hasText || withoutImages.length > 0) return { parts: withoutImages, stripped: true };
    return { parts: [{ type: "text", text: "[Image received]" }], stripped: true };
  };

  const visionMessageTransform = async (
    _input: Record<string, unknown>,
    output: { messages: Array<{ info: any; parts: any[] }> }
  ) => {
    const messages = output.messages ?? [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const info = msg?.info ?? {};
      const messageId = typeof info?.id === "string" ? info.id : undefined;
      if (info?.role !== "user") continue;
      const parts = Array.isArray(msg?.parts) ? msg.parts : [];
      if (!hasImages(parts)) continue;

      const agentId = typeof info?.agent === "string" ? info.agent : undefined;
      const agentProfile = agentId ? (config.profiles as any)?.[agentId] : undefined;
      const agentSupportsVision = Boolean(agentProfile?.supportsVision) || agentId === "vision";
      if (!agentSupportsVision) {
        const stripped = stripImageParts(parts);
        if (stripped.stripped) {
          msg.parts = stripped.parts;
        }
      } else {
        break;
      }

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
        const agentPrompt = config.agent?.prompt ?? (await loadPromptFile("orchestrator.md"));

        const existing = (opencodeConfig.agent ?? {}) as Record<string, any>;
        const prior = (existing[name] ?? {}) as Record<string, unknown>;
        const priorTools = (prior as any)?.tools;
        const priorPermission = (prior as any)?.permission;
        const agentTools = config.agent?.tools ?? {
          bash: false,
          edit: false,
          skill: false,
          webfetch: false,
        };
        const agentPermission = config.agent?.permission ?? (priorPermission && typeof priorPermission === "object" ? priorPermission : undefined);
        opencodeConfig.agent = {
          ...existing,
          [name]: {
            ...prior,
            description: "Coordinates specialized workers for multi-agent workflows",
            model: resolvedOrchestratorModel ?? desiredOrchestratorModel ?? (opencodeConfig as any).model,
            prompt: agentPrompt,
            mode: config.agent?.mode ?? "primary",
            tools: { ...(priorTools && typeof priorTools === "object" ? priorTools : {}), ...agentTools },
            ...(agentPermission ? { permission: agentPermission } : {}),
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
          profileCommands[`${prefix}trace.${profile.id}`] = {
            description: `Show recent trace for worker: ${profile.name} (${profile.id})`,
            template: `Call worker_trace({ workerId: '${profile.id}' }).`,
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

      await workflowTriggers.handleVisionMessage(input, output);
      await workflowTriggers.handleMemoryTurnEnd(input, output);
    },
    event: async ({ event }) => {
      if (event.type === "server.instance.disposed") {
        workerPool.off("update", onWorkerUpdate);
        workerPool.off("spawn", onWorkerUpdate);
        workerPool.off("stop", onWorkerRemove);
        stopEventPublisher();
        await shutdownAllWorkers().catch(() => {});
        await flushTelemetry().catch(() => {});
      }
      if (event.type === "session.created" || event.type === "session.updated") {
        const info = (event as any)?.properties?.info as any;
        if (info?.id && typeof info.title === "string" && typeof info.directory === "string") {
          await upsertSessionEntry({
            hostPid: process.pid,
            sessionId: info.id,
            title: info.title,
            directory: info.directory,
            createdAt: typeof info?.time?.created === "number" ? info.time.created : Date.now(),
          }).catch(() => {});
        }
      }
      if (event.type === "session.deleted") {
        const sessionId = (event as any)?.properties?.info?.id as string | undefined;
        if (sessionId) await removeSessionEntry(sessionId, process.pid).catch(() => {});
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
