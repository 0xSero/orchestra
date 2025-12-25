/**
 * SessionCard Component - Individual session display card
 */

import { type Component, Show, createMemo } from "solid-js";
import { type Session } from "@/context/opencode";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn, formatRelativeTime } from "@/lib/utils";

// Icons
const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);

const FileIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
  </svg>
);

const MessageIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
  </svg>
);

const ShareIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <polyline points="16 6 12 2 8 6" />
    <line x1="12" x2="12" y1="2" y2="15" />
  </svg>
);

interface SessionCardProps {
  session: Session;
  selected?: boolean;
  onClick?: () => void;
  onDelete?: () => void;
}

export const WorkerCard: Component<SessionCardProps> = (props) => {
  const isRecent = createMemo(() => {
    return Date.now() - props.session.time.updated < 300000; // 5 min
  });

  const hasChanges = createMemo(() => {
    const summary = props.session.summary;
    return summary && (summary.additions > 0 || summary.deletions > 0);
  });

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete session "${props.session.title || "Untitled"}"?`)) {
      props.onDelete?.();
    }
  };

  return (
    <Card
      class={cn(
        "cursor-pointer transition-all hover:border-primary/50",
        props.selected && "border-primary bg-accent"
      )}
      onClick={props.onClick}
    >
      <CardHeader class="pb-2">
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-2">
            <StatusDot
              status={isRecent() ? "ready" : "stopped"}
              pulse={isRecent()}
            />
            <span class="font-medium text-foreground truncate">
              {props.session.title || "Untitled Session"}
            </span>
          </div>
          <div class="flex items-center gap-1.5">
            <Show when={props.session.share}>
              <Badge variant="secondary" class="gap-1 text-[10px]">
                <ShareIcon />
                Shared
              </Badge>
            </Show>
            <Badge variant={isRecent() ? "ready" : "secondary"} class="text-[10px]">
              {isRecent() ? "Active" : "Idle"}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent class="space-y-2">
        {/* Session ID */}
        <div class="flex items-center justify-between">
          <span class="text-xs font-mono text-muted-foreground truncate" title={props.session.id}>
            {props.session.id.slice(0, 16)}...
          </span>
          <span class="text-xs text-muted-foreground">
            v{props.session.version}
          </span>
        </div>

        {/* Changes summary */}
        <Show when={hasChanges()}>
          <div class="flex items-center gap-2 text-xs">
            <span class="flex items-center gap-1 text-muted-foreground">
              <FileIcon />
              {props.session.summary!.files} files
            </span>
            <span class="text-green-500">+{props.session.summary!.additions}</span>
            <span class="text-red-500">-{props.session.summary!.deletions}</span>
          </div>
        </Show>
      </CardContent>

      <CardFooter class="justify-between">
        {/* Last activity */}
        <span class="text-xs text-muted-foreground">
          {formatRelativeTime(props.session.time.updated)}
        </span>

        {/* Quick actions (visible on hover) */}
        <div class="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Tooltip>
            <TooltipTrigger
              as={Button}
              variant="ghost"
              size="icon"
              class="h-7 w-7"
            >
              <MessageIcon />
            </TooltipTrigger>
            <TooltipContent>View messages</TooltipContent>
          </Tooltip>
        </div>
      </CardFooter>

      {/* Actions (shown when selected) */}
      <Show when={props.selected}>
        <div class="flex items-center gap-2 px-4 pb-4 pt-2 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            class="flex-1 gap-1.5"
          >
            <MessageIcon />
            View Details
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
      </Show>
    </Card>
  );
};
