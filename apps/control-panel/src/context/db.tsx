import {
  type Accessor,
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  type ParentComponent,
  useContext,
} from "solid-js";
import { createStore } from "solid-js/store";
import { getAgentsApiBase } from "@/lib/opencode-base";
import type { DbSnapshot, DbUser, WorkerConfig, WorkerState } from "@/types/db";

type DbContextValue = {
  ready: Accessor<boolean>;
  dbPath: Accessor<string>;
  user: Accessor<DbUser | null>;
  preferences: Accessor<Record<string, string | null>>;
  workerConfigs: Accessor<WorkerConfig[]>;
  workerStates: Accessor<WorkerState[]>;
  refresh: () => Promise<void>;
  setPreference: (key: string, value: string | null) => Promise<void>;
  deletePreference: (key: string) => Promise<void>;
  setWorkerConfig: (
    workerId: string,
    updates: {
      model?: string | null;
      temperature?: number | null;
      maxTokens?: number | null;
      enabled?: boolean;
    },
  ) => Promise<void>;
  clearWorkerConfig: (workerId: string) => Promise<void>;
  markOnboarded: () => Promise<void>;
};

const DbContext = createContext<DbContextValue>();

export const DbProvider: ParentComponent<{ baseUrl?: string }> = (props) => {
  const apiBase = getAgentsApiBase(props.baseUrl);

  const [state, setState] = createStore<DbSnapshot>({
    dbPath: "",
    user: null,
    preferences: {},
    workerConfigs: [],
    workerStates: [],
  });
  const [ready, setReady] = createSignal(false);

  const applySnapshot = (snapshot: DbSnapshot) => {
    setState({
      dbPath: snapshot.dbPath ?? "",
      user: snapshot.user ?? null,
      preferences: snapshot.preferences ?? {},
      workerConfigs: snapshot.workerConfigs ?? [],
      workerStates: snapshot.workerStates ?? [],
    });
    setReady(true);
  };

  const fetchSnapshot = async () => {
    const res = await fetch(`${apiBase}/api/db`);
    if (!res.ok) throw new Error("Failed to load database snapshot");
    return (await res.json()) as DbSnapshot;
  };

  const refresh = async () => {
    const snapshot = await fetchSnapshot();
    applySnapshot(snapshot);
  };

  createEffect(() => {
    let active = true;
    refresh().catch(() => {});

    if (typeof EventSource === "undefined") return;
    const source = new EventSource(`${apiBase}/api/db/events`);
    const handleSnapshot = (evt: MessageEvent) => {
      if (!active || !evt?.data) return;
      try {
        const parsed = JSON.parse(evt.data) as DbSnapshot;
        applySnapshot(parsed);
      } catch {
        // ignore malformed events
      }
    };
    source.addEventListener("db.snapshot", handleSnapshot);
    source.onmessage = handleSnapshot;
    source.onerror = () => {
      if (!ready()) {
        refresh().catch(() => {});
      }
    };
    onCleanup(() => {
      active = false;
      source.close();
    });
  });

  const setPreference = async (key: string, value: string | null) => {
    const res = await fetch(`${apiBase}/api/db/preferences`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    if (!res.ok) throw new Error("Failed to update preference");
    await refresh();
  };

  const deletePreference = async (key: string) => {
    const res = await fetch(`${apiBase}/api/db/preferences/${encodeURIComponent(key)}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete preference");
    await refresh();
  };

  const setWorkerConfig = async (
    workerId: string,
    updates: {
      model?: string | null;
      temperature?: number | null;
      maxTokens?: number | null;
      enabled?: boolean;
    },
  ) => {
    const res = await fetch(`${apiBase}/api/db/worker-config/${encodeURIComponent(workerId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error("Failed to update worker config");
    await refresh();
  };

  const clearWorkerConfig = async (workerId: string) => {
    const res = await fetch(`${apiBase}/api/db/worker-config/${encodeURIComponent(workerId)}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to clear worker config");
    await refresh();
  };

  const markOnboarded = async () => {
    const res = await fetch(`${apiBase}/api/db/onboarded`, { method: "POST" });
    if (!res.ok) throw new Error("Failed to mark onboarded");
    await refresh();
  };

  const value: DbContextValue = {
    ready,
    dbPath: () => state.dbPath,
    user: () => state.user,
    preferences: () => state.preferences,
    workerConfigs: () => state.workerConfigs,
    workerStates: () => state.workerStates,
    refresh,
    setPreference,
    deletePreference,
    setWorkerConfig,
    clearWorkerConfig,
    markOnboarded,
  };

  return <DbContext.Provider value={value}>{props.children}</DbContext.Provider>;
};

export function useDb(): DbContextValue {
  const ctx = useContext(DbContext);
  if (!ctx) {
    throw new Error("useDb must be used within a DbProvider");
  }
  return ctx;
}
