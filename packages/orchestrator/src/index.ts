import type { Plugin } from "@opencode-ai/plugin";
import { loadOrchestratorConfig } from "./config/orchestrator";
import {
  workerPool,
  removeSessionEntry,
  upsertSessionEntry,
} from "./core/worker-pool";
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
import {
  buildPassthroughSystemPrompt,
  clearPassthrough,
  getPassthrough,
  isPassthroughExitMessage,
} from "./core/passthrough";
import { buildMemoryInjection } from "./memory/inject";
import { loadPromptFile } from "./prompts/load";
import { createOrchestratorContext } from "./context/orchestrator-context";
import {
  createWorkflowTriggers,
  updateSelfImproveActivity,
} from "./workflows/triggers";
import { startEventPublisher } from "./ux/event-publisher";
import { injectSessionNotice } from "./ux/wakeup";
import {
  buildSkillCompletedPayload,
  buildSkillPermissionPayload,
  buildSkillRequestedPayload,
  getSkillNameFromArgs,
} from "./skills/events";
import { getWorkflowContextForSession } from "./skills/context";
import { publishOrchestratorEvent } from "./core/orchestrator-events";
import { workerJobs } from "./core/jobs";
import {
  buildLegacyToolCorrectionHint,
  buildPendingTaskReminder,
  needsLegacyToolCorrection,
} from "./core/guardrails";
import {
  buildDefaultOrchestratorPluginToolOverrides,
  DEFAULT_ORCHESTRATOR_AGENT_TOOL_FLAGS,
} from "./core/tool-defaults";

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
  setSpawnDefaults({
    basePort: config.basePort,
    timeout: config.startupTimeout,
  });
  setProfiles(config.profiles);
  setUiDefaults({ defaultListFormat: config.ui?.defaultListFormat });
  setLoggerConfig({ enabled: true });
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

  const coreOrchestratorTools =
    createCoreOrchestratorTools(orchestratorContext);

  // Initialize telemetry if enabled
  if (config.telemetry?.enabled !== false) {
    initTelemetry(config.telemetry?.apiKey, config.telemetry?.host);
  }

  const showToast = async (
    message: string,
    variant: "success" | "info" | "warning" | "error",
  ): Promise<void> => {
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
    const configured = config.ui?.visionTimeoutMs;
    if (typeof configured === "number" && Number.isFinite(configured)) {
      return configured > 0 ? configured : 300_000;
    }
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
      void showToast(
        `Worker "${instance.profile.name}" error: ${instance.error ?? "unknown"}`,
        "error",
      );
      trackSpawn(id, "error", { error: instance.error });
    }
  };

  const extractPendingVisionTaskId = (parts: any[]): string | undefined => {
    if (!Array.isArray(parts)) return undefined;
    for (const part of parts) {
      if (part?.type !== "text" || typeof part.text !== "string") continue;
      if (!part.text.includes("[VISION ANALYSIS PENDING]")) continue;
      const match = part.text.match(/task_await\(\{\s*taskId:\s*"([^"]+)"/);
      if (match?.[1]) return match[1];
    }
    return undefined;
  };

  const hasVisionAnalysis = (parts: any[]): boolean => {
    if (!Array.isArray(parts)) return false;
    return parts.some(
      (part) =>
        part?.type === "text" &&
        typeof part.text === "string" &&
        (part.text.includes("[VISION ANALYSIS]") ||
          part.text.includes("[VISION ANALYSIS FAILED]")),
    );
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
      const profilesToSpawn = config.spawn
        .map((id) => config.profiles[id])
        .filter(Boolean);
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
          succeeded.length > 0 ? "warning" : "error",
        );
      }
    })().catch((err) => {
      void showToast(
        `Auto-spawn failed: ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
    });
  }

  const idleNotifier = createIdleNotifier(
    ctx,
    config.notifications?.idle ?? {},
  );
  const pruneTransform = createPruningTransform(config.pruning);
  const visionProcessedMessageIds = new Set<string>();
  const workflowTriggers = createWorkflowTriggers(orchestratorContext, {
    visionTimeoutMs,
    processedMessageIds: visionProcessedMessageIds,
    showToast,
  });

  // visionMessageTransform: Only used to mark already-processed history messages.
  // It does NOT strip images or trigger analysis - that's handled in chat.message hook.
  const visionMessageTransform = async (
    _input: Record<string, unknown>,
    output: { messages: Array<{ info: any; parts: any[] }> },
  ) => {
    const messages = output.messages ?? [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const info = msg?.info ?? {};
      const messageId = typeof info?.id === "string" ? info.id : undefined;
      if (info?.role !== "user") continue;
      const parts = Array.isArray(msg?.parts) ? msg.parts : [];
      if (!hasImages(parts)) continue;

      // Skip if already processed
      if (messageId && visionProcessedMessageIds.has(messageId)) break;

      // Check if analysis was already injected (from previous session restore, etc.)
      const alreadyInjected = parts.some(
        (p: any) =>
          p?.type === "text" &&
          typeof p.text === "string" &&
          p.text.includes("[VISION ANALYSIS"),
      );
      if (alreadyInjected) {
        if (messageId) visionProcessedMessageIds.add(messageId);
        break;
      }

      // Do NOT strip images here - the chat.message hook handles that via triggers.handleVisionMessage
      break;
    }
  };
  const orchestratorAgentName = config.agent?.name ?? "orchestrator";
  const skillCalls = new Map<string, { startedAt: number; args?: unknown }>();

  const resolveSkillContext = (sessionId: string) => {
    const workerIds = workerPool.getWorkersForSession(sessionId);
    const workerId =
      workerIds.find((id) => workerPool.get(id)?.sessionId === sessionId) ??
      undefined;
    const worker = workerId ? workerPool.get(workerId) : undefined;
    const workflowContext = getWorkflowContextForSession(sessionId);
    return {
      workerId,
      workerKind: worker?.kind ?? worker?.profile.kind,
      workflowRunId: workflowContext?.runId,
      workflowStepId: workflowContext?.stepId,
      source: "in-process" as const,
    };
  };

  return {
    tool: coreOrchestratorTools,
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "skill") return;
      const startedAt = Date.now();
      const args = output.args;
      skillCalls.set(input.callID, { startedAt, args });

      const ctx = resolveSkillContext(input.sessionID);
      const payload = buildSkillRequestedPayload({
        sessionId: input.sessionID,
        callId: input.callID,
        args,
        context: ctx,
        timestamp: startedAt,
      });
      publishOrchestratorEvent("orchestra.skill.load.started", payload);
    },
    "tool.execute.after": async (input, output) => {
      if (input.tool !== "skill") return;
      const entry = skillCalls.get(input.callID);
      const startedAt = entry?.startedAt;
      const durationMs = startedAt ? Date.now() - startedAt : undefined;
      const args = entry?.args;
      skillCalls.delete(input.callID);

      const ctx = resolveSkillContext(input.sessionID);
      const isError =
        (output?.metadata &&
          typeof output.metadata === "object" &&
          (output.metadata as any).error) ||
        (output?.metadata &&
          typeof output.metadata === "object" &&
          (output.metadata as any).status === "error");
      const payload = buildSkillCompletedPayload({
        sessionId: input.sessionID,
        callId: input.callID,
        args,
        status: isError ? "error" : "success",
        durationMs,
        output: output?.output,
        metadata: output?.metadata,
        context: ctx,
        timestamp: Date.now(),
      });
      publishOrchestratorEvent(
        isError
          ? "orchestra.skill.load.failed"
          : "orchestra.skill.load.completed",
        payload,
      );
    },
    "permission.ask": async (input, output) => {
      if (input.type !== "skill") return;
      const ctx = resolveSkillContext(input.sessionID);
      const metadata = input.metadata as Record<string, unknown> | undefined;
      const skillName =
        (metadata && typeof metadata.name === "string" && metadata.name) ||
        (metadata && typeof metadata.skill === "string" && metadata.skill) ||
        (metadata &&
          typeof metadata.skillName === "string" &&
          metadata.skillName) ||
        (input.callID
          ? getSkillNameFromArgs(skillCalls.get(input.callID)?.args)
          : undefined);
      const payload = buildSkillPermissionPayload({
        sessionId: input.sessionID,
        permissionId: input.id,
        callId: input.callID,
        status: output.status,
        pattern: input.pattern,
        skillName: skillName,
        context: ctx,
        timestamp: Date.now(),
      });
      publishOrchestratorEvent("orchestra.skill.permission", payload);
    },
    config: async (opencodeConfig: Config) => {
      const providersFromConfig = (): Array<{
        id: string;
        models?: Record<string, unknown>;
      }> => {
        const out: Array<{ id: string; models?: Record<string, unknown> }> = [];
        const providerObj = (opencodeConfig as any).provider as
          | Record<string, any>
          | undefined;
        if (!providerObj || typeof providerObj !== "object") return out;
        for (const [id, cfg] of Object.entries(providerObj)) {
          if (!cfg || typeof cfg !== "object") continue;
          const models = (cfg as any).models;
          out.push({
            id,
            models: models && typeof models === "object" ? models : undefined,
          });
        }
        return out;
      };

      const resolveInConfig = (
        model: string | undefined,
      ): string | undefined => {
        if (!model) return undefined;
        if (model.startsWith("auto") || model.startsWith("node"))
          return undefined;
        if (model.startsWith("opencode/")) return model;
        const providers = providersFromConfig();
        const resolved = resolveModelRef(model, providers as any);
        if ("error" in resolved) return undefined;
        return resolved.full;
      };

      // macOS: ctrl+left/right are often reserved by Mission Control / desktop switching.
      // Override to alt+left/right by default to avoid a broken "child session switching" UX.
      if (process.platform === "darwin") {
        const keybinds = ((opencodeConfig as any).keybinds ?? {}) as Record<
          string,
          unknown
        >;
        const cycle = String(keybinds.session_child_cycle ?? "");
        const reverse = String(keybinds.session_child_cycle_reverse ?? "");
        const isMacBlocked = (v: string) =>
          v === "ctrl+right" || v === "ctrl+left";
        if (!cycle || isMacBlocked(cycle))
          keybinds.session_child_cycle = "alt+right";
        if (!reverse || isMacBlocked(reverse))
          keybinds.session_child_cycle_reverse = "alt+left";
        (opencodeConfig as any).keybinds = keybinds;
      }

      const isFullModel = (m: unknown): m is string =>
        typeof m === "string" &&
        m.includes("/") &&
        !m.startsWith("auto") &&
        !m.startsWith("node");
      const desiredOrchestratorModel = isFullModel(config.agent?.model)
        ? config.agent?.model
        : undefined;
      const resolvedOrchestratorModel = resolveInConfig(
        desiredOrchestratorModel,
      );

      if (config.agent?.enabled !== false) {
        const name = config.agent?.name ?? "orchestrator";
        const agentPrompt =
          config.agent?.prompt ?? (await loadPromptFile("orchestrator.md"));

        const existing = (opencodeConfig.agent ?? {}) as Record<string, any>;
        const prior = (existing[name] ?? {}) as Record<string, unknown>;
        const priorTools = (prior as any)?.tools;
        const priorPermission = (prior as any)?.permission;
        const pluginToolOverrides = buildDefaultOrchestratorPluginToolOverrides(
          Object.keys(coreOrchestratorTools),
        );
        const agentTools = config.agent?.tools ?? {
          // Keep the orchestrator focused on delegation (workers do the actual work).
          ...DEFAULT_ORCHESTRATOR_AGENT_TOOL_FLAGS,

          // Boil orchestrator plugin tools down to the async Task API by default.
          ...pluginToolOverrides,
        };
        const agentPermission =
          config.agent?.permission ??
          (priorPermission && typeof priorPermission === "object"
            ? priorPermission
            : undefined);
        opencodeConfig.agent = {
          ...existing,
          [name]: {
            ...prior,
            description:
              "Coordinates specialized workers for multi-agent workflows",
            model:
              resolvedOrchestratorModel ??
              desiredOrchestratorModel ??
              (opencodeConfig as any).model,
            prompt: agentPrompt,
            mode: config.agent?.mode ?? "primary",
            tools: {
              ...(priorTools && typeof priorTools === "object"
                ? priorTools
                : {}),
              ...agentTools,
            },
            ...(agentPermission ? { permission: agentPermission } : {}),
            ...(config.agent?.color ? { color: config.agent.color } : {}),
          },
        } as any;
      }

      // Optional: if enabled, also default the built-in `build` agent to the orchestrator model.
      if (
        config.agent?.applyToBuild === true &&
        (resolvedOrchestratorModel ?? desiredOrchestratorModel)
      ) {
        const agents = (opencodeConfig.agent ?? {}) as Record<string, any>;
        const buildAgent = agents.build;
        const target = resolvedOrchestratorModel ?? desiredOrchestratorModel!;
        if (buildAgent && typeof buildAgent === "object")
          buildAgent.model = target;
        if (!buildAgent) agents.build = { model: target };
        (opencodeConfig as any).agent = agents;
      }

      // Exclude orchestrator tools from non-orchestrator agents to prevent tool leakage
      {
        const orchestratorToolNames = Object.keys(coreOrchestratorTools);
        const toolExclusions = orchestratorToolNames.reduce(
          (acc, name) => {
            acc[name] = false;
            return acc;
          },
          {} as Record<string, boolean>,
        );

        const baseTools = (opencodeConfig as any).tools;
        (opencodeConfig as any).tools = {
          ...(baseTools && typeof baseTools === "object" ? baseTools : {}),
          ...toolExclusions,
        };

        const agents = (opencodeConfig.agent ?? {}) as Record<string, any>;
        for (const [agentName, agentConfig] of Object.entries(agents)) {
          if (agentName === orchestratorAgentName) continue;
          if (!agentConfig || typeof agentConfig !== "object") continue;
          agents[agentName] = {
            ...(agentConfig as any),
            tools: {
              ...(((agentConfig as any).tools ?? {}) as Record<
                string,
                unknown
              >),
              ...toolExclusions,
            },
          };
        }
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
            template: "Call task_list({ view: 'status', format: 'markdown' }).",
          },
          [`${prefix}dashboard`]: {
            description: "Show a compact worker dashboard (status + warnings)",
            template: "Call task_list({ view: 'status', format: 'markdown' }).",
          },
          [`${prefix}output`]: {
            description: "Show unified orchestrator output (jobs + logs)",
            template: "Call task_list({ view: 'output', format: 'markdown' }).",
          },
          [`${prefix}models`]: {
            description: "List available models from your OpenCode config",
            template: "Call task_list({ view: 'models', format: 'markdown' }).",
          },
          [`${prefix}worker-model`]: {
            description: "Set a worker's model (provider/model or tag)",
            template:
              "Call task_start({ kind: 'op', op: 'worker.model.set', task: 'worker.model.set', worker: { workerId: '<workerId>', model: '<model>' } }) and then task_await({ taskId: '<returned taskId>' }).",
          },
          [`${prefix}profiles`]: {
            description: "List available worker profiles",
            template:
              "Call task_list({ view: 'profiles', format: 'markdown' }).",
          },
          [`${prefix}workers`]: {
            description: "List running workers",
            template:
              "Call task_list({ view: 'workers', format: 'markdown' }).",
          },
        };

        if (config.workflows?.enabled !== false) {
          baseCommands[`${prefix}workflows`] = {
            description: "List available workflows",
            template:
              "Call task_list({ view: 'workflows', format: 'markdown' }).",
          };
          baseCommands[`${prefix}boomerang`] = {
            description:
              "Run the RooCode boomerang workflow (plan, implement, review, fix)",
            template:
              "Call task_start({ kind: 'workflow', workflowId: 'roocode-boomerang', task: '<task>' }) and then task_await({ taskId: '<returned taskId>' }).",
          };
        }

        opencodeConfig.command = {
          ...baseCommands,
          ...existing,
        } as any;
      }
    },
    "experimental.chat.system.transform": async (input, output) => {
      const sessionId = (input as any)?.sessionID as string | undefined;
      const agent = (input as any)?.agent as string | undefined;

      const passthrough = getPassthrough(sessionId);
      if (passthrough && agent === orchestratorAgentName) {
        output.system.push(
          await buildPassthroughSystemPrompt(passthrough.workerId),
        );
      }

      if (agent === orchestratorAgentName) {
        const reminder = buildPendingTaskReminder(sessionId);
        if (reminder) output.system.push(reminder);
      }

      if (
        config.memory?.enabled !== false &&
        config.memory?.autoInject !== false
      ) {
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
      output.system.push(
        workerPool.getSummary({
          maxWorkers: config.ui?.systemContextMaxWorkers ?? 12,
        }),
      );
    },
    "experimental.chat.messages.transform": async (input, output) => {
      await visionMessageTransform(input as any, output as any);
      await pruneTransform(input as any, output as any);
    },
    "chat.message": async (input, output) => {
      // Passthrough auto-exit (server-side): if the user issues an exit command, disable passthrough for this session.
      const role =
        typeof (input as any)?.role === "string"
          ? String((input as any).role)
          : undefined;
      if (role === "user") {
        updateSelfImproveActivity();
        void workflowTriggers.handleInfiniteOrchestraIdle();
        const passthrough = getPassthrough(input.sessionID);
        if (passthrough) {
          const parts = Array.isArray(output.parts) ? output.parts : [];
          const text = parts
            .filter(
              (p: any) => p?.type === "text" && typeof p.text === "string",
            )
            .map((p: any) => p.text)
            .join("\n");
          if (isPassthroughExitMessage(text)) {
            clearPassthrough(input.sessionID);
            void showToast("Passthrough disabled", "info");
          }
        }
      }

      if (role === "assistant") {
        const agentId =
          typeof (input as any)?.agent === "string"
            ? String((input as any).agent)
            : undefined;
        if (agentId === orchestratorAgentName) {
          const parts = Array.isArray(output.parts) ? output.parts : [];
          const text = parts
            .filter(
              (p: any) => p?.type === "text" && typeof p.text === "string",
            )
            .map((p: any) => p.text)
            .join("\n");
          const sessionId = (input as any)?.sessionID as string | undefined;
          if (sessionId && needsLegacyToolCorrection(text)) {
            void injectSessionNotice(
              orchestratorContext,
              sessionId,
              buildLegacyToolCorrectionHint(),
            );
          }
        }
      }

      await workflowTriggers.handleVisionMessage(input, output);
      const agentId =
        typeof (input as any)?.agent === "string"
          ? String((input as any).agent)
          : undefined;
      const pendingTaskId = extractPendingVisionTaskId((output as any)?.parts);
      if (
        pendingTaskId &&
        agentId === orchestratorAgentName &&
        !hasVisionAnalysis((output as any)?.parts)
      ) {
        try {
          const job = await workerJobs.await(pendingTaskId, {
            timeoutMs: visionTimeoutMs,
          });
          const analysisText =
            job?.responseText ??
            (job?.error ? `[VISION ANALYSIS FAILED]\n${job.error}` : undefined);
          if (analysisText) {
            const parts = Array.isArray((output as any)?.parts)
              ? (output as any).parts
              : [];
            parts.push({
              type: "text",
              text: analysisText,
              synthetic: true,
              sessionID: (input as any)?.sessionID ?? "",
              messageID: (input as any)?.messageID ?? "",
              id: `${(input as any)?.messageID ?? "msg"}-vision-analysis`,
            });
            (output as any).parts = parts;
          }
        } catch {
          // Keep placeholder; the orchestrator can still await manually if needed.
        }
      }
      await workflowTriggers.handleMemoryTurnEnd(input, output);
    },
    event: async ({ event }) => {
      if (event.type === "server.instance.disposed") {
        workerPool.off("update", onWorkerUpdate);
        workerPool.off("spawn", onWorkerUpdate);
        workerPool.off("stop", onWorkerRemove);
        stopEventPublisher();
        workflowTriggers.shutdown?.();
        await shutdownAllWorkers().catch(() => {});
        await flushTelemetry().catch(() => {});
      }
      if (
        event.type === "session.created" ||
        event.type === "session.updated"
      ) {
        const info = (event as any)?.properties?.info as any;
        if (
          info?.id &&
          typeof info.title === "string" &&
          typeof info.directory === "string"
        ) {
          await upsertSessionEntry({
            hostPid: process.pid,
            sessionId: info.id,
            title: info.title,
            directory: info.directory,
            createdAt:
              typeof info?.time?.created === "number"
                ? info.time.created
                : Date.now(),
          }).catch(() => {});
        }
      }
      if (event.type === "session.deleted") {
        const sessionId = (event as any)?.properties?.info?.id as
          | string
          | undefined;
        if (sessionId)
          await removeSessionEntry(sessionId, process.pid).catch(() => {});
        if (sessionId) {
          clearPassthrough(sessionId);
          const owned = workerPool.getWorkersForSession(sessionId);
          for (const workerId of owned) {
            await stopWorker(workerId).catch(() => {});
          }
          workerPool.clearSessionOwnership(sessionId);
        }
      }
      if (event.type === "session.idle") {
        await workflowTriggers.handleSelfImproveIdle();
        await workflowTriggers.handleInfiniteOrchestraIdle();
      }
      await idleNotifier({ event });
    },
  };
};

export default OrchestratorPlugin;

// Re-export types for external consumers (runtime values exported separately to avoid bundler issues)
export type { StreamChunk } from "./core/bridge-server";
