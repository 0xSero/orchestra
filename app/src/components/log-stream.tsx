/**
 * LogsPanel - Simple event log view
 */

import { type Component, For, Show } from "solid-js";
import { type OpenCodeEventItem, useOpenCode } from "@/context/opencode";
import { formatRelativeTime } from "@/lib/utils";

export const LogsPanel: Component = () => {
  const { events, sessions } = useOpenCode();

  const describeEvent = (event: OpenCodeEventItem): string => {
    const payload = event.payload;
    const asRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
    const payloadRecord = asRecord(payload) ? payload : {};
    const props = asRecord(payloadRecord.properties) ? payloadRecord.properties : {};

    if (payloadRecord.type === "orchestra.event") {
      const inner = asRecord(payloadRecord.payload) ? payloadRecord.payload : undefined;
      return typeof inner?.type === "string" ? inner.type : "orchestra.event";
    }
    if (typeof payloadRecord.type === "string" && payloadRecord.type.startsWith("session.")) {
      const info = asRecord(props.info) ? props.info : undefined;
      if (info && typeof info.title === "string") {
        return `${payloadRecord.type}: ${info.title}`;
      }
    }
    if (payloadRecord.type === "message.updated") {
      const info = asRecord(props.info) ? props.info : undefined;
      return `message.updated: ${typeof info?.role === "string" ? info.role : "message"}`;
    }
    return typeof payloadRecord.type === "string" ? payloadRecord.type : event.type;
  };

  return (
    <div class="flex flex-col h-full">
      {/* Header */}
      <div class="flex items-center justify-between px-4 py-2 border-b border-border">
        <span class="text-sm font-medium">Logs</span>
        <span class="text-xs text-muted-foreground">{events().length} events</span>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-auto scrollbar-thin p-4">
        {/* Events */}
        <div class="mb-6">
          <h3 class="text-xs text-muted-foreground uppercase tracking-wider mb-3">Events</h3>
          <Show when={events().length > 0} fallback={<p class="text-sm text-muted-foreground">No events</p>}>
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
          <h3 class="text-xs text-muted-foreground uppercase tracking-wider mb-3">Recent Sessions</h3>
          <Show when={sessions().length > 0} fallback={<p class="text-sm text-muted-foreground">No sessions</p>}>
            <div class="space-y-2">
              <For each={sessions().slice(0, 10)}>
                {(session) => (
                  <div class="flex items-center justify-between text-xs">
                    <span class="text-foreground truncate">{session.title || "Untitled"}</span>
                    <span class="text-muted-foreground">{formatRelativeTime(session.time.updated)}</span>
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
