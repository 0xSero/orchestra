/**
 * SessionList Component - Sidebar list of OpenCode sessions
 */

import { type Component, For, Show, createMemo } from "solid-js";
import { useOpenCode, type Session } from "@/context/opencode";
import { useLayout } from "@/context/layout";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, formatRelativeTime } from "@/lib/utils";

// Icons
const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </svg>
);

const MessageIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const FileIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
  </svg>
);

interface SessionItemProps {
  session: Session;
  isSelected: boolean;
  onSelect: () => void;
}

const SessionItem: Component<SessionItemProps> = (props) => {
  const hasChanges = () => props.session.summary &&
    (props.session.summary.additions > 0 || props.session.summary.deletions > 0);

  const isRecent = () => Date.now() - props.session.time.updated < 300000; // 5 min

  return (
    <button
      class={cn(
        "w-full flex items-start gap-3 p-3 rounded-lg text-left transition-colors",
        "hover:bg-accent focus:bg-accent focus:outline-none",
        props.isSelected && "bg-accent"
      )}
      onClick={props.onSelect}
    >
      {/* Avatar */}
      <div class="relative flex-shrink-0">
        <div class={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center",
          isRecent() ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
        )}>
          <MessageIcon />
        </div>
      </div>

      {/* Info */}
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between gap-2">
          <span class="font-medium text-sm text-foreground truncate">
            {props.session.title || "Untitled Session"}
          </span>
          <span class="text-[10px] text-muted-foreground flex-shrink-0">
            {formatRelativeTime(props.session.time.updated)}
          </span>
        </div>

        {/* Summary stats */}
        <Show when={hasChanges()}>
          <div class="flex items-center gap-2 mt-1">
            <span class="text-xs text-muted-foreground flex items-center gap-1">
              <FileIcon />
              {props.session.summary!.files} files
            </span>
            <span class="text-xs text-green-500">
              +{props.session.summary!.additions}
            </span>
            <span class="text-xs text-red-500">
              -{props.session.summary!.deletions}
            </span>
          </div>
        </Show>

        {/* Session ID preview */}
        <p class="text-xs text-muted-foreground/50 mt-1 font-mono truncate">
          {props.session.id.slice(0, 16)}...
        </p>
      </div>
    </button>
  );
};

export const WorkerList: Component = () => {
  const { sessions, createSession } = useOpenCode();
  const { selectedWorkerId, selectWorker } = useLayout();

  // Group sessions by recency
  const groupedSessions = createMemo(() => {
    const all = sessions();
    const now = Date.now();
    const hourAgo = now - 3600000;
    const dayAgo = now - 86400000;

    return {
      recent: all.filter((s) => s.time.updated > hourAgo),
      today: all.filter((s) => s.time.updated <= hourAgo && s.time.updated > dayAgo),
      older: all.filter((s) => s.time.updated <= dayAgo),
    };
  });

  const hasSessions = () => sessions().length > 0;

  const handleNewSession = async () => {
    const session = await createSession();
    if (session) {
      selectWorker(session.id);
    }
  };

  return (
    <div class="flex flex-col h-full">
      {/* Header */}
      <div class="flex items-center justify-between p-4 border-b border-border">
        <h2 class="font-semibold text-foreground">Sessions</h2>
        <Button variant="ghost" size="icon" class="h-8 w-8" onClick={handleNewSession}>
          <PlusIcon />
        </Button>
      </div>

      {/* Session list */}
      <ScrollArea class="flex-1">
        <div class="p-2 space-y-1">
          <Show
            when={hasSessions()}
            fallback={
              <div class="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div class="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <MessageIcon />
                </div>
                <p class="text-sm text-muted-foreground mb-2">
                  No sessions yet
                </p>
                <Button variant="outline" size="sm" class="gap-2" onClick={handleNewSession}>
                  <PlusIcon />
                  New Session
                </Button>
              </div>
            }
          >
            {/* Recent sessions */}
            <Show when={groupedSessions().recent.length > 0}>
              <div class="mb-2">
                <p class="text-xs text-muted-foreground px-3 py-1 uppercase tracking-wider">
                  Recent ({groupedSessions().recent.length})
                </p>
                <For each={groupedSessions().recent}>
                  {(session) => (
                    <SessionItem
                      session={session}
                      isSelected={selectedWorkerId() === session.id}
                      onSelect={() => selectWorker(session.id)}
                    />
                  )}
                </For>
              </div>
            </Show>

            {/* Today's sessions */}
            <Show when={groupedSessions().today.length > 0}>
              <div class="mb-2">
                <p class="text-xs text-muted-foreground px-3 py-1 uppercase tracking-wider">
                  Today ({groupedSessions().today.length})
                </p>
                <For each={groupedSessions().today}>
                  {(session) => (
                    <SessionItem
                      session={session}
                      isSelected={selectedWorkerId() === session.id}
                      onSelect={() => selectWorker(session.id)}
                    />
                  )}
                </For>
              </div>
            </Show>

            {/* Older sessions */}
            <Show when={groupedSessions().older.length > 0}>
              <div class="mb-2">
                <p class="text-xs text-muted-foreground px-3 py-1 uppercase tracking-wider">
                  Older ({groupedSessions().older.length})
                </p>
                <For each={groupedSessions().older}>
                  {(session) => (
                    <SessionItem
                      session={session}
                      isSelected={selectedWorkerId() === session.id}
                      onSelect={() => selectWorker(session.id)}
                    />
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </div>
      </ScrollArea>

      {/* Footer stats */}
      <Show when={hasSessions()}>
        <div class="p-3 border-t border-border">
          <div class="flex items-center justify-between text-xs text-muted-foreground">
            <span>{sessions().length} sessions</span>
            <Button
              variant="ghost"
              size="sm"
              class="h-7 text-xs"
              onClick={() => selectWorker(null)}
            >
              Clear selection
            </Button>
          </div>
        </div>
      </Show>
    </div>
  );
};
