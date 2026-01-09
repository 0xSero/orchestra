import type { FilePartInput, OpencodeClient, TextPartInput } from "@opencode-ai/sdk/client";
import type { SetStoreFunction } from "solid-js/store";
import { produce } from "solid-js/store";
import type { WorkerState } from "@/types/db";
import {
  buildAttachmentParts,
  buildModelOptions,
  createEventItem,
  extractMessagesAndParts,
  extractSkillLoadEventFromEvent,
  extractWorkerSnapshotFromEvent,
  extractProvidersPayload,
  extractToolIdsPayload,
  extractWorkerStreamChunkFromEvent,
  isWorkerStatus,
  toWorkerRuntime,
} from "./opencode-helpers";
import type {
  JobRecord,
  JobStatus,
  OpenCodeEventItem,
  OpenCodeState,
  OrchestratorEvent,
  Session,
  WorkerStreamChunk,
  WorkflowRun,
  WorkflowRunStep,
} from "./opencode-types";
import type { OrchestratorBridgeClient } from "../lib/orchestrator-bridge";

type ActionDeps = {
  client: OpencodeClient;
  state: OpenCodeState;
  setState: SetStoreFunction<OpenCodeState>;
  orchestratorClient?: OrchestratorBridgeClient;
};

export function createOpenCodeActions({ client, state, setState, orchestratorClient }: ActionDeps) {
  const asRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
  const isJobStatus = (value: unknown): value is JobStatus =>
    value === "running" || value === "succeeded" || value === "failed" || value === "canceled";

  const fetchCatalog = async () => {
    const [providersRes, toolIdsRes] = await Promise.allSettled([client.config.providers(), client.tool.ids()]);
    const providersPayload = providersRes.status === "fulfilled" ? providersRes.value.data : undefined;
    const toolIdsPayload = toolIdsRes.status === "fulfilled" ? toolIdsRes.value.data : undefined;

    if (providersRes.status === "rejected") {
      console.error("[opencode] Failed to fetch providers:", providersRes.reason);
    }
    if (toolIdsRes.status === "rejected") {
      console.error("[opencode] Failed to fetch tool IDs:", toolIdsRes.reason);
    }

    const providers = extractProvidersPayload(providersPayload);
    const modelOptions = buildModelOptions(providers);
    const toolIds = extractToolIdsPayload(toolIdsPayload);

    setState(
      produce((s) => {
        s.modelOptions = modelOptions;
        s.toolIds = toolIds;
      }),
    );
  };
  const fetchMessages = async (sessionId: string) => {
    try {
      const res = await client.session.messages({ path: { id: sessionId } });
      const rawData = res.data;

      if (!rawData) {
        console.log(`[opencode] No message data for session ${sessionId}`);
        return;
      }

      const { messages, parts: allParts } = extractMessagesAndParts(rawData);

      setState(
        produce((s) => {
          s.messages[sessionId] = messages;
          const messageIds = new Set(messages.map((m) => m.id));
          for (const id of messageIds) {
            delete s.parts[id];
          }
          for (const part of allParts) {
            if (!s.parts[part.messageID]) {
              s.parts[part.messageID] = [];
            }
            s.parts[part.messageID].push(part);
          }
        }),
      );

      console.log(`[opencode] Loaded ${messages.length} messages for session ${sessionId}`);
    } catch (err) {
      console.error(`[opencode] Failed to fetch messages for ${sessionId}:`, err);
    }
  };
  const fetchAll = async (includeMessages = false) => {
    try {
      const [sessionsRes, agentsRes] = await Promise.all([client.session.list(), client.app.agents()]);
      const sessions = (sessionsRes.data as Session[] | undefined) ?? [];
      const agents = agentsRes.data ?? [];

      setState(
        produce((s) => {
          s.connected = true;
          s.agents = agents;
          s.sessions = {};
          for (const session of sessions) {
            s.sessions[session.id] = session;
          }
          s.lastUpdate = Date.now();
        }),
      );

      console.log("[opencode] Fetched:", {
        sessions: sessions.length,
        agents: agents.length,
      });

      if (includeMessages && sessions.length > 0) {
        console.log("[opencode] Fetching messages for all sessions...");
        await Promise.all(sessions.map((session) => fetchMessages(session.id)));
        console.log("[opencode] All session messages loaded");
      }
    } catch (err) {
      console.error("[opencode] Failed to fetch data:", err);
      setState("connected", false);
    }
  };
  const pushEvent = (payload: OpenCodeEventItem["payload"]) => {
    const item = createEventItem(payload);
    setState(
      produce((s) => {
        s.events = [item, ...s.events].slice(0, 200);
      }),
    );
  };
  const upsertSession = (session?: Session) => {
    if (!session?.id) return;
    setState(
      produce((s) => {
        s.sessions[session.id] = session;
        s.lastUpdate = Date.now();
      }),
    );
  };
  const removeSession = (sessionId: string) => {
    setState(
      produce((s) => {
        delete s.sessions[sessionId];
        delete s.messages[sessionId];
        s.lastUpdate = Date.now();
      }),
    );
  };
  const upsertWorker = (raw: unknown) => {
    const next = toWorkerRuntime(raw);
    if (!next) return;
    setState(
      produce((s) => {
        s.workers[next.id] = next;
      }),
    );
  };
  const handleWorkerStream = (chunk: WorkerStreamChunk | null) => {
    if (!chunk) return;
    setState(
      produce((s) => {
        if (chunk.final) {
          // Store final response, then clear after a delay
          s.workerStreams[chunk.workerId] = chunk;
          // Schedule cleanup after 5 seconds so UI can show final state
          setTimeout(() => {
            setState(
              produce((s2) => {
                if (s2.workerStreams[chunk.workerId]?.timestamp === chunk.timestamp) {
                  delete s2.workerStreams[chunk.workerId];
                }
              }),
            );
          }, 5000);
        } else {
          // Streaming in progress
          s.workerStreams[chunk.workerId] = chunk;
        }
      }),
    );
  };
  const hydrateWorkers = (states: WorkerState[]) => {
    if (!states || states.length === 0) return;
    setState(
      produce((s) => {
        for (const stateItem of states) {
          const id = stateItem.workerId;
          if (!id || s.workers[id]) continue;
          const status = isWorkerStatus(stateItem.status) ? stateItem.status : "starting";
          s.workers[id] = {
            id,
            name: stateItem.profileName ?? id,
            status,
            sessionId: stateItem.uiSessionId ?? stateItem.sessionId ?? undefined,
            workerSessionId: stateItem.sessionId ?? undefined,
            parentSessionId: stateItem.parentSessionId ?? undefined,
            model: stateItem.model ?? undefined,
            serverUrl: stateItem.serverUrl ?? undefined,
            lastActivity: stateItem.lastActivity ?? undefined,
            currentTask: stateItem.currentTask ?? undefined,
            lastResult: stateItem.lastResult ?? undefined,
            error: stateItem.error ?? undefined,
            warning: stateItem.warning ?? undefined,
          };
        }
      }),
    );
  };
  const upsertWorkflowRun = (run: WorkflowRun) => {
    setState(
      produce((s) => {
        s.workflowRuns[run.runId] = run;
      }),
    );
  };
  const updateWorkflowRunFromEvent = (event: OrchestratorEvent) => {
    if (!event.type.startsWith("orchestra.workflow.")) return;
    const data = event.data;
    if (!asRecord(data)) return;

    const runId = typeof data.runId === "string" ? data.runId : "";
    if (!runId) return;
    const workflowId = typeof data.workflowId === "string" ? data.workflowId : "unknown";
    const workflowName = typeof data.workflowName === "string" ? data.workflowName : undefined;

    if (event.type === "orchestra.workflow.started") {
      const startedAt = typeof data.startedAt === "number" ? data.startedAt : event.timestamp;
      upsertWorkflowRun({
        runId,
        workflowId,
        workflowName,
        status: "running",
        startedAt,
        steps: [],
      });
      return;
    }

    if (event.type === "orchestra.workflow.step") {
      const stepId = typeof data.stepId === "string" ? data.stepId : "";
      const workerId = typeof data.workerId === "string" ? data.workerId : "";
      if (!stepId || !workerId) return;
      const stepStatus = data.status === "error" ? "error" : "success";
      const startedAt = typeof data.startedAt === "number" ? data.startedAt : event.timestamp;
      const finishedAt = typeof data.finishedAt === "number" ? data.finishedAt : event.timestamp;
      const durationMs =
        typeof data.durationMs === "number" ? data.durationMs : Math.max(0, finishedAt - startedAt);

      const step: WorkflowRunStep = {
        stepId,
        stepTitle: typeof data.stepTitle === "string" ? data.stepTitle : undefined,
        workerId,
        status: stepStatus,
        startedAt,
        finishedAt,
        durationMs,
        response: typeof data.response === "string" ? data.response : undefined,
        responseTruncated: typeof data.responseTruncated === "boolean" ? data.responseTruncated : undefined,
        warning: typeof data.warning === "string" ? data.warning : undefined,
        error: typeof data.error === "string" ? data.error : undefined,
      };

      setState(
        produce((s) => {
          const existing =
            s.workflowRuns[runId] ??
            ({
              runId,
              workflowId,
              workflowName,
              status: "running",
              startedAt: event.timestamp,
              steps: [],
            } satisfies WorkflowRun);

          const steps = existing.steps ?? [];
          const index = steps.findIndex((item) => item.stepId === step.stepId);
          if (index >= 0) steps[index] = step;
          else steps.push(step);
          existing.steps = steps;
          s.workflowRuns[runId] = existing;
        }),
      );
      return;
    }

    if (event.type === "orchestra.workflow.carry.trimmed") {
      const stepId = typeof data.stepId === "string" ? data.stepId : "";
      if (!stepId) return;
      const droppedBlocks = typeof data.droppedBlocks === "number" ? data.droppedBlocks : 0;
      const truncatedSections = Array.isArray(data.truncatedSections)
        ? data.truncatedSections.map((item) => String(item))
        : [];
      const maxCarryChars = typeof data.maxCarryChars === "number" ? data.maxCarryChars : 0;

      setState(
        produce((s) => {
          const existing =
            s.workflowRuns[runId] ??
            ({
              runId,
              workflowId,
              workflowName,
              status: "running",
              startedAt: event.timestamp,
              steps: [],
            } satisfies WorkflowRun);

          const steps = existing.steps ?? [];
          const index = steps.findIndex((item) => item.stepId === stepId);
          const current =
            index >= 0
              ? steps[index]
              : ({
                  stepId,
                  stepTitle: typeof data.stepTitle === "string" ? data.stepTitle : undefined,
                  workerId: typeof data.workerId === "string" ? data.workerId : "unknown",
                  status: "success",
                  startedAt: event.timestamp,
                  finishedAt: event.timestamp,
                  durationMs: 0,
                } satisfies WorkflowRunStep);

          current.carryTrim = {
            droppedBlocks,
            truncatedSections,
            maxCarryChars,
            at: event.timestamp,
          };

          if (index >= 0) steps[index] = current;
          else steps.push(current);
          existing.steps = steps;
          s.workflowRuns[runId] = existing;
        }),
      );
      return;
    }

    if (event.type === "orchestra.workflow.completed") {
      const finishedAt = typeof data.finishedAt === "number" ? data.finishedAt : event.timestamp;
      const status = data.status === "error" ? "error" : "success";
      const durationMs = typeof data.durationMs === "number" ? data.durationMs : undefined;
      setState(
        produce((s) => {
          const existing =
            s.workflowRuns[runId] ??
            ({
              runId,
              workflowId,
              workflowName,
              status: "running",
              startedAt: event.timestamp,
              steps: [],
            } satisfies WorkflowRun);
          existing.status = status;
          existing.finishedAt = finishedAt;
          if (durationMs !== undefined) existing.durationMs = durationMs;
          s.workflowRuns[runId] = existing;
        }),
      );
    }
  };
  const upsertJob = (job: JobRecord) => {
    setState(
      produce((s) => {
        s.jobs[job.id] = job;
      }),
    );
  };

  const updateJobFromEvent = (event: OrchestratorEvent) => {
    if (!event.type.startsWith("orchestra.job.")) return;
    const data = event.data;
    if (!asRecord(data)) return;

    const jobId = typeof data.jobId === "string" ? data.jobId : "";
    if (!jobId) return;

    if (event.type === "orchestra.job.created") {
      const job: JobRecord = {
        id: jobId,
        workerId: typeof data.workerId === "string" ? data.workerId : "",
        message: typeof data.message === "string" ? data.message : "",
        sessionId: typeof data.sessionId === "string" ? data.sessionId : undefined,
        requestedBy: typeof data.requestedBy === "string" ? data.requestedBy : undefined,
        status: "running",
        startedAt: typeof data.startedAt === "number" ? data.startedAt : event.timestamp,
      };
      upsertJob(job);
      return;
    }

    if (event.type === "orchestra.job.progress") {
      setState(
        produce((s) => {
          const existing = s.jobs[jobId];
          if (!existing) return;
          existing.progress = {
            message: typeof data.message === "string" ? data.message : "",
            percent: typeof data.percent === "number" ? data.percent : undefined,
            updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : event.timestamp,
          };
        }),
      );
      return;
    }

    if (event.type === "orchestra.job.completed") {
      setState(
        produce((s) => {
          const existing = s.jobs[jobId];
          if (!existing) return;
          existing.status = "succeeded";
          existing.finishedAt = typeof data.finishedAt === "number" ? data.finishedAt : event.timestamp;
          existing.durationMs = typeof data.durationMs === "number" ? data.durationMs : undefined;
          existing.responsePreview = typeof data.responsePreview === "string" ? data.responsePreview : undefined;
          existing.responseLength = typeof data.responseLength === "number" ? data.responseLength : undefined;
        }),
      );
      return;
    }

    if (event.type === "orchestra.job.failed") {
      setState(
        produce((s) => {
          const existing = s.jobs[jobId];
          if (!existing) return;
          existing.status = "failed";
          existing.finishedAt = typeof data.finishedAt === "number" ? data.finishedAt : event.timestamp;
          existing.durationMs = typeof data.durationMs === "number" ? data.durationMs : undefined;
          existing.error = typeof data.error === "string" ? data.error : undefined;
        }),
      );
      return;
    }

    if (event.type === "orchestra.job.canceled") {
      setState(
        produce((s) => {
          const existing = s.jobs[jobId];
          if (!existing) return;
          existing.status = "canceled";
          existing.finishedAt = typeof data.finishedAt === "number" ? data.finishedAt : event.timestamp;
          existing.durationMs = typeof data.durationMs === "number" ? data.durationMs : undefined;
          existing.error = typeof data.reason === "string" ? data.reason : undefined;
        }),
      );
      return;
    }
  };

  const bootstrapFromOrchestrator = async () => {
    if (!orchestratorClient) return;

    try {
      const status = await orchestratorClient.fetchStatus();
      if (status) {
        setState(
          produce((s) => {
            // Update workers from status
            for (const worker of status.workers) {
              const runtime = toWorkerRuntime(worker);
              if (runtime) {
                s.workers[runtime.id] = runtime;
              }
            }
            // Update job summary
            s.jobSummary = status.jobs;
          }),
        );
      }

      const output = await orchestratorClient.fetchOutput({ limit: 50 });
      if (output) {
        setState(
          produce((s) => {
            // Update jobs from output
            for (const job of output.jobs) {
              const status = isJobStatus(job.status) ? job.status : "running";
              s.jobs[job.id] = {
                id: job.id,
                workerId: job.workerId,
                message: job.message,
                sessionId: job.sessionId,
                requestedBy: job.requestedBy,
                status,
                startedAt: job.startedAt,
                finishedAt: job.finishedAt,
                durationMs: job.durationMs,
                responseText: job.responseText,
                error: job.error,
              };
            }
          }),
        );
      }
    } catch (err) {
      console.error("[orchestrator] Failed to bootstrap:", err);
    }
  };

  const handleOrchestratorEvent = (event: OrchestratorEvent) => {
    const worker = extractWorkerSnapshotFromEvent(event);
    if (worker) upsertWorker(worker);
    handleWorkerStream(extractWorkerStreamChunkFromEvent(event));
    updateWorkflowRunFromEvent(event);
    updateJobFromEvent(event);
    const skillEvent = extractSkillLoadEventFromEvent(event);
    if (skillEvent) {
      setState(
        produce((s) => {
          s.skillEvents = [skillEvent, ...(s.skillEvents ?? [])].slice(0, 200);
        }),
      );
    }
  };
  const createSession = async (): Promise<Session | null> => {
    try {
      const res = await client.session.create();
      const session = res.data;
      if (session) {
        setState(
          produce((s) => {
            s.sessions[session.id] = session;
            s.lastUpdate = Date.now();
          }),
        );
      }
      return session ?? null;
    } catch (err) {
      console.error("[opencode] Failed to create session:", err);
      return null;
    }
  };
  const deleteSession = async (id: string): Promise<boolean> => {
    try {
      await client.session.delete({ path: { id } });
      setState(
        produce((s) => {
          delete s.sessions[id];
          delete s.messages[id];
          s.lastUpdate = Date.now();
        }),
      );
      return true;
    } catch (err) {
      console.error("[opencode] Failed to delete session:", err);
      return false;
    }
  };
  const sendMessage = async (
    sessionId: string,
    content: string,
    attachments?: Array<{
      id?: string;
      type: "file" | "image";
      name?: string;
      size?: number;
      url?: string;
      file?: File;
    }>,
  ): Promise<void> => {
    console.log(`🔍 [sendMessage] Sending to session ${sessionId}:`, {
      contentLength: content.length,
      preview: content.slice(0, 50),
    });
    try {
      const attachmentParts = await buildAttachmentParts(attachments);
      const parts: Array<TextPartInput | FilePartInput> = [];
      if (content.trim()) {
        parts.push({ type: "text", text: content });
      }
      parts.push(...attachmentParts);

      await client.session.prompt({
        path: { id: sessionId },
        body: {
          model: { providerID: "auto", modelID: "auto" },
          parts,
        },
      });
      console.log(`🔍 [sendMessage] Message sent successfully to ${sessionId}, fetching messages...`);

      setTimeout(() => {
        console.log(`🔍 [sendMessage] Auto-fetching messages for ${sessionId}`);
        fetchMessages(sessionId);
      }, 1000);
    } catch (err) {
      console.error("[opencode] Failed to send message:", err);
      throw err;
    }
  };
  const abortSession = async (id: string): Promise<boolean> => {
    try {
      await client.session.abort({ path: { id } });
      return true;
    } catch (err) {
      console.error("[opencode] Failed to abort session:", err);
      return false;
    }
  };
  const abortAllSessions = async (): Promise<number> => {
    const allSessions = Object.values(state.sessions);
    let aborted = 0;
    await Promise.all(
      allSessions.map(async (session) => {
        const success = await abortSession(session.id);
        if (success) aborted++;
      }),
    );
    return aborted;
  };
  const deleteAllSessions = async (): Promise<number> => {
    const allSessions = Object.values(state.sessions);
    let deleted = 0;
    await Promise.all(
      allSessions.map(async (session) => {
        const success = await deleteSession(session.id);
        if (success) deleted++;
      }),
    );
    return deleted;
  };
  const disposeAllInstances = async (): Promise<boolean> => {
    try {
      await client.instance.dispose();
      setState(
        produce((s) => {
          s.workers = {};
          s.workerStreams = {};
          s.workflowRuns = {};
          s.skillEvents = [];
          s.lastUpdate = Date.now();
        }),
      );
      return true;
    } catch (err) {
      console.error("[opencode] Failed to dispose instances:", err);
      return false;
    }
  };

  return {
    fetchAll,
    fetchMessages,
    fetchCatalog,
    pushEvent,
    upsertSession,
    removeSession,
    handleOrchestratorEvent,
    createSession,
    deleteSession,
    sendMessage,
    abortSession,
    abortAllSessions,
    deleteAllSessions,
    disposeAllInstances,
    hydrateWorkers,
    bootstrapFromOrchestrator,
  };
}
