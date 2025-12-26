/**
 * Activity panel - lightweight view of recent session updates.
 */

import { type Component, For, Show, createMemo } from "solid-js";
import { useOpenCode } from "@/context/opencode";
import { formatRelativeTime } from "@/lib/utils";

const ClockIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

export const JobQueue: Component = () => {
  const { sessions } = useOpenCode();

  const recent = createMemo(() => sessions().slice(0, 20));

  return (
    <div class="flex flex-col h-full bg-background">
      <div class="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <h2 class="text-sm font-medium text-foreground">Activity</h2>
        <span class="text-xs text-muted-foreground">{sessions().length} sessions</span>
      </div>

      <div class="flex-1 overflow-auto">
        <Show
          when={recent().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center h-full p-4 text-center">
              <div class="text-muted-foreground/50">
                <ClockIcon />
              </div>
              <p class="text-sm text-muted-foreground mt-3">No recent activity</p>
            </div>
          }
        >
          <div class="p-3 space-y-2">
            <For each={recent()}>
              {(session) => (
                <div class="rounded-md border border-border/60 px-3 py-2">
                  <div class="text-sm text-foreground truncate">{session.title || "Untitled Session"}</div>
                  <div class="text-xs text-muted-foreground">
                    Updated {formatRelativeTime(session.time.updated)}
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
};
