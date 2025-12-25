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
} from "@opencode-ai/sdk/client";

// =============================================================================
// Re-export types for convenience
// =============================================================================

export type { Session, Message, Part, Agent };

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
  lastUpdate: number;
}

export interface OpenCodeContextValue {
  // Connection state
  connected: Accessor<boolean>;
  version: Accessor<string | null>;

  // Data accessors
  sessions: Accessor<Session[]>;
  agents: Accessor<Agent[]>;

  // Session helpers
  getSession: (id: string) => Session | undefined;
  getSessionMessages: (id: string) => Message[];

  // Actions
  refresh: () => Promise<void>;
  refreshSessions: () => Promise<void>; // alias for refresh
  createSession: () => Promise<Session | null>;
  deleteSession: (id: string) => Promise<boolean>;
  sendMessage: (sessionId: string, content: string) => Promise<void>;
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
    try {
      const res = await client.session.messages({ path: { id: sessionId } });
      const data = res.data as { messages?: Message[]; parts?: Part[] } | undefined;

      if (data) {
        setState(
          produce((s) => {
            s.messages[sessionId] = data.messages ?? [];
            // Index parts by messageId
            for (const part of data.parts ?? []) {
              if (!s.parts[part.messageID]) {
                s.parts[part.messageID] = [];
              }
              s.parts[part.messageID].push(part);
            }
          })
        );
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

  const sendMessage = async (sessionId: string, content: string): Promise<void> => {
    try {
      // Use promptAsync to send without blocking
      await client.session.promptAsync({
        path: { id: sessionId },
        body: { content },
      });
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

    agents: () => state.agents.filter((a) => !a.hidden),

    getSession: (id) => state.sessions[id],
    getSessionMessages: (id) => state.messages[id] ?? [],

    refresh: fetchAll,
    refreshSessions: fetchAll, // alias for refresh
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
