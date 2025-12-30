import { type Component, Show } from "solid-js";
import { ClockIcon, ServerIcon, StopIcon, TrashIcon } from "@/components/icons/session-icons";
import type { Session, WorkerRuntime } from "@/context/opencode";
import { formatDuration, getStatusLabel, type SessionStatus } from "@/lib/session-utils";

interface WorkerDetailHeaderProps {
  session: Session;
  status: SessionStatus;
  worker?: WorkerRuntime;
  onAbort: () => void;
  onDelete: () => void;
}

/** Header bar showing session metadata and actions. */
export const WorkerDetailHeader: Component<WorkerDetailHeaderProps> = (props) => (
  <div class="border-b border-border bg-card/50">
    <div class="flex items-center justify-between px-4 py-3">
      <div class="flex items-center gap-4 min-w-0">
        <div class="flex items-center gap-2">
          <span class={`status-dot ${props.status}`} />
          <span class="text-sm font-medium text-foreground truncate">{props.session.title || "Untitled Session"}</span>
        </div>

        <span class={`status-badge ${props.status}`}>{getStatusLabel(props.status)}</span>
      </div>

      <div class="flex items-center gap-2">
        <Show when={props.status === "busy"}>
          <button class="btn btn-sm btn-ghost" onClick={props.onAbort} title="Stop session">
            <StopIcon />
            Stop
          </button>
        </Show>
        <button
          class="btn btn-sm btn-ghost text-destructive hover:text-destructive"
          onClick={props.onDelete}
          title="Delete session"
        >
          <TrashIcon />
          Delete
        </button>
      </div>
    </div>

    <div class="flex items-center gap-4 px-4 py-2 text-xs text-muted-foreground border-t border-border/50 bg-muted/30">
      <span class="flex items-center gap-1.5">
        <ClockIcon />
        Running: {formatDuration(props.session.time.created)}
      </span>

      <Show when={props.worker?.port}>
        <span class="flex items-center gap-1.5 font-mono">
          <ServerIcon />
          Port: {props.worker?.port}
        </span>
      </Show>

      <Show when={props.worker?.serverUrl}>
        <span class="flex items-center gap-1.5 font-mono truncate">URL: {props.worker?.serverUrl}</span>
      </Show>

      <Show when={props.worker?.model}>
        <span class="truncate">Model: {props.worker?.model}</span>
      </Show>

      <span class="font-mono text-muted-foreground/70 truncate">ID: {props.session.id.slice(0, 12)}...</span>
    </div>
  </div>
);
