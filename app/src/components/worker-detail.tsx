/**
 * ChatView - vLLM Studio style chat interface
 *
 * Messages in the center, input at the bottom (also centered)
 */

import { type Component, Show, For, createMemo, createEffect, createSignal } from "solid-js";
import { useOpenCode, type Message, type Part } from "@/context/opencode";
import { useLayout } from "@/context/layout";

const AttachmentIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21.44 11.05l-8.49 8.49a5 5 0 0 1-7.07-7.07l8.49-8.49a3.5 3.5 0 0 1 4.95 4.95l-8.49 8.49a2 2 0 0 1-2.83-2.83l7.78-7.78" />
  </svg>
);

const ToolIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0-1.4 0l-1.9 1.9-3-3a2.1 2.1 0 0 0-3 3l3 3-1.9 1.9a1 1 0 0 0 0 1.4l2.8 2.8a1 1 0 0 0 1.4 0l1.9-1.9 3 3a2.1 2.1 0 0 0 3-3l-3-3 1.9-1.9a1 1 0 0 0 0-1.4Z" />
  </svg>
);

const PreviewIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const NetworkIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4.9 19.1a9 9 0 0 1 0-12.2" />
    <path d="M7.8 16.2a5 5 0 0 1 0-8.4" />
    <circle cx="12" cy="12" r="1" />
    <path d="M16.2 16.2a5 5 0 0 0 0-8.4" />
    <path d="M19.1 19.1a9 9 0 0 0 0-12.2" />
  </svg>
);

const SystemIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 3h18v14H3z" />
    <path d="M8 21h8" />
    <path d="M12 17v4" />
  </svg>
);

const EmptyChatIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
  </svg>
);

export const ChatView: Component = () => {
  const { getSession, getSessionMessages, getMessageParts, deleteSession, fetchMessages, sendMessage } =
    useOpenCode();
  const { selectedWorkerId, selectWorker } = useLayout();

  const [message, setMessage] = createSignal("");
  const [isLoading, setIsLoading] = createSignal(false);
  let inputRef: HTMLTextAreaElement | undefined;

  const session = createMemo(() => {
    const id = selectedWorkerId();
    return id ? getSession(id) : undefined;
  });

  const messages = createMemo(() => {
    const id = selectedWorkerId();
    return id ? getSessionMessages(id) : [];
  });

  // Fetch messages when session changes
  createEffect(async () => {
    const id = selectedWorkerId();
    if (id) await fetchMessages(id);
  });

  const getMessageText = (parts: Part[]): string => {
    const textParts = parts.filter(
      (p) => p.type === "text" || p.type === "reasoning"
    ) as Array<{ type: "text" | "reasoning"; text: string }>;
    return textParts
      .map((p) => p.text.trim())
      .filter(Boolean)
      .join("\n");
  };

  const getMessageContent = (msg: Message): string => {
    const parts = getMessageParts(msg.id);
    const text = getMessageText(parts);
    return text || `[${msg.role} message]`;
  };

  const handleSubmit = async () => {
    const text = message().trim();
    const id = selectedWorkerId();
    if (!text || !id || isLoading()) return;

    setIsLoading(true);
    try {
      await sendMessage(id, text, []);
      setMessage("");
      if (inputRef) inputRef.style.height = "auto";
    } catch (err) {
      console.error("Failed to send:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: Event) => {
    const ta = e.target as HTMLTextAreaElement;
    setMessage(ta.value);
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 150)}px`;
  };

  const handleDelete = async () => {
    const s = session();
    if (!s || !confirm(`Delete this session?`)) return;
    await deleteSession(s.id);
    selectWorker(null);
  };

  return (
    <div class="flex flex-col h-full">
      <Show when={session()} fallback={<EmptyState />}>
        {(s) => (
          <>
            {/* Header */}
            <div class="flex items-center justify-between px-4 py-2 border-b border-border">
              <div class="flex items-center gap-3 min-w-0">
                <span class="text-sm font-medium truncate">
                  {s().title || "New Chat"}
                </span>
              </div>
              <button class="btn btn-ghost btn-sm text-muted-foreground" onClick={handleDelete}>
                Delete
              </button>
            </div>

            {/* Messages area */}
            <div class="flex-1 overflow-auto scrollbar-thin">
              <Show
                when={messages().length > 0}
                fallback={
                  <div class="flex flex-col items-center justify-center h-full text-center">
                    <div class="text-muted-foreground mb-3">
                      <EmptyChatIcon />
                    </div>
                    <p class="text-lg text-foreground mb-1">Start a conversation</p>
                    <p class="text-sm text-muted-foreground">Send a message to begin chatting.</p>
                  </div>
                }
              >
                <div class="max-w-3xl mx-auto">
                  <For each={messages()}>
                    {(msg) => (
                      <div class={`message ${msg.role === "user" ? "message-user" : "message-assistant"}`}>
                        <div class="flex items-center gap-2 mb-1">
                          <span class="text-xs font-medium text-muted-foreground uppercase">
                            {msg.role}
                          </span>
                        </div>
                        <div class="text-sm whitespace-pre-wrap">
                          {getMessageContent(msg)}
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </div>

            {/* Input area - centered at bottom */}
            <div class="border-t border-border p-4">
              <div class="max-w-3xl mx-auto">
                <div class="composer">
                  <button class="composer-icon" title="Attach">
                    <AttachmentIcon />
                  </button>
                  <button class="composer-icon" title="Tools">
                    <ToolIcon />
                  </button>
                  <button class="composer-icon" title="Preview">
                    <PreviewIcon />
                  </button>
                  <button class="composer-icon" title="MCP">
                    <NetworkIcon />
                  </button>
                  <button class="composer-icon" title="System">
                    <SystemIcon />
                  </button>
                  <textarea
                    ref={inputRef}
                    value={message()}
                    onInput={handleInput}
                    onKeyDown={handleKeyDown}
                    placeholder="Message..."
                    disabled={isLoading()}
                    rows={1}
                    class="flex-1 bg-transparent text-sm resize-none outline-none min-h-[24px] max-h-[150px] py-1 px-2"
                  />
                  <button
                    class="btn btn-sm"
                    onClick={handleSubmit}
                    disabled={!message().trim() || isLoading()}
                  >
                    {isLoading() ? "..." : "Send"}
                  </button>
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
    <div class="flex flex-col items-center justify-center h-full text-center p-8">
      <div class="text-muted-foreground mb-3">
        <EmptyChatIcon />
      </div>
      <p class="text-lg text-foreground mb-1">Start a conversation</p>
      <p class="text-sm text-muted-foreground mb-4">
        Select a session or create a new one.
      </p>
      <button class="btn" onClick={handleNew}>
        New Chat
      </button>
    </div>
  );
};

// Aliases for backward compatibility
export { ChatView as SessionDetail };
export { ChatView as WorkerDetail };
