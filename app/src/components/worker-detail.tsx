/**
 * ChatView - Chat interface with session metadata header
 */

import { type Component, createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { type Attachment as PromptAttachment, PromptInput } from "@/components/prompt-input";
import { useLayout } from "@/context/layout";
import { type Message, type Part, useOpenCode, type WorkerRuntime } from "@/context/opencode";

// Icons
const StopIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <rect width="14" height="14" x="5" y="5" rx="2" />
  </svg>
);

const TrashIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);

const ServerIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
    <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
    <line x1="6" x2="6.01" y1="6" y2="6" />
    <line x1="6" x2="6.01" y1="18" y2="18" />
  </svg>
);

const ClockIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="12,6 12,12 16,14" />
  </svg>
);

const ChatIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="48"
    height="48"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
  </svg>
);

// Format duration
const formatDuration = (startTime: number): string => {
  const now = Date.now();
  const diff = now - startTime;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
};

// Get status from session/worker
// Sessions don't have a status field - we infer from:
// 1. Worker status (if we have worker data from orchestra events)
// 2. Recent activity (time.updated within last 30 seconds = likely active)
// 3. Compacting state (time.compacting exists = processing)
const getStatus = (
  session?: { time?: { updated?: number; compacting?: number } },
  worker?: WorkerRuntime,
): "ready" | "busy" | "error" | "stopped" | "starting" => {
  // If we have worker data, use it
  if (worker) {
    if (worker.status === "busy") return "busy";
    if (worker.status === "ready") return "ready";
    if (worker.status === "error") return "error";
    if (worker.status === "starting") return "starting";
    return "stopped";
  }

  if (!session) return "stopped";

  // Check if session is compacting (processing)
  if (session.time?.compacting) return "busy";

  // Check if recently active (updated within last 30 seconds)
  const now = Date.now();
  const lastUpdate = session.time?.updated || 0;
  const timeSinceUpdate = now - lastUpdate;

  if (timeSinceUpdate < 30000) {
    return "busy";
  }

  return "ready";
};

const getStatusLabel = (status: string): string => {
  switch (status) {
    case "ready":
      return "Idle";
    case "busy":
      return "Running";
    case "error":
      return "Error";
    case "starting":
      return "Starting";
    default:
      return "Stopped";
  }
};

