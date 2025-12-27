import { type Component, createMemo, createSignal, Show } from "solid-js";
import { ClockIcon, MessageIcon, ServerIcon, StopIcon, XIcon } from "@/components/icons/session-icons";
import type { Message, Part, Session, WorkerRuntime } from "@/context/opencode";
import { formatDuration, getSessionStatus, getStatusLabel } from "@/lib/session-utils";
import { getMessagePreview, getSessionModel } from "./worker-list-utils";

interface SessionItemProps {
  session: Session;
  worker?: WorkerRuntime;
  messages: Message[];
  getMessageParts: (messageId: string) => Part[];
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onAbort: () => void;
}

/** Session list item showing status, meta, and actions. */
export const SessionItem: Component<SessionItemProps> = (props) => {
  const [showActions, setShowActions] = createSignal(false);

  const status = createMemo(() => getSessionStatus(props.session, props.worker));
  const duration = createMemo(() => formatDuration(props.session.time.created));
  const port = createMemo(() => props.worker?.port);
  const model = createMemo(() => getSessionModel(props.session, props.worker));
  const messageCount = createMemo(() => props.messages.length);
  const lastMessagePreview = createMemo(() => getMessagePreview(props.messages, props.getMessageParts));

  return (
    <div
      class={`session-item ${props.isSelected ? "selected" : ""}`}
      onClick={props.onSelect}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div class="session-item-header">
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <span class={`status-dot ${status()}`} />
          <span class="session-item-title">{props.session.title || "Untitled Session"}</span>
        </div>

        <div class={`session-item-actions ${showActions() ? "opacity-100" : ""}`}>
          <Show when={status() === "busy"}>
            <button
              class="btn btn-ghost btn-icon p-1"
              onClick={(event) => {
                event.stopPropagation();
                props.onAbort();
              }}
              title="Stop session"
            >
              <StopIcon />
            </button>
          </Show>
          <button
            class="btn btn-ghost btn-icon p-1 text-destructive hover:text-destructive"
            onClick={(event) => {
              event.stopPropagation();
              props.onDelete();
            }}
            title="Delete session"
          >
            <XIcon />
          </button>
        </div>
      </div>

      <div class="session-item-meta">
        <span class="flex items-center gap-1">
          <ClockIcon />
          {duration()}
        </span>

        <Show when={port()}>
          <span class="flex items-center gap-1 font-mono">
            <ServerIcon />:{port()}
          </span>
        </Show>

        <span class="flex items-center gap-1">
          <MessageIcon />
          {messageCount()}
        </span>

        <span class="truncate">{model()}</span>
      </div>

      <Show when={lastMessagePreview()}>
        <div class="mt-1.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">{lastMessagePreview()}</div>
      </Show>

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
