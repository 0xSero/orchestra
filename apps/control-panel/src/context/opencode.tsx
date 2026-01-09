/**
 * OpenCode Context - Connect to OpenCode server via official @opencode-ai/sdk
 *
 * Maps OpenCode sessions to our control panel view.
 * OpenCode server runs on localhost:4096 by default.
 */

// Import only client module to avoid Node.js server dependencies in browser
import { createOpencodeClient } from "@opencode-ai/sdk/client";
import { createContext, createEffect, onCleanup, type ParentComponent, useContext } from "solid-js";
import { createStore } from "solid-js/store";
import { resolveOrchestratorEventsUrl } from "@/lib/opencode-base";
import { createOrchestratorBridgeClient, resolveOrchestratorBaseUrl } from "@/lib/orchestrator-bridge";
import { createOpenCodeActions } from "./opencode-actions";
import type { OpenCodeContextValue, OpenCodeState } from "./opencode-types";
import { subscribeToOrchestratorEvents } from "./orchestrator-events";

// =============================================================================
// Re-export types for convenience
// =============================================================================

export type {
  Agent,
  JobRecord,
  JobSummary,
  Message,
  ModelOption,
  OpenCodeContextValue,
  OpenCodeEventItem,
  OpenCodeState,
  Part,
  Session,
  SkillLoadEvent,
  WorkerRuntime,
  WorkerStreamChunk,
  WorkflowCarryTrim,
  WorkflowRun,
} from "./opencode-types";

// =============================================================================
// Context
// =============================================================================

const OpenCodeContext = createContext<OpenCodeContextValue>();

export const OpenCodeProvider: ParentComponent<{ baseUrl?: string }> = (props) => {
  // Create client - it auto-detects the server URL
  const client = createOpencodeClient({
    baseUrl: props.baseUrl ?? "http://localhost:4096",
  });

  const [state, setState] = createStore<OpenCodeState>({
    connected: false,
    version: null,
    sessions: {},
    messages: {},
    parts: {},
    agents: [],
    events: [],
    workers: {},
    subagents: {},
    lastSubagentEvent: null,
    workerStreams: {},
    workflowRuns: {},
    skillEvents: [],
    jobs: {},
    jobSummary: null,
    modelOptions: [],
    toolIds: [],
    lastUpdate: 0,
  });

  // Create orchestrator bridge client for REST API calls
  const orchestratorEventsUrl = resolveOrchestratorEventsUrl();
  const orchestratorBaseUrl = resolveOrchestratorBaseUrl(orchestratorEventsUrl);
  const orchestratorClient = orchestratorBaseUrl
    ? createOrchestratorBridgeClient({ baseUrl: orchestratorBaseUrl })
    : undefined;

  const actions = createOpenCodeActions({ client, state, setState, orchestratorClient });

  createEffect(() => {
    actions.fetchAll(true);
    // Bootstrap workers and jobs from orchestrator REST API
    actions.bootstrapFromOrchestrator();

    const pollInterval = setInterval(() => {
      actions.fetchAll(false);
    }, 5000);

    onCleanup(() => {
      clearInterval(pollInterval);
    });
  });

  createEffect(() => {
    actions.fetchCatalog();
  });

  createEffect(() => {
    const controller = new AbortController();
    let active = true;

    const run = async () => {
      try {
        const result = await client.event.subscribe({ signal: controller.signal });
        for await (const event of result.stream) {
          if (!active) break;
          actions.pushEvent(event);

          if (event?.type === "session.created" || event?.type === "session.updated") {
            actions.upsertSession(event?.properties?.info);
          }
          if (event?.type === "session.deleted") {
            const info = event?.properties?.info;
            if (info?.id) actions.removeSession(info.id);
          }
        }
      } catch (err) {
        if (active) console.error("[opencode] Event stream error:", err);
      }
    };

    run();

    onCleanup(() => {
      active = false;
      controller.abort();
    });
  });

  createEffect(() => {
    const stop = subscribeToOrchestratorEvents({
      onEvent: (event) => {
        actions.pushEvent(event);
        actions.handleOrchestratorEvent(event);
      },
      onError: (err) => {
        console.error("[orchestrator] Event stream error:", err);
      },
    });

    onCleanup(() => {
      stop();
    });
  });

  // ---------------------------------------------------------------------------
  // Context Value
  // ---------------------------------------------------------------------------

  const value: OpenCodeContextValue = {
    connected: () => state.connected,
    version: () => state.version,

    sessions: () => Object.values(state.sessions).sort((a, b) => b.time.updated - a.time.updated),

    agents: () => state.agents,
    events: () => state.events,
    workers: () => Object.values(state.workers),
    workerStreams: () => Object.values(state.workerStreams),
    workflowRuns: () => Object.values(state.workflowRuns),
    skillEvents: () => state.skillEvents ?? [],
    subagents: () => Object.values(state.subagents),
    activeSubagent: () => (state.lastSubagentEvent?.type === "active" ? state.lastSubagentEvent.subagent : null),
    lastSubagentEvent: () => state.lastSubagentEvent,
    activeWorkerSessionIds: () =>
      new Set(
        Object.values(state.workers)
          .filter((w) => w.sessionId && (w.status === "ready" || w.status === "busy"))
          .map((w) => w.sessionId as string),
      ),
    jobs: () => Object.values(state.jobs),
    jobSummary: () => state.jobSummary,
    modelOptions: () => state.modelOptions,
    toolIds: () => state.toolIds,

    getSession: (id) => state.sessions[id],
    getSessionMessages: (id) => state.messages[id] ?? [],
    getMessageParts: (id) => state.parts[id] ?? [],

    refresh: actions.fetchAll,
    refreshSessions: actions.fetchAll,
    fetchMessages: actions.fetchMessages,
    refreshCatalog: actions.fetchCatalog,
    createSession: actions.createSession,
    deleteSession: actions.deleteSession,
    sendMessage: actions.sendMessage,
    abortSession: actions.abortSession,
    abortAllSessions: actions.abortAllSessions,
    deleteAllSessions: actions.deleteAllSessions,
    disposeAllInstances: actions.disposeAllInstances,
    hydrateWorkers: actions.hydrateWorkers,

    client,
  };

  return <OpenCodeContext.Provider value={value}>{props.children}</OpenCodeContext.Provider>;
};

export function useOpenCode(): OpenCodeContextValue {
  const ctx = useContext(OpenCodeContext);
  if (!ctx) {
    throw new Error("useOpenCode must be used within an OpenCodeProvider");
  }
  return ctx;
}
