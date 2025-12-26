/**
 * SessionList - Session sidebar with real data, actions, and status
 */

import { type Component, For, Show, createMemo, createSignal } from "solid-js";
import { useOpenCode, type Session, type WorkerRuntime } from "@/context/opencode";
import { useLayout } from "@/context/layout";

// Icons
const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </svg>
);

const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const StopIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect width="14" height="14" x="5" y="5" rx="2" />
  </svg>
);

const SendIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22 2L11 13" />
    <path d="M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
);

const ServerIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
    <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
    <line x1="6" x2="6.01" y1="6" y2="6" />
    <line x1="6" x2="6.01" y1="18" y2="18" />
  </svg>
);

const ClockIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12,6 12,12 16,14" />
  </svg>
);

// Format duration from timestamp
const formatDuration = (startTime: number): string => {
  const now = Date.now();
  const diff = now - startTime;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};

// Get status from session/worker
// Sessions don't have a status field - we infer from:
// 1. Worker status (if we have worker data from orchestra events)
// 2. Recent activity (time.updated within last 30 seconds = likely active)
// 3. Compacting state (time.compacting exists = processing)
const getSessionStatus = (session: Session, worker?: WorkerRuntime): "ready" | "busy" | "error" | "stopped" | "starting" => {
  // If we have worker data, use it
  if (worker) {
    if (worker.status === "busy") return "busy";
    if (worker.status === "ready") return "ready";
    if (worker.status === "error") return "error";
    if (worker.status === "starting") return "starting";
    return "stopped";
  }

  // Check if session is compacting (processing)
  const s = session as any;
  if (s.time?.compacting) return "busy";

  // Check if recently active (updated within last 30 seconds)
  const now = Date.now();
  const lastUpdate = session.time?.updated || 0;
  const timeSinceUpdate = now - lastUpdate;

  if (timeSinceUpdate < 30000) {
    // Updated in last 30 seconds - likely active
    return "busy";
  }

  // Default to ready (idle)
  return "ready";
};

const getStatusLabel = (status: string): string => {
  switch (status) {
    case "ready": return "Idle";
    case "busy": return "Running";
    case "error": return "Error";
    case "starting": return "Starting";
    default: return "Stopped";
  }
};

interface SessionItemProps {
  session: Session;
  worker?: WorkerRuntime;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onAbort: () => void;
}

const SessionItem: Component<SessionItemProps> = (props) => {
  const [showActions, setShowActions] = createSignal(false);

  const status = createMemo(() => getSessionStatus(props.session, props.worker));
  const duration = createMemo(() => formatDuration(props.session.time.created));
  // Get port from worker if available
  const port = createMemo(() => props.worker?.port);

  // Get model info
  const model = createMemo(() => {
    const s = props.session as any;
    return props.worker?.model || s.model || s.agent?.model || s.metadata?.model || "default";
  });

  return (
    <div
      class={`session-item ${props.isSelected ? "selected" : ""}`}
      onClick={props.onSelect}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Header row */}
      <div class="session-item-header">
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <span class={`status-dot ${status()}`} />
          <span class="session-item-title">
            {props.session.title || "Untitled Session"}
          </span>
        </div>

        {/* Actions */}
        <div class={`session-item-actions ${showActions() ? "opacity-100" : ""}`}>
          <Show when={status() === "busy"}>
            <button
              class="btn btn-ghost btn-icon p-1"
              onClick={(e) => { e.stopPropagation(); props.onAbort(); }}
              title="Stop session"
            >
              <StopIcon />
            </button>
          </Show>
          <button
            class="btn btn-ghost btn-icon p-1 text-destructive hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); props.onDelete(); }}
            title="Delete session"
          >
            <XIcon />
          </button>
        </div>
      </div>

      {/* Meta row */}
      <div class="session-item-meta">
        <span class="flex items-center gap-1">
          <ClockIcon />
          {duration()}
        </span>

        <Show when={port()}>
          <span class="flex items-center gap-1 font-mono">
            <ServerIcon />
            :{port()}
          </span>
        </Show>

        <span class="truncate">{model()}</span>
      </div>

      {/* Status badge for active sessions */}
      <Show when={status() === "busy" || status() === "starting"}>
        <div class="mt-1">
          <span class={`status-badge ${status()}`}>
            <span class={`status-dot ${status()} ${status() === "busy" ? "animate-pulse-soft" : ""}`} />
            {getStatusLabel(status())}
          </span>
        </div>
      </Show>
    </div>
  );
};

