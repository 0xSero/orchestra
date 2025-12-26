/**
 * SessionList - Simple sidebar list like vLLM Studio
 */

import { type Component, For, Show } from "solid-js";
import { useOpenCode, type Session } from "@/context/opencode";
import { useLayout } from "@/context/layout";

const getSessionModel = (session: Session) => {
  const s = session as any;
  return (
    s.model ||
    s.agent?.model ||
    s.metadata?.model ||
    s.config?.model ||
    "Default model"
  );
};

const SessionItem: Component<{
  session: Session;
  isSelected: boolean;
  isActive: boolean;
  onSelect: () => void;
}> = (props) => {
  return (
    <button
      class={`sidebar-item w-full text-left ${props.isSelected ? "selected" : ""}`}
      onClick={props.onSelect}
    >
      <div class="flex items-center justify-between gap-2">
        <span class="text-sm text-foreground truncate">
          {props.session.title || "New Chat"}
        </span>
        <span class={`status-dot ${props.isActive ? "" : "opacity-40"}`} />
      </div>
      <span class="sidebar-subtitle truncate">
        {getSessionModel(props.session)}
      </span>
    </button>
  );
};

export const SessionList: Component = () => {
  const { sessions, createSession, activeWorkerSessionIds } = useOpenCode();
  const { selectedWorkerId, selectWorker } = useLayout();

  const handleNew = async () => {
    const session = await createSession();
    if (session) selectWorker(session.id);
  };

  return (
    <div class="flex flex-col h-full">
      {/* Header with new button */}
      <div class="flex items-center justify-between px-3 py-2 border-b border-border">
        <button class="btn btn-ghost btn-sm" onClick={handleNew}>
          + New
        </button>
      </div>

      {/* List */}
      <div class="flex-1 overflow-auto scrollbar-thin">
        <Show
          when={sessions().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center h-full px-4 text-center">
              <p class="text-sm text-muted-foreground mb-3">No sessions</p>
              <button class="btn btn-sm" onClick={handleNew}>
                Start a chat
              </button>
            </div>
          }
        >
          <For each={sessions()}>
            {(session) => (
              <SessionItem
                session={session}
                isSelected={selectedWorkerId() === session.id}
                isActive={activeWorkerSessionIds().has(session.id)}
                onSelect={() => selectWorker(session.id)}
              />
            )}
          </For>
        </Show>
      </div>
    </div>
  );
};

export { SessionList as WorkerList };
