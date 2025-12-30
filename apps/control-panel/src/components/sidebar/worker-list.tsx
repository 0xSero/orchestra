/**
 * SessionList - Session sidebar with real data, actions, and status
 */

import { type Component, createMemo, createSignal, For, Show } from "solid-js";
import { PlusIcon, SendIcon } from "@/components/icons/session-icons";
import { useLayout } from "@/context/layout";
import { useOpenCode, type WorkerRuntime } from "@/context/opencode";
import { getSessionStatus } from "@/lib/session-utils";
import { SessionItem } from "./worker-list-item";

/** Sidebar list of sessions with filters and counts. */
export const SessionList: Component = () => {
  const { sessions, workers, createSession, deleteSession, abortSession, getSessionMessages, getMessageParts } =
    useOpenCode();
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

    return all.filter((session) => {
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
      const remaining = sessions().filter((s) => s.id !== id);
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
          <button class={`btn btn-xs ${filter() === "all" ? "" : "btn-ghost"}`} onClick={() => setFilter("all")}>
            All
          </button>
          <button class={`btn btn-xs ${filter() === "active" ? "" : "btn-ghost"}`} onClick={() => setFilter("active")}>
            Active
          </button>
          <button class={`btn btn-xs ${filter() === "idle" ? "" : "btn-ghost"}`} onClick={() => setFilter("idle")}>
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
                {filter() === "all" ? "Start a new chat to begin" : `No ${filter()} sessions`}
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
                messages={getSessionMessages(session.id)}
                getMessageParts={getMessageParts}
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
