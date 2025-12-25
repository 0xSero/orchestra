/**
 * SessionGrid Component - Grid display of all sessions
 */

import { type Component, For, Show } from "solid-js";
import { useOpenCode } from "@/context/opencode";
import { useLayout } from "@/context/layout";
import { WorkerCard } from "./worker-card";

const MessageIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export const WorkerGrid: Component = () => {
  const { sessions, deleteSession } = useOpenCode();
  const { selectedWorkerId, selectWorker } = useLayout();

  const handleDelete = async (sessionId: string) => {
    await deleteSession(sessionId);
    if (selectedWorkerId() === sessionId) {
      selectWorker(null);
    }
  };

  return (
    <div class="p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-medium text-foreground">Sessions</h2>
        <span class="text-sm text-muted-foreground">{sessions().length} total</span>
      </div>

      <Show
        when={sessions().length > 0}
        fallback={
          <div class="flex items-center justify-center h-48 text-muted-foreground">
            <div class="text-center">
              <div class="mb-3 flex justify-center">
                <MessageIcon />
              </div>
              <p class="mb-2">No sessions yet</p>
              <p class="text-sm text-muted-foreground/70">Sessions will appear here when created</p>
            </div>
          </div>
        }
      >
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <For each={sessions()}>
            {(session) => (
              <WorkerCard
                session={session}
                selected={selectedWorkerId() === session.id}
                onClick={() =>
                  selectWorker(
                    selectedWorkerId() === session.id ? null : session.id
                  )
                }
                onDelete={() => handleDelete(session.id)}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};
