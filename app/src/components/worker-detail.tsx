/**
 * ChatView - Chat interface with session metadata header
 */

import { type Component, createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { ChatIcon } from "@/components/icons/session-icons";
import { type Attachment as PromptAttachment, PromptInput } from "@/components/prompt-input";
import { WorkerDetailEmptyState } from "@/components/worker-detail-empty";
import { WorkerDetailHeader } from "@/components/worker-detail-header";
import { WorkerMessage } from "@/components/worker-detail-message";
import { useLayout } from "@/context/layout";
import { useOpenCode } from "@/context/opencode";
import { getSessionStatus } from "@/lib/session-utils";

/** Primary chat view for a selected session. */
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

  const worker = createMemo(() => {
    const id = selectedWorkerId();
    if (!id) return undefined;
    return workers().find((item) => item.sessionId === id);
  });

  const status = createMemo(() => getSessionStatus(session(), worker()));
  const isBusy = createMemo(() => status() === "busy" || status() === "starting");

  createEffect(async () => {
    const id = selectedWorkerId();
    if (id) await fetchMessages(id);
  });

  createEffect(() => {
    messages();
    setTimeout(() => {
      messagesEndRef?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  });

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
    const currentSession = session();
    if (!currentSession || !confirm("Delete this session?")) return;
    await deleteSession(currentSession.id);
    selectWorker(null);
  };

  const handleAbort = async () => {
    const id = selectedWorkerId();
    if (id) await abortSession(id);
  };

  return (
    <div class="flex flex-col h-full">
      <Show when={session()} fallback={<WorkerDetailEmptyState />}>
        {(currentSession) => (
          <>
            <WorkerDetailHeader
              session={currentSession()}
              status={status()}
              worker={worker()}
              onAbort={handleAbort}
              onDelete={handleDelete}
            />

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
                    {(message) => <WorkerMessage message={message} getMessageParts={getMessageParts} />}
                  </For>
                  <div ref={messagesEndRef} />
                </div>
              </Show>
            </div>

            <div class="p-4 bg-background/50">
              <div class="max-w-3xl mx-auto">
                <PromptInput
                  onSubmit={handleSubmit}
                  onCancel={handleAbort}
                  isLoading={isSending() || isBusy()}
                  allowFilePicker
                  placeholder="Message..."
                />
              </div>
            </div>
          </>
        )}
      </Show>
    </div>
  );
};

export { ChatView as SessionDetail };
export { ChatView as WorkerDetail };
