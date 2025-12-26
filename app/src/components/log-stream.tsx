/**
 * LogsPanel - Simple event log view
 */

import { type Component, For, Show } from "solid-js";
import { useOpenCode, type OpenCodeEventItem } from "@/context/opencode";
import { formatRelativeTime } from "@/lib/utils";

export const LogsPanel: Component = () => {
  const { events, sessions } = useOpenCode();

  const describeEvent = (event: OpenCodeEventItem): string => {
    const payload = event.payload as any;
    const props = payload?.properties ?? {};

    if (payload?.type === "orchestra.event") {
      return payload?.payload?.type ?? "orchestra.event";
    }
    if (payload?.type?.startsWith("session.") && props?.info?.title) {
      return `${payload.type}: ${props.info.title}`;
    }
    if (payload?.type === "message.updated") {
      return `message.updated: ${props?.info?.role ?? "message"}`;
    }
    return payload?.type ?? event.type;
  };

  return (
    <div class="flex flex-col h-full">
      {/* Header */}
      <div class="flex items-center justify-between px-4 py-2 border-b border-border">
        <span class="text-sm font-medium">Logs</span>
        <span class="text-xs text-muted-foreground">
          {events().length} events
        </span>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-auto scrollbar-thin p-4">
        {/* Events */}
        <div class="mb-6">
          <h3 class="text-xs text-muted-foreground uppercase tracking-wider mb-3">
            Events
          </h3>
          <Show
            when={events().length > 0}
            fallback={<p class="text-sm text-muted-foreground">No events</p>}
          >
            <div class="space-y-1">
              <For each={events()}>
                {(event) => (
                  <div class="flex items-start gap-3 text-xs py-1">
                    <span class="text-muted-foreground w-14 flex-shrink-0 text-mono">
                      {formatRelativeTime(event.at)}
                    </span>
                    <span class="text-foreground/80">{describeEvent(event)}</span>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>

        {/* Recent sessions */}
        <div>
          <h3 class="text-xs text-muted-foreground uppercase tracking-wider mb-3">
            Recent Sessions
          </h3>
          <Show
            when={sessions().length > 0}
            fallback={<p class="text-sm text-muted-foreground">No sessions</p>}
          >
            <div class="space-y-2">
              <For each={sessions().slice(0, 10)}>
                {(session) => (
                  <div class="flex items-center justify-between text-xs">
                    <span class="text-foreground truncate">
                      {session.title || "Untitled"}
                    </span>
                    <span class="text-muted-foreground">
                      {formatRelativeTime(session.time.updated)}
                    </span>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};

export { LogsPanel as JobQueue };
