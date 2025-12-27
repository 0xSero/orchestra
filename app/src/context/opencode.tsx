/**
 * OpenCode Context - Connect to OpenCode server via official @opencode-ai/sdk
 *
 * Maps OpenCode sessions to our control panel view.
 * OpenCode server runs on localhost:4096 by default.
 */

// Import only client module to avoid Node.js server dependencies in browser
import {
  type Agent,
  createOpencodeClient,
  type FilePartInput,
  type Message,
  type OpencodeClient,
  type Part,
  type Session,
  type TextPartInput,
} from "@opencode-ai/sdk/client";
import { type Accessor, createContext, createEffect, onCleanup, type ParentComponent, useContext } from "solid-js";
import { createStore, produce } from "solid-js/store";

// =============================================================================
// Re-export types for convenience
// =============================================================================

export type { Session, Message, Part, Agent };

export type OpenCodeEventItem = {
  id: string;
  type: string;
  payload: any;
  at: number;
};

export type WorkerStatus = "starting" | "ready" | "busy" | "error" | "stopped";

export type WorkerRuntime = {
  id: string;
  name: string;
  status: WorkerStatus;
  sessionId?: string;
  model?: string;
  port?: number;
  serverUrl?: string;
  supportsVision?: boolean;
  supportsWeb?: boolean;
  lastActivity?: string;
  error?: string;
  warning?: string;
};

export type ModelOption = {
  value: string;
  label: string;
};

// =============================================================================
// State Types
// =============================================================================

export interface OpenCodeState {
  connected: boolean;
  version: string | null;
  sessions: Record<string, Session>;
  messages: Record<string, Message[]>; // sessionId -> messages
  parts: Record<string, Part[]>; // messageId -> parts
  agents: Agent[];
  events: OpenCodeEventItem[];
  workers: Record<string, WorkerRuntime>;
  modelOptions: ModelOption[];
  toolIds: string[];
  lastUpdate: number;
}

export interface OpenCodeContextValue {
  // Connection state
  connected: Accessor<boolean>;
  version: Accessor<string | null>;

  // Data accessors
  sessions: Accessor<Session[]>;
  agents: Accessor<Agent[]>;
  events: Accessor<OpenCodeEventItem[]>;
  workers: Accessor<WorkerRuntime[]>;
  activeWorkerSessionIds: Accessor<Set<string>>;
  modelOptions: Accessor<ModelOption[]>;
  toolIds: Accessor<string[]>;

  // Session helpers
  getSession: (id: string) => Session | undefined;
  getSessionMessages: (id: string) => Message[];
  getMessageParts: (messageId: string) => Part[];

  // Actions
  refresh: () => Promise<void>;
  refreshSessions: () => Promise<void>; // alias for refresh
  fetchMessages: (id: string) => Promise<void>;
  refreshCatalog: () => Promise<void>;
  createSession: () => Promise<Session | null>;
  deleteSession: (id: string) => Promise<boolean>;
  sendMessage: (
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
  ) => Promise<void>;
  abortSession: (id: string) => Promise<boolean>;
  abortAllSessions: () => Promise<number>;
  deleteAllSessions: () => Promise<number>;
  disposeAllInstances: () => Promise<boolean>;

