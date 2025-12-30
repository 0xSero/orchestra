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

    if (typeof payloadRecord.type === "string" && payloadRecord.type.startsWith("orchestra.")) {
      const data = asRecord(payloadRecord.data) ? payloadRecord.data : {};
      if (payloadRecord.type === "orchestra.worker.status") {
        const worker = asRecord(data.worker) ? data.worker : undefined;
        const workerId = typeof worker?.id === "string" ? worker.id : "worker";
        const status = typeof data.status === "string" ? data.status : "status";
        return `${payloadRecord.type}: ${workerId} ${status}`;
      }
      if (payloadRecord.type === "orchestra.worker.stream") {
        const chunk = asRecord(data.chunk) ? data.chunk : undefined;
        const workerId = typeof chunk?.workerId === "string" ? chunk.workerId : "worker";
        return `${payloadRecord.type}: ${workerId}`;
      }
      if (payloadRecord.type === "orchestra.workflow.step") {
        const workflowId = typeof data.workflowId === "string" ? data.workflowId : "workflow";
        const stepId = typeof data.stepId === "string" ? data.stepId : "step";
        return `${payloadRecord.type}: ${workflowId}/${stepId}`;
      }
      if (payloadRecord.type.startsWith("orchestra.workflow.")) {
        const workflowId = typeof data.workflowId === "string" ? data.workflowId : "workflow";
        return `${payloadRecord.type}: ${workflowId}`;
      }
      if (payloadRecord.type === "orchestra.memory.written") {
        const key = typeof data.key === "string" ? data.key : undefined;
        const fromKey = typeof data.fromKey === "string" ? data.fromKey : undefined;
        const toKey = typeof data.toKey === "string" ? data.toKey : undefined;
        const label = key ?? (fromKey && toKey ? `${fromKey} -> ${toKey}` : "memory");
        return `${payloadRecord.type}: ${label}`;
      }
      if (payloadRecord.type === "orchestra.error") {
        const message = typeof data.message === "string" ? data.message : "error";
        return `${payloadRecord.type}: ${message}`;
      }
      return payloadRecord.type;
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
