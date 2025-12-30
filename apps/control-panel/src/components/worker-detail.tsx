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
    workerStreams,
  } = useOpenCode();
  const { selectedWorkerId, selectWorker, activeSubagentSessionId, returnToParentSession } = useLayout();

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
  const stream = createMemo(() => {
    const id = worker()?.id;
    if (!id) return undefined;
    return workerStreams().find((item) => item.workerId === id);
  });

  const status = createMemo(() => getSessionStatus(session(), worker()));
  const isBusy = createMemo(() => status() === "busy" || status() === "starting");
  const isSubagentView = createMemo(() => {
    const activeId = activeSubagentSessionId();
    const selected = selectedWorkerId();
    return Boolean(activeId && selected && activeId === selected);
  });

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
            <Show when={isSubagentView()}>
              <div class="flex items-center justify-between gap-3 px-4 py-2 text-xs bg-muted/40 border-b border-border">
                <div class="min-w-0">
                  <span class="font-semibold text-foreground">Subagent active</span>
                  <span class="text-muted-foreground ml-2 truncate">
                    {worker()?.name ?? currentSession().title ?? "Worker session"}
                  </span>
                </div>
                <button class="btn btn-xs btn-ghost" onClick={returnToParentSession}>
                  Return to parent
                </button>
              </div>
            </Show>
            <WorkerDetailHeader
              session={currentSession()}
              status={status()}
              worker={worker()}
              onAbort={handleAbort}
              onDelete={handleDelete}
            />

            <div class="flex-1 overflow-auto scrollbar-thin">
              <Show when={isSubagentView() && stream()}>
                <div class="max-w-3xl mx-auto px-4 pt-4">
                  <div class="rounded-lg border border-border/60 bg-muted/40 p-3 text-xs">
                    <div class="text-[10px] uppercase text-muted-foreground mb-2">Live output</div>
                    <div class="whitespace-pre-wrap text-foreground">{stream()?.chunk}</div>
                  </div>
                </div>
              </Show>
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
                  disabled={isSubagentView()}
                  allowFilePicker
                  placeholder={isSubagentView() ? "Subagent session is read-only" : "Message..."}
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