export const SessionList: Component = () => {
  const { sessions, workers, createSession, deleteSession, abortSession } = useOpenCode();
  const { selectedWorkerId, selectWorker } = useLayout();
  const [filter, setFilter] = createSignal<"all" | "active" | "idle">("all");

  // Map workers by session ID for quick lookup
  const workersBySession = createMemo(() => {
    const map = new Map<string, WorkerRuntime>();
    for (const worker of workers()) {
      if (worker.sessionId) {
        map.set(worker.sessionId, worker);
      }
    }
    return map;
  });

  // Filter sessions
  const filteredSessions = createMemo(() => {
    const all = sessions();
    const f = filter();

    if (f === "all") return all;

    return all.filter(session => {
      const worker = workersBySession().get(session.id);
      const status = getSessionStatus(session, worker);

      if (f === "active") return status === "busy" || status === "starting";
      if (f === "idle") return status === "ready" || status === "stopped";
      return true;
    });
  });

  // Stats
  const stats = createMemo(() => {
    const all = sessions();
    let active = 0;
    let idle = 0;

    for (const session of all) {
      const worker = workersBySession().get(session.id);
      const status = getSessionStatus(session, worker);
      if (status === "busy" || status === "starting") active++;
      else idle++;
    }

    return { total: all.length, active, idle };
  });

  const handleNew = async () => {
    const session = await createSession();
    if (session) selectWorker(session.id);
  };

  const handleDelete = async (id: string) => {
    await deleteSession(id);
    if (selectedWorkerId() === id) {
      const remaining = sessions().filter(s => s.id !== id);
      if (remaining.length > 0) {
        selectWorker(remaining[0].id);
      } else {
        selectWorker(null);
      }
    }
  };

  const handleAbort = async (id: string) => {
    await abortSession(id);
  };

  return (
    <div class="flex flex-col h-full">
      {/* Header */}
      <div class="p-3 border-b border-border">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-semibold text-foreground">Sessions</h2>
          <button class="btn btn-sm btn-ghost" onClick={handleNew}>
            <PlusIcon />
            New
          </button>
        </div>

        {/* Stats */}
        <div class="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{stats().total} total</span>
          <span class="flex items-center gap-1">
            <span class="status-dot busy" />
            {stats().active} active
          </span>
          <span class="flex items-center gap-1">
            <span class="status-dot stopped" />
            {stats().idle} idle
          </span>
        </div>

        {/* Filter tabs */}
        <div class="flex items-center gap-1 mt-3">
          <button
            class={`btn btn-xs ${filter() === "all" ? "" : "btn-ghost"}`}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            class={`btn btn-xs ${filter() === "active" ? "" : "btn-ghost"}`}
            onClick={() => setFilter("active")}
          >
            Active
          </button>
          <button
            class={`btn btn-xs ${filter() === "idle" ? "" : "btn-ghost"}`}
            onClick={() => setFilter("idle")}
          >
            Idle
          </button>
        </div>
      </div>

      {/* List */}
      <div class="flex-1 overflow-auto scrollbar-thin">
        <Show
          when={filteredSessions().length > 0}
          fallback={
            <div class="empty-state">
              <div class="empty-state-icon">
                <SendIcon />
              </div>
              <p class="empty-state-title">No sessions</p>
              <p class="empty-state-description">
                {filter() === "all"
                  ? "Start a new chat to begin"
                  : `No ${filter()} sessions`}
              </p>
              <Show when={filter() === "all"}>
                <button class="btn btn-sm" onClick={handleNew}>
                  <PlusIcon />
                  New Session
                </button>
              </Show>
            </div>
          }
        >
          <For each={filteredSessions()}>
            {(session) => (
              <SessionItem
                session={session}
                worker={workersBySession().get(session.id)}
                isSelected={selectedWorkerId() === session.id}
                onSelect={() => selectWorker(session.id)}
                onDelete={() => handleDelete(session.id)}
                onAbort={() => handleAbort(session.id)}
              />
            )}
          </For>
        </Show>
      </div>
    </div>
  );
};

export { SessionList as WorkerList };
