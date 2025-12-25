/**
 * SessionDetail Component - Detailed view of a selected OpenCode session
 */

import { type Component, Show, For, createMemo, createEffect } from "solid-js";
import { useOpenCode, type Session, type Message } from "@/context/opencode";
import { useLayout } from "@/context/layout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, formatRelativeTime, truncate } from "@/lib/utils";

// Icons
const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);

const ShareIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <polyline points="16 6 12 2 8 6" />
    <line x1="12" x2="12" y1="2" y2="15" />
  </svg>
);

const MessageIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const FileIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
  </svg>
);

const UserIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const BotIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 8V4H8" />
    <rect width="16" height="12" x="4" y="8" rx="2" />
    <path d="M2 14h2" />
    <path d="M20 14h2" />
    <path d="M15 13v2" />
    <path d="M9 13v2" />
  </svg>
);

export const WorkerDetail: Component = () => {
  const { getSession, getSessionMessages, deleteSession, client } = useOpenCode();
  const { selectedWorkerId, selectWorker } = useLayout();

  const session = createMemo(() => {
    const id = selectedWorkerId();
    return id ? getSession(id) : undefined;
  });

  const messages = createMemo(() => {
    const id = selectedWorkerId();
    return id ? getSessionMessages(id) : [];
  });

  // Fetch messages when session changes
  createEffect(() => {
    const id = selectedWorkerId();
    if (id) {
      client.session.messages({ path: { id } }).catch(console.error);
    }
  });

  const handleDelete = async () => {
    const s = session();
    if (!s) return;
    if (!confirm(`Delete session "${s.title}"?`)) return;
    await deleteSession(s.id);
    selectWorker(null);
  };

  return (
    <Show when={session()} fallback={<EmptyState />}>
      {(s) => (
        <div class="flex flex-col h-full bg-background">
          {/* Header */}
          <div class="flex items-center justify-between p-4 border-b border-border">
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                <MessageIcon />
              </div>
              <div class="min-w-0">
                <h2 class="font-semibold text-foreground truncate">{s().title || "Untitled"}</h2>
                <p class="text-xs text-muted-foreground">{formatRelativeTime(s().time.updated)}</p>
              </div>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <Show when={s().share}>
                <Badge variant="secondary" class="text-[10px]">Shared</Badge>
              </Show>
              <Button variant="ghost" size="icon" onClick={() => selectWorker(null)}>
                <XIcon />
              </Button>
            </div>
          </div>

          <ScrollArea class="flex-1">
            <div class="p-4 space-y-4">
              {/* Session info */}
              <Card>
                <CardHeader class="pb-2">
                  <CardTitle class="text-sm">Session Info</CardTitle>
                </CardHeader>
                <CardContent class="space-y-2">
                  <InfoRow label="ID" value={s().id} mono />
                  <InfoRow label="Version" value={s().version} />
                  <InfoRow label="Created" value={new Date(s().time.created).toLocaleString()} />
                  <Show when={s().parentID}>
                    <InfoRow label="Parent" value={s().parentID!} mono />
                  </Show>
                </CardContent>
              </Card>

              {/* Changes summary */}
              <Show when={s().summary}>
                <Card>
                  <CardHeader class="pb-2">
                    <CardTitle class="text-sm flex items-center gap-2">
                      <FileIcon />
                      Changes
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div class="flex items-center gap-4">
                      <div class="flex items-center gap-1.5">
                        <span class="text-sm text-muted-foreground">Files:</span>
                        <Badge variant="secondary">{s().summary!.files}</Badge>
                      </div>
                      <div class="flex items-center gap-1.5">
                        <span class="text-sm text-green-500">+{s().summary!.additions}</span>
                        <span class="text-sm text-red-500">-{s().summary!.deletions}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Show>

              {/* Messages */}
              <Card>
                <CardHeader class="pb-2">
                  <CardTitle class="text-sm flex items-center gap-2">
                    <MessageIcon />
                    Messages ({messages().length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Show
                    when={messages().length > 0}
                    fallback={
                      <p class="text-sm text-muted-foreground">No messages in this session</p>
                    }
                  >
                    <div class="space-y-3">
                      <For each={messages().slice(0, 10)}>
                        {(msg) => (
                          <div
                            class={cn(
                              "flex gap-3 p-3 rounded-lg",
                              msg.role === "user" ? "bg-muted" : "bg-primary/5"
                            )}
                          >
                            <div class={cn(
                              "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0",
                              msg.role === "user" ? "bg-muted-foreground/20" : "bg-primary/20"
                            )}>
                              {msg.role === "user" ? <UserIcon /> : <BotIcon />}
                            </div>
                            <div class="flex-1 min-w-0">
                              <div class="flex items-center gap-2 mb-1">
                                <span class="text-xs font-medium text-foreground capitalize">
                                  {msg.role}
                                </span>
                                <span class="text-xs text-muted-foreground">
                                  {formatRelativeTime(msg.time.created)}
                                </span>
                              </div>
                              <p class="text-sm text-muted-foreground line-clamp-3">
                                {getMessagePreview(msg)}
                              </p>
                            </div>
                          </div>
                        )}
                      </For>
                      <Show when={messages().length > 10}>
                        <p class="text-xs text-muted-foreground text-center">
                          + {messages().length - 10} more messages
                        </p>
                      </Show>
                    </div>
                  </Show>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>

          {/* Actions */}
          <div class="p-4 border-t border-border">
            <div class="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                class="flex-1 gap-1.5"
                onClick={() => {
                  // TODO: Share session
                }}
              >
                <ShareIcon />
                Share
              </Button>
              <Button
                variant="destructive"
                size="sm"
                class="gap-1.5"
                onClick={handleDelete}
              >
                <TrashIcon />
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </Show>
  );
};

// Get a preview of message content
function getMessagePreview(msg: Message): string {
  if (msg.role === "user") {
    // User messages might have summary with title
    const userMsg = msg as { summary?: { title?: string } };
    if (userMsg.summary?.title) {
      return userMsg.summary.title;
    }
  }
  // For assistant messages or fallback
  return `Message from ${msg.role}`;
}

// Empty state when no session is selected
const EmptyState: Component = () => {
  return (
    <div class="flex flex-col items-center justify-center h-full p-8 text-center">
      <div class="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <h3 class="font-medium text-foreground mb-1">No Session Selected</h3>
      <p class="text-sm text-muted-foreground max-w-[200px]">
        Select a session from the sidebar to view its details
      </p>
    </div>
  );
};

// Info row helper
interface InfoRowProps {
  label: string;
  value: string;
  mono?: boolean;
}

const InfoRow: Component<InfoRowProps> = (props) => {
  return (
    <div class="flex items-start justify-between gap-4">
      <span class="text-sm text-muted-foreground">{props.label}</span>
      <span
        class={cn(
          "text-sm text-foreground text-right truncate max-w-[60%]",
          props.mono && "font-mono text-xs"
        )}
        title={props.value}
      >
        {props.value}
      </span>
    </div>
  );
};
