import type { PluginInput } from "@opencode-ai/plugin";
import type { Factory, ServiceLifecycle } from "../types";
import type { OrchestratorConfig } from "../types";
import { createApi } from "../api";
import { createSkillsApiServer } from "../api/skills-server";
import { createCommunication } from "../communication";
import { createMemoryStore } from "../memory";
import { createWorkerManager } from "../workers";
import { createWorkflowEngine } from "../workflows/factory";
import { createOrchestrator } from "../orchestrator";
import { createTools } from "../tools";
import { setNeo4jIntegrationsConfig } from "../memory/neo4j";
import { getAllProfiles } from "../workers/profiles";
import { createSkillsService } from "../skills/service";
import {
  createVisionRoutingState,
  routeVisionMessage,
  syncVisionProcessedMessages,
  type VisionChatInput,
  type VisionChatOutput,
} from "../ux/vision-routing";
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export type CoreConfig = {
  ctx: PluginInput;
  config: OrchestratorConfig;
};

export type CoreHooks = {
  tool: Record<string, any>;
  config: any;
  "tool.execute.before": any;
  "chat.message": any;
  "experimental.chat.messages.transform": any;
  "experimental.chat.system.transform": any;
  "experimental.session.compacting": any;
};

export type CoreService = ServiceLifecycle & {
  hooks: CoreHooks;
  services: {
    api: ReturnType<typeof createApi>;
    communication: ReturnType<typeof createCommunication>;
    memory: ReturnType<typeof createMemoryStore>;
    workers: ReturnType<typeof createWorkerManager>;
    workflows: ReturnType<typeof createWorkflowEngine>;
    orchestrator: ReturnType<typeof createOrchestrator>;
    tools: ReturnType<typeof createTools>;
    skills: ReturnType<typeof createSkillsService>;
    skillsApi: ReturnType<typeof createSkillsApiServer>;
  };
};

