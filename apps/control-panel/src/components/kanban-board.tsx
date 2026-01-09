/**
 * Kanban Board - Linear-style task board
 * Drag & drop powered by native HTML drag/drop API
 */

import { type Component, createSignal, For, Show } from "solid-js";
import { type Issue, type IssueStatus, type IssuesStore } from "@/lib/issues-store";

const PlusIcon: Component = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

type KanbanColumnProps = {
  status: IssueStatus;
  title: string;
  issues: Issue[];
  onIssueClick: (issue: Issue) => void;
  onDrop: (issueId: string, newStatus: IssueStatus) => void;
};

const KanbanColumn: Component<KanbanColumnProps> = (props) => {
  const [dragOver, setDragOver] = createSignal(false);

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const issueId = e.dataTransfer?.getData("text/plain");
    if (issueId) {
      props.onDrop(issueId, props.status);
    }
  };

  const getPriorityColor = (priority?: Issue["priority"]) => {
    switch (priority) {
      case "urgent":
        return "text-status-error";
      case "high":
        return "text-status-busy";
      case "medium":
        return "text-muted-foreground";
      case "low":
        return "text-muted-foreground/50";
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <div class="flex flex-col min-w-[280px] max-w-[320px]">
      {/* Column header */}
      <div class="px-3 py-2 border-b border-border bg-card/30">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium text-foreground">{props.title}</h3>
          <span class="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted">
            {props.issues.length}
          </span>
        </div>
      </div>

      {/* Drop zone */}
      <div
        class="flex-1 p-2 space-y-2 overflow-y-auto scrollbar-thin min-h-[200px]"
        classList={{
          "bg-accent/20 border-2 border-dashed border-primary": dragOver(),
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <For each={props.issues}>
          {(issue) => (
            <div
              draggable={true}
              onDragStart={(e) => {
                e.dataTransfer!.effectAllowed = "move";
                e.dataTransfer!.setData("text/plain", issue.id);
              }}
              onClick={() => props.onIssueClick(issue)}
              class="p-3 bg-card border border-border rounded-md cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all group"
            >
              {/* Title */}
              <h4 class="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                {issue.title}
              </h4>

              {/* Description preview */}
              <Show when={issue.description}>
                <p class="mt-1 text-xs text-muted-foreground line-clamp-2">
                  {issue.description}
                </p>
              </Show>

              {/* Meta */}
              <div class="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Show when={issue.priority}>
                  <span class={`font-medium uppercase ${getPriorityColor(issue.priority)}`}>
                    {issue.priority}
                  </span>
                </Show>

                <Show when={issue.labels && issue.labels.length > 0}>
                  <For each={issue.labels}>
                    {(label) => (
                      <span class="px-1.5 py-0.5 bg-muted rounded text-xs">
                        {label}
                      </span>
                    )}
                  </For>
                </Show>
              </div>
            </div>
          )}
        </For>

        {/* Empty state */}
        <Show when={props.issues.length === 0 && !dragOver()}>
          <div class="flex items-center justify-center h-32 text-xs text-muted-foreground/50">
            No issues
          </div>
        </Show>
      </div>
    </div>
  );
};

type KanbanBoardProps = {
  store: IssuesStore;
  onIssueClick: (issue: Issue) => void;
  onNewIssue: () => void;
};

export const KanbanBoard: Component<KanbanBoardProps> = (props) => {
  const columns: Array<{ status: IssueStatus; title: string }> = [
    { status: "backlog", title: "Backlog" },
    { status: "todo", title: "Todo" },
    { status: "in_progress", title: "In Progress" },
    { status: "in_review", title: "In Review" },
    { status: "done", title: "Done" },
  ];

  const handleDrop = (issueId: string, newStatus: IssueStatus) => {
    props.store.moveIssue(issueId, newStatus);
  };

  return (
    <div class="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div class="px-6 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-semibold text-foreground">Tasks</h1>
          <p class="text-sm text-muted-foreground">
            Manage issues and track progress across your workflow.
          </p>
        </div>

        <button
          type="button"
          class="btn btn-primary flex items-center gap-2"
          onClick={props.onNewIssue}
        >
          <PlusIcon />
          New Issue
        </button>
      </div>

      {/* Board */}
      <div class="flex-1 overflow-x-auto overflow-y-hidden">
        <div class="h-full flex gap-4 p-4">
          <For each={columns}>
            {(column) => (
              <KanbanColumn
                status={column.status}
                title={column.title}
                issues={props.store.getIssuesByStatus(column.status)}
                onIssueClick={props.onIssueClick}
                onDrop={handleDrop}
              />
            )}
          </For>
        </div>
      </div>
    </div>
  );
};