  // Direct client access for advanced use
  client: OpencodeClient;
}

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
    modelOptions: [],
    toolIds: [],
    lastUpdate: 0,
  });

  const buildModelOptions = (providers: Array<Record<string, any>>): ModelOption[] => {
    const byValue = new Map<string, ModelOption>();
    byValue.set("auto", { value: "auto", label: "Auto (Best Available)" });

    for (const provider of providers) {
      const providerId = provider?.id ?? provider?.providerID;
      if (!providerId) continue;
      const providerName = provider?.name ?? providerId;
      const models = provider?.models ?? {};

      for (const [key, rawModel] of Object.entries(models)) {
        const modelId = (rawModel as any)?.id ?? key;
        if (!modelId) continue;
        const value = String(modelId).includes(":") ? String(modelId) : `${providerId}:${modelId}`;
        const modelName = (rawModel as any)?.name ?? modelId;
        const label = `${providerName} · ${modelName}`;
        byValue.set(value, { value, label });
      }
    }

    const options = Array.from(byValue.values()).filter((option) => option.value !== "auto");
    options.sort((a, b) => a.label.localeCompare(b.label));
    return [byValue.get("auto")!, ...options];
  };

  const fetchCatalog = async () => {
    const [providersRes, toolIdsRes] = await Promise.allSettled([client.config.providers(), client.tool.ids()]);
    const providersPayload =
      providersRes.status === "fulfilled"
        ? (providersRes.value.data as { providers?: Array<Record<string, any>>; all?: Array<any> } | undefined)
        : undefined;
    const toolIdsPayload = toolIdsRes.status === "fulfilled" ? toolIdsRes.value.data : undefined;

    if (providersRes.status === "rejected") {
      console.error("[opencode] Failed to fetch providers:", providersRes.reason);
    }
    if (toolIdsRes.status === "rejected") {
      console.error("[opencode] Failed to fetch tool IDs:", toolIdsRes.reason);
    }

    const providers = providersPayload?.providers ?? providersPayload?.all ?? [];
    const modelOptions = Array.isArray(providers) ? buildModelOptions(providers) : [];
    const toolIds = Array.isArray(toolIdsPayload) ? toolIdsPayload.map((id) => String(id)) : [];

    setState(
      produce((s) => {
        s.modelOptions = modelOptions;
        s.toolIds = toolIds;
      }),
    );
  };

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------

  const fetchAll = async (includeMessages = false) => {
    try {
      // Fetch sessions and agents in parallel
      const [sessionsRes, agentsRes] = await Promise.all([client.session.list(), client.app.agents()]);

      // SDK returns { data, error, response } - extract data
      // The data is the actual response (array for list endpoints)
      const sessions = (sessionsRes.data as Session[] | undefined) ?? [];
      const agents = (agentsRes.data as Agent[] | undefined) ?? [];

      setState(
        produce((s) => {
          s.connected = true;
          s.agents = agents;

          // Update sessions
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

      // Fetch messages for all sessions if requested (typically on initial load)
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

  const fetchMessages = async (sessionId: string) => {
    try {
      const res = await client.session.messages({ path: { id: sessionId } });

      // API returns { info: Message, parts: Part[] }[] - an array of message+parts objects
      // OR it might return { messages: Message[], parts: Part[] } depending on SDK version
      const rawData = res.data;

      if (!rawData) {
        console.log(`[opencode] No message data for session ${sessionId}`);
        return;
      }

      // Handle both response formats
      let messages: Message[] = [];
      let allParts: Part[] = [];

      if (Array.isArray(rawData)) {
        // Format: { info: Message, parts: Part[] }[]
        for (const item of rawData as Array<{ info?: Message; parts?: Part[] }>) {
          if (item.info) {
            messages.push(item.info);
          }
          if (item.parts) {
            allParts.push(...item.parts);
          }
        }
      } else if (typeof rawData === "object") {
        // Format: { messages: Message[], parts: Part[] }
        const objData = rawData as { messages?: Message[]; parts?: Part[] };
        messages = objData.messages ?? [];
        allParts = objData.parts ?? [];
      }

      setState(
        produce((s) => {
          s.messages[sessionId] = messages;
          // Clear old parts for these messages
          const messageIds = new Set(messages.map((m) => m.id));
          for (const id of messageIds) {
            delete s.parts[id];
          }
          // Add new parts
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

  // ---------------------------------------------------------------------------
  // Lifecycle - Simple polling approach (SSE can be added later)
  // ---------------------------------------------------------------------------

  createEffect(() => {
    // Initial fetch - include messages for all sessions on first load
    fetchAll(true);

    // Poll for updates every 5 seconds (sessions only, not messages)
    const pollInterval = setInterval(() => {
      fetchAll(false);
    }, 5000);

    onCleanup(() => {
      clearInterval(pollInterval);
    });
  });

  createEffect(() => {
    fetchCatalog();
  });

  const pushEvent = (payload: any) => {
    const item: OpenCodeEventItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: payload?.type ?? "event",
      payload,
      at: Date.now(),
    };
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

  const upsertWorker = (raw: any) => {
    const profile = raw?.profile ?? {};
    const id = profile.id ?? raw?.id;
    if (!id) return;
    const next: WorkerRuntime = {
      id,
      name: profile.name ?? raw?.name ?? id,
      status: raw?.status ?? "starting",
      sessionId: raw?.sessionId,
      model: profile.model ?? raw?.model,
      port: raw?.port,
      serverUrl: raw?.serverUrl,
      supportsVision: profile.supportsVision,
      supportsWeb: profile.supportsWeb,
      lastActivity: raw?.lastActivity,
      error: raw?.error,
      warning: raw?.warning,
    };
    setState(
      produce((s) => {
        s.workers[id] = next;
      }),
    );
  };

  const handleOrchestraEvent = (payload: any) => {
    if (!payload || payload.type !== "orchestra.event") return;
    const inner = payload.payload ?? payload.properties?.payload ?? payload.properties;
    if (!inner || !inner.type) return;
    if (inner.type.startsWith("orchestra.worker.")) {
      const worker = inner.data?.worker ?? inner.worker;
      if (worker) upsertWorker(worker);
    }
  };

  createEffect(() => {
    const controller = new AbortController();
    let active = true;

    const run = async () => {
      try {
        const result = await client.event.subscribe({ signal: controller.signal } as any);
        for await (const event of result.stream) {
          if (!active) break;
          pushEvent(event);

          if (event?.type === "session.created" || event?.type === "session.updated") {
            upsertSession(event?.properties?.info);
          }
          if (event?.type === "session.deleted") {
            const info = event?.properties?.info;
            if (info?.id) removeSession(info.id);
          }
          handleOrchestraEvent(event);
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

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

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

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });

  const buildAttachmentParts = async (
    attachments?: Array<{
      type: "file" | "image";
      name?: string;
      url?: string;
      file?: File;
    }>,
  ): Promise<FilePartInput[]> => {
    if (!attachments || attachments.length === 0) return [];
    const parts: FilePartInput[] = [];
    for (const attachment of attachments) {
      if (!attachment.file) continue;
      const url = await fileToDataUrl(attachment.file);
      parts.push({
        type: "file",
        mime: attachment.file.type || "application/octet-stream",
        filename: attachment.name ?? attachment.file.name,
        url,
      });
    }
    return parts;
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

      // Trigger message fetch after sending
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
      // Clear all workers from state
      setState(
        produce((s) => {
          s.workers = {};
          s.lastUpdate = Date.now();
        }),
      );
      return true;
    } catch (err) {
      console.error("[opencode] Failed to dispose instances:", err);
      return false;
    }
  };

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
    activeWorkerSessionIds: () =>
      new Set(
        Object.values(state.workers)
          .filter((w) => w.sessionId && (w.status === "ready" || w.status === "busy"))
          .map((w) => w.sessionId as string),
      ),
    modelOptions: () => state.modelOptions,
    toolIds: () => state.toolIds,

    getSession: (id) => state.sessions[id],
    getSessionMessages: (id) => state.messages[id] ?? [],
    getMessageParts: (id) => state.parts[id] ?? [],

    refresh: fetchAll,
    refreshSessions: fetchAll, // alias for refresh
    fetchMessages, // Export this for use in components
    refreshCatalog: fetchCatalog,
    createSession,
    deleteSession,
    sendMessage,
    abortSession,
    abortAllSessions,
    deleteAllSessions,
    disposeAllInstances,

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
