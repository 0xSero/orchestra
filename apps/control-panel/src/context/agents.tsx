import {
  createContext,
  createEffect,
  createResource,
  createSignal,
  onCleanup,
  type ParentComponent,
  useContext,
} from "solid-js";
import { getAgentsApiBase } from "@/lib/opencode-base";
import type { AgentEvent, AgentInput, AgentProfile, AgentScope } from "@/types/agent";

interface AgentsContextValue {
  agents: () => AgentProfile[];
  isLoading: () => boolean;
  selectedAgentId: () => string | null;
  createDialogOpen: () => boolean;

  builtinAgents: () => AgentProfile[];
  customAgents: () => AgentProfile[];

  refresh: () => Promise<void>;
  selectAgent: (id: string | null) => void;
  openCreateDialog: () => void;
  closeCreateDialog: () => void;
  createAgent: (input: AgentInput, scope: AgentScope) => Promise<AgentProfile>;
  updateAgent: (id: string, updates: Partial<AgentInput>, scope: AgentScope) => Promise<AgentProfile>;
  deleteAgent: (id: string, scope: AgentScope) => Promise<boolean>;
  duplicateAgent: (sourceId: string, newId: string, scope: AgentScope) => Promise<AgentProfile>;
}

const AgentsContext = createContext<AgentsContextValue>();

export const AgentsProvider: ParentComponent<{ baseUrl?: string }> = (props) => {
  const apiBase = getAgentsApiBase(props.baseUrl);

  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [createOpen, setCreateOpen] = createSignal(false);

  const fetchAgents = async () => {
    const res = await fetch(`${apiBase}/api/skills`);
    if (!res.ok) throw new Error("Failed to load agents");
    return (await res.json()) as AgentProfile[];
  };

  const [agents, { refetch }] = createResource(fetchAgents);

  createEffect(() => {
    if (typeof EventSource === "undefined") return;
    const source = new EventSource(`${apiBase}/api/skills/events`);
    const handleEvent = (_evt: MessageEvent) => {
      void refetch();
    };
    source.addEventListener("skill.created", handleEvent);
    source.addEventListener("skill.updated", handleEvent);
    source.addEventListener("skill.deleted", handleEvent);
    source.onmessage = (evt) => {
      if (!evt?.data) return;
      try {
        const parsed = JSON.parse(evt.data) as AgentEvent;
        if (parsed?.type?.startsWith("agent.") || parsed?.type?.startsWith("skill.")) {
          void refetch();
        }
      } catch {
        // ignore malformed events
      }
    };
    onCleanup(() => {
      source.close();
    });
  });

  const createAgent = async (input: AgentInput, scope: AgentScope) => {
    const res = await fetch(`${apiBase}/api/skills`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, scope }),
    });
    if (!res.ok) throw new Error("Failed to create agent");
    const skill = (await res.json()) as AgentProfile;
    await refetch();
    return skill;
  };

  const updateAgent = async (id: string, updates: Partial<AgentInput>, scope: AgentScope) => {
    const res = await fetch(`${apiBase}/api/skills/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates, scope }),
    });
    if (!res.ok) throw new Error("Failed to update agent");
    const skill = (await res.json()) as AgentProfile;
    await refetch();
    return skill;
  };

  const deleteAgent = async (id: string, scope: AgentScope) => {
    const res = await fetch(`${apiBase}/api/skills/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope }),
    });
    if (!res.ok) throw new Error("Failed to delete agent");
    await refetch();
    if (selectedId() === id) setSelectedId(null);
    return true;
  };

  const duplicateAgent = async (sourceId: string, newId: string, scope: AgentScope) => {
    const res = await fetch(`${apiBase}/api/skills/${sourceId}/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newId, scope }),
    });
    if (!res.ok) throw new Error("Failed to duplicate agent");
    const skill = (await res.json()) as AgentProfile;
    await refetch();
    return skill;
  };

  const value: AgentsContextValue = {
    agents: () => agents() ?? [],
    isLoading: () => agents.loading,
    selectedAgentId: selectedId,
    createDialogOpen: createOpen,

    builtinAgents: () => (agents() ?? []).filter((s) => s.source.type === "builtin"),
    customAgents: () => (agents() ?? []).filter((s) => s.source.type !== "builtin"),

    refresh: async () => {
      await refetch();
    },
    selectAgent: setSelectedId,
    openCreateDialog: () => setCreateOpen(true),
    closeCreateDialog: () => setCreateOpen(false),
    createAgent,
    updateAgent,
    deleteAgent,
    duplicateAgent,
  };

  return <AgentsContext.Provider value={value}>{props.children}</AgentsContext.Provider>;
};

export function useAgents(): AgentsContextValue {
  const ctx = useContext(AgentsContext);
  if (!ctx) throw new Error("useAgents must be used within an AgentsProvider");
  return ctx;
}