export const ChatView: Component = () => {
  const {
    getSession,
    getSessionMessages,
    getMessageParts,
    deleteSession,
    fetchMessages,
    sendMessage,
    abortSession,
    workers,
  } = useOpenCode();
  const { selectedWorkerId, selectWorker } = useLayout();

  const [isSending, setIsSending] = createSignal(false);
  let messagesEndRef: HTMLDivElement | undefined;

  const session = createMemo(() => {
    const id = selectedWorkerId();
    return id ? getSession(id) : undefined;
  });

  const messages = createMemo(() => {
    const id = selectedWorkerId();
    return id ? getSessionMessages(id) : [];
  });

  // Get worker for this session
  const worker = createMemo(() => {
    const id = selectedWorkerId();
    if (!id) return undefined;
    return workers().find((w) => w.sessionId === id);
  });

  const status = createMemo(() => getStatus(session(), worker()));
  const isBusy = createMemo(() => status() === "busy" || status() === "starting");

  // Fetch messages when session changes
  createEffect(async () => {
    const id = selectedWorkerId();
    if (id) await fetchMessages(id);
  });

  // Auto-scroll to bottom when messages change
  createEffect(() => {
    messages(); // Track messages
    setTimeout(() => {
      messagesEndRef?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  });

  const getMessageText = (parts: Part[]): string => {
    const textParts = parts.filter((p) => p.type === "text" || p.type === "reasoning") as Array<{
      type: "text" | "reasoning";
      text: string;
    }>;
    return textParts
      .map((p) => p.text.trim())
      .filter(Boolean)
      .join("\n");
  };

  const getFileParts = (parts: Part[]) =>
    parts.filter((part) => part.type === "file") as Array<
      Part & { type: "file"; url: string; mime: string; filename?: string }
    >;

  const getMessageDisplay = (msg: Message) => {
    const parts = getMessageParts(msg.id);
    return {
      text: getMessageText(parts),
      files: getFileParts(parts),
    };
  };

  const handleSubmit = async (text: string, attachments: PromptAttachment[]) => {
    const id = selectedWorkerId();
    if (!id || isSending()) return;

    setIsSending(true);
    try {
      await sendMessage(id, text, attachments);
    } catch (err) {
      console.error("Failed to send:", err);
    } finally {
      setIsSending(false);
    }
  };

  const handleDelete = async () => {
    const s = session();
    if (!s || !confirm(`Delete this session?`)) return;
    await deleteSession(s.id);
    selectWorker(null);
  };

  const handleAbort = async () => {
    const id = selectedWorkerId();
    if (id) await abortSession(id);
  };

  return (
    <div class="flex flex-col h-full">
      <Show when={session()} fallback={<EmptyState />}>
        {(s) => (
          <>
            {/* Header with metadata */}
            <div class="border-b border-border bg-card/50">
              <div class="flex items-center justify-between px-4 py-3">
                <div class="flex items-center gap-4 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class={`status-dot ${status()}`} />
                    <span class="text-sm font-medium text-foreground truncate">{s().title || "Untitled Session"}</span>
                  </div>

                  <span class={`status-badge ${status()}`}>{getStatusLabel(status())}</span>
                </div>

                <div class="flex items-center gap-2">
                  <Show when={status() === "busy"}>
                    <button class="btn btn-sm btn-ghost" onClick={handleAbort} title="Stop session">
                      <StopIcon />
                      Stop
                    </button>
                  </Show>
                  <button
                    class="btn btn-sm btn-ghost text-destructive hover:text-destructive"
                    onClick={handleDelete}
                    title="Delete session"
                  >
                    <TrashIcon />
                    Delete
                  </button>
                </div>
              </div>

              {/* Metadata bar */}
              <div class="flex items-center gap-4 px-4 py-2 text-xs text-muted-foreground border-t border-border/50 bg-muted/30">
                <span class="flex items-center gap-1.5">
                  <ClockIcon />
                  Running: {formatDuration(s().time.created)}
                </span>

                <Show when={worker()?.port}>
                  <span class="flex items-center gap-1.5 font-mono">
                    <ServerIcon />
                    Port: {worker()?.port}
                  </span>
                </Show>

                <Show when={worker()?.serverUrl}>
                  <span class="flex items-center gap-1.5 font-mono truncate">URL: {worker()?.serverUrl}</span>
                </Show>

                <Show when={worker()?.model}>
                  <span class="truncate">Model: {worker()?.model}</span>
                </Show>

                <span class="font-mono text-muted-foreground/70 truncate">ID: {s().id.slice(0, 12)}...</span>
              </div>
            </div>

            {/* Messages area */}
            <div class="flex-1 overflow-auto scrollbar-thin">
              <Show
                when={messages().length > 0}
                fallback={
                  <div class="empty-state">
                    <div class="empty-state-icon">
                      <ChatIcon />
                    </div>
                    <p class="empty-state-title">Start a conversation</p>
                    <p class="empty-state-description">Send a message to begin chatting.</p>
                  </div>
                }
              >
                <div class="max-w-3xl mx-auto py-4">
                  <For each={messages()}>
                    {(msg) => {
                      const display = getMessageDisplay(msg);
                      const content = display.text || (display.files.length > 0 ? "" : `[${msg.role} message]`);

                      return (
                        <div
                          class={`message ${msg.role === "user" ? "message-user" : "message-assistant"} animate-fade-in`}
                        >
                          <div class="flex items-center gap-2 mb-2">
                            <span class="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              {msg.role}
                            </span>
                          </div>

                          <Show when={content}>
                            <div class="message-content whitespace-pre-wrap">{content}</div>
                          </Show>

                          <Show when={display.files.length > 0}>
                            <div class="mt-3 grid gap-2">
                              <For each={display.files}>
                                {(file) => (
                                  <Show
                                    when={file.mime?.startsWith("image/")}
                                    fallback={
                                      <a
                                        href={file.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        class="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs"
                                      >
                                        <div class="flex flex-col gap-1">
                                          <span class="font-medium text-foreground">
                                            {file.filename ?? "Attachment"}
                                          </span>
                                          <span class="text-[10px] text-muted-foreground">{file.mime}</span>
                                        </div>
                                        <span class="text-[10px] text-muted-foreground">Open</span>
                                      </a>
                                    }
                                  >
                                    <a href={file.url} target="_blank" rel="noopener noreferrer" class="block w-fit">
                                      <img
                                        src={file.url}
                                        alt={file.filename ?? "attachment"}
                                        class="max-h-48 rounded-md border border-border/60"
                                      />
                                    </a>
                                  </Show>
                                )}
                              </For>
                            </div>
                          </Show>
                        </div>
                      );
                    }}
                  </For>
                  <div ref={messagesEndRef} />
                </div>
              </Show>
            </div>

            {/* Input area */}
            <div class="border-t border-border p-4 bg-card/30">
              <div class="max-w-3xl mx-auto">
                <PromptInput
                  onSubmit={handleSubmit}
                  onCancel={handleAbort}
                  isLoading={isSending() || isBusy()}
                  allowFilePicker
                  placeholder="Type a message..."
                />

                <div class="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                  <span>Press Enter to send, Shift+Enter for new line</span>
                  <span>{messages().length} messages</span>
                </div>
              </div>
            </div>
          </>
        )}
      </Show>
    </div>
  );
};

const EmptyState: Component = () => {
  const { createSession } = useOpenCode();
  const { selectWorker } = useLayout();

  const handleNew = async () => {
    const session = await createSession();
    if (session) selectWorker(session.id);
  };

  return (
    <div class="empty-state">
      <div class="empty-state-icon">
        <ChatIcon />
      </div>
      <p class="empty-state-title">Start a conversation</p>
      <p class="empty-state-description">Select a session or create a new one.</p>
      <button class="btn" onClick={handleNew}>
        New Chat
      </button>
    </div>
  );
};

// Aliases for backward compatibility
export { ChatView as SessionDetail };
export { ChatView as WorkerDetail };