export const createCore: Factory<CoreConfig, {}, CoreService> = ({ config }) => {
  setNeo4jIntegrationsConfig(config.config.integrations?.neo4j);

  const api = createApi({
    config: { directory: config.ctx.directory },
    deps: { client: config.ctx.client },
  });
  const communication = createCommunication({ config: {}, deps: { api } });
  const memory = createMemoryStore({ config: config.config.memory, deps: { api } });
  const baseProfiles = { ...config.config.profiles };
  const profiles = { ...baseProfiles };
  config.config.profiles = profiles;
  const projectDir = config.ctx.worktree || config.ctx.directory;
  const skills = createSkillsService(projectDir);
  const workers = createWorkerManager({
    config: {
      basePort: config.config.basePort,
      timeout: config.config.startupTimeout,
      directory: config.ctx.directory,
      profiles,
      modelSelection: config.config.modelSelection,
      modelAliases: config.config.modelAliases,
    },
    deps: { api, communication, memory },
  });
  const skillsApi = createSkillsApiServer({
    config: { enabled: true },
    deps: { skills, workers },
  });
  const workflows = createWorkflowEngine({ config: config.config.workflows, deps: {} });
  const orchestrator = createOrchestrator({ config: config.config, deps: { api, workers, workflows, communication } });
  const tools = createTools({ config: config.config, deps: { orchestrator, workers, workflows } });
  const visionState = createVisionRoutingState();
  const visionTimeoutMs = (() => {
    const raw = process.env.OPENCODE_VISION_TIMEOUT_MS;
    const value = raw ? Number(raw) : undefined;
    return Number.isFinite(value ?? NaN) && (value as number) > 0 ? (value as number) : 300_000;
  })();
  const visionPrompt = process.env.OPENCODE_VISION_PROMPT?.trim() || undefined;

  const writeVisionLog = async (entry: Record<string, unknown>) => {
    try {
      const logDir = join(projectDir, ".opencode", "vision");
      await mkdir(logDir, { recursive: true });
      const payload = { loggedAt: new Date().toISOString(), ...entry };
      await appendFile(join(logDir, "jobs.jsonl"), `${JSON.stringify(payload)}\n`);
    } catch {
      // ignore logging failures
    }
  };

  const visionDeps = {
    workers,
    ensureWorker: (input: { workerId: string; reason: "manual" | "on-demand" }) =>
      orchestrator.ensureWorker(input),
    profiles,
    communication,
    timeoutMs: visionTimeoutMs,
    ...(visionPrompt ? { prompt: visionPrompt } : {}),
    logSink: writeVisionLog,
  };

  const syncProfiles = (next: Record<string, typeof profiles[string]>) => {
    for (const key of Object.keys(profiles)) {
      delete profiles[key];
    }
    for (const [key, profile] of Object.entries(next)) {
      profiles[key] = profile;
    }
  };

  const refreshProfiles = async () => {
    // Pass existing profiles from config as base, then merge with any SKILL.md overrides
    const configProfilesArray = Object.values(baseProfiles).map((p) => ({ ...p }));
    const merged = await getAllProfiles(projectDir, configProfilesArray);
    syncProfiles(merged);
  };

  skills.events.on((event) => {
    if (event.type === "skill.created") {
      communication.emit("skill.created", { skill: event.skill }, { source: "orchestrator" });
    }
    if (event.type === "skill.updated") {
      communication.emit("skill.updated", { skill: event.skill }, { source: "orchestrator" });
    }
    if (event.type === "skill.deleted") {
      communication.emit("skill.deleted", { id: event.id, scope: event.scope }, { source: "orchestrator" });
    }
    void refreshProfiles().catch(() => {});
  });

  const start = async () => {
    await api.start();
    await communication.start();
    await memory.start();
    await refreshProfiles();
    await workers.start();
    await workflows.start();
    await orchestrator.start();

    // Start skills API in background (non-blocking)
    skillsApi.start().catch((err) => {
      console.log("[Core] Skills API failed to start (non-fatal):", err);
    });

    const toastsEnabled = config.config.ui?.toasts !== false;
    const showToast = (body: Parameters<typeof api.tui.showToast>[0]["body"]) => {
      if (!toastsEnabled) return;
      api.tui.showToast({ body }).catch((err) => console.log("[Toast] Failed:", err));
    };

    // Show startup toast
    const profileCount = Object.keys(profiles).length;
    const autoSpawn = config.config.spawn ?? [];
    showToast({
      title: "Orchestra Plugin Ready",
      message: `${profileCount} worker profiles loaded${autoSpawn.length > 0 ? `, auto-spawning: ${autoSpawn.join(", ")}` : ""}`,
      variant: "success",
    });

    // Emit startup event
    communication.emit(
      "orchestra.started",
      { profileCount, autoSpawn, fallbackModel: undefined },
      { source: "orchestrator" }
    );

    // Listen for model resolution events and show toasts
    communication.on("orchestra.model.resolved", (event) => {
      const { resolution } = event.data;
      showToast({
        title: `Model Resolved: ${resolution.profileId}`,
        message: `${resolution.from} → ${resolution.to}`,
        variant: "info",
      });
    });

    communication.on("orchestra.model.fallback", (event) => {
      const { profileId, model, reason } = event.data;
      showToast({
        title: `Model Fallback: ${profileId}`,
        message: `Using ${model} (${reason})`,
        variant: "warning",
      });
    });

    // Listen for worker spawn events and show toasts
    communication.on("orchestra.worker.spawned", (event) => {
      const { worker } = event.data;
      showToast({
        title: `Spawning: ${worker.profile.name}`,
        message: `Model: ${worker.profile.model}`,
        variant: "info",
      });
    });

    communication.on("orchestra.worker.reused", (event) => {
      const { worker } = event.data;
      showToast({
        title: `Reusing: ${worker.profile.name}`,
        message: `Port ${worker.port}`,
        variant: "info",
      });
    });

    communication.on("orchestra.worker.ready", (event) => {
      const { worker } = event.data;
      showToast({
        title: `Ready: ${worker.profile.name}`,
        message: `Port ${worker.port}`,
        variant: "success",
      });
    });

    communication.on("orchestra.worker.error", (event) => {
      const { worker, error } = event.data;
      showToast({
        title: `Worker Error: ${worker.profile.name}`,
        message: typeof error === "string" ? error : "Worker encountered an error",
        variant: "error",
      });
    });

    communication.on("orchestra.worker.stopped", (event) => {
      const { worker } = event.data;
      showToast({
        title: `Stopped: ${worker.profile.name}`,
        message: `Port ${worker.port}`,
        variant: "warning",
      });
    });

    communication.on("orchestra.worker.wakeup", (event) => {
      const { workerId, reason, summary } = event.data;
      showToast({
        title: `Worker Wakeup: ${workerId}`,
        message: summary ? `${reason}: ${summary}` : reason,
        variant: "info",
      });
    });

    communication.on("orchestra.worker.job", (event) => {
      const { job, status } = event.data;
      const label = status === "created" ? "Job Queued" : status === "succeeded" ? "Job Complete" : "Job Failed";
      const type = status === "failed" ? "error" : status === "succeeded" ? "success" : "info";
      showToast({
        title: `${label}: ${job.workerId}`,
        message: `Job ${job.id}`,
        variant: type,
      });
    });
  };

  const stop = async () => {
    await orchestrator.stop();
    await workflows.stop();
    await workers.stop();
    await skillsApi.stop();
    await memory.stop();
    await communication.stop();
    await api.stop();
  };

  const hooks: CoreHooks = {
    tool: tools.tool,
    config: async (input: { agent?: Record<string, unknown> }) => {
      // Inject the orchestrator agent if enabled in config
      const agentCfg = config.config.agent;
      if (agentCfg?.enabled !== false) {
        const agentName = agentCfg?.name ?? "orchestrator";
        input.agent = input.agent ?? {};
        input.agent[agentName] = {
          model: agentCfg?.model ?? "anthropic/claude-opus-4-5",
          mode: agentCfg?.mode ?? "primary",
          description: "OpenCode Orchestrator - Coordinates specialized AI workers for complex tasks",
          prompt: agentCfg?.prompt ?? undefined,
          ...(agentCfg?.color ? { color: agentCfg.color } : {}),
        };
      }
    },
    "tool.execute.before": tools.guard,
    "chat.message": async (input: VisionChatInput, output: VisionChatOutput) => {
      await routeVisionMessage(
        {
          sessionID: input.sessionID,
          agent: input.agent,
          messageID: input.messageID,
          role: (output as any)?.message?.role,
        },
        output as any,
        visionDeps,
        visionState
      );
    },
    "experimental.chat.messages.transform": async (
      _input: unknown,
      output: { messages: Array<{ info?: { id?: string; role?: string }; parts?: any[] }> }
    ) => {
      syncVisionProcessedMessages(output, visionState);
    },
    "experimental.chat.system.transform": tools.systemTransform,
    "experimental.session.compacting": tools.compaction,
  };

  return {
    hooks,
    services: { api, communication, memory, workers, workflows, orchestrator, tools, skills, skillsApi },
    start,
    stop,
    health: async () => ({ ok: true }),
  };
};
