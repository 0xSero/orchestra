/**
 * OpenCode Context - Connect to OpenCode server via official @opencode-ai/sdk
 *
 * Maps OpenCode sessions to our control panel view.
 * OpenCode server runs on localhost:4096 by default.
 */

import {
  createContext,
  useContext,
  createEffect,
  onCleanup,
  type ParentComponent,
  type Accessor,
} from "solid-js";
import { createStore, produce } from "solid-js/store";
// Import only client module to avoid Node.js server dependencies in browser
import {
  createOpencodeClient,
  type OpencodeClient,
  type Session,
  type Message,
  type Part,
  type Agent,
  type TextPartInput,
  type FilePartInput,
} from "@opencode-ai/sdk/client";

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

  // Session helpers
  getSession: (id: string) => Session | undefined;
  getSessionMessages: (id: string) => Message[];
  getMessageParts: (messageId: string) => Part[];

  // Actions
  refresh: () => Promise<void>;
  refreshSessions: () => Promise<void>; // alias for refresh
  fetchMessages: (id: string) => Promise<void>;
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
    }>
  ) => Promise<void>;
  abortSession: (id: string) => Promise<boolean>;

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
    lastUpdate: 0,
  });

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------

  const fetchAll = async () => {
    try {
      // Fetch sessions and agents in parallel
      const [sessionsRes, agentsRes] = await Promise.all([
        client.session.list(),
        client.app.agents(),
      ]);

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
        })
      );

      console.log("[opencode] Fetched:", {
        sessions: sessions.length,
        agents: agents.length,
      });
    } catch (err) {
      console.error("[opencode] Failed to fetch data:", err);
      setState("connected", false);
    }
  };

  const fetchMessages = async (sessionId: string) => {
    console.log(`🔍 [fetchMessages] Starting fetch for session: ${sessionId}`);
    try {
      const res = await client.session.messages({ path: { id: sessionId } });
      console.log(`🔍 [fetchMessages] SDK response for ${sessionId}:`, {
        status: res.response?.status,
        hasData: !!res.data,
        dataKeys: res.data ? Object.keys(res.data) : 'no-data'
      });
      
      const data = res.data as { messages?: Message[]; parts?: Part[] } | undefined;

      if (data) {
        console.log(`🔍 [fetchMessages] Processing data for ${sessionId}:`, {
          messageCount: data.messages?.length || 0,
          partCount: data.parts?.length || 0,
          sampleMessage: data.messages?.[0] ? {
            id: data.messages[0].id,
            role: data.messages[0].role,
            hasParts: !!(data.parts && data.messages && data.parts.find(p => p.messageID === data.messages![0].id))
          } : 'no-messages'
        });

        const oldState = { 
          messageCount: state.messages[sessionId]?.length || 0,
          partCount: Object.keys(state.parts).reduce((acc, msgId) => 
            msgId.startsWith(sessionId) ? acc + 1 : acc, 0)
        };

        setState(
          produce((s) => {
            s.messages[sessionId] = data.messages ?? [];
            const messageIds = new Set((data.messages ?? []).map((m) => m.id));
            for (const id of messageIds) {
              delete s.parts[id];
            }
            for (const part of data.parts ?? []) {
              if (!s.parts[part.messageID]) {
                s.parts[part.messageID] = [];
              }
              s.parts[part.messageID].push(part);
            }
          })
        );

        const newState = { 
          messageCount: state.messages[sessionId]?.length || 0,
          partCount: Object.keys(state.parts).reduce((acc, msgId) => 
            msgId.startsWith(sessionId) ? acc + 1 : acc, 0)
        };

        console.log(`🔍 [fetchMessages] State updated for ${sessionId}:`, {
          before: oldState,
          after: newState,
          messages: state.messages[sessionId]?.map(m => ({ id: m.id, role: m.role })) || 'no-messages'
        });
      } else {
        console.log(`🔍 [fetchMessages] No data returned for session: ${sessionId}`);
      }
    } catch (err) {
      console.error(`[opencode] Failed to fetch messages for ${sessionId}:`, err);
    }
  };

  // ---------------------------------------------------------------------------
  // Lifecycle - Simple polling approach (SSE can be added later)
  // ---------------------------------------------------------------------------

  createEffect(() => {
    // Initial fetch
    fetchAll();

    // Poll for updates every 5 seconds
    const pollInterval = setInterval(() => {
      fetchAll();
    }, 5000);

    onCleanup(() => {
      clearInterval(pollInterval);
    });
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
      })
    );
  };

  const upsertSession = (session?: Session) => {
    if (!session?.id) return;
    setState(
      produce((s) => {
        s.sessions[session.id] = session;
        s.lastUpdate = Date.now();
      })
    );
  };

  const removeSession = (sessionId: string) => {
    setState(
      produce((s) => {
        delete s.sessions[sessionId];
        delete s.messages[sessionId];
        s.lastUpdate = Date.now();
      })
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
      })
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
          })
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
        })
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
    }>
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
    }>
  ): Promise<void> => {
    console.log(`🔍 [sendMessage] Sending to session ${sessionId}:`, { contentLength: content.length, preview: content.slice(0, 50) });
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

  // ---------------------------------------------------------------------------
  // Context Value
  // ---------------------------------------------------------------------------

  const value: OpenCodeContextValue = {
    connected: () => state.connected,
    version: () => state.version,

    sessions: () =>
      Object.values(state.sessions).sort(
        (a, b) => b.time.updated - a.time.updated
      ),

    agents: () => state.agents,
    events: () => state.events,
    workers: () => Object.values(state.workers),
    activeWorkerSessionIds: () =>
      new Set(
        Object.values(state.workers)
          .filter((w) => w.sessionId && (w.status === "ready" || w.status === "busy"))
          .map((w) => w.sessionId as string)
      ),

    getSession: (id) => state.sessions[id],
    getSessionMessages: (id) => state.messages[id] ?? [],
    getMessageParts: (id) => state.parts[id] ?? [],

    refresh: fetchAll,
    refreshSessions: fetchAll, // alias for refresh
    fetchMessages, // Export this for use in components
    createSession,
    deleteSession,
    sendMessage,
    abortSession,

    client,
  };

  return (
    <OpenCodeContext.Provider value={value}>
      {props.children}
    </OpenCodeContext.Provider>
  );
};

export function useOpenCode(): OpenCodeContextValue {
  const ctx = useContext(OpenCodeContext);
  if (!ctx) {
    throw new Error("useOpenCode must be used within an OpenCodeProvider");
  }
  return ctx;
}
