/**
 * Issue Detail Drawer - View and edit issue details
 */

import { type Component, createSignal, Show } from "solid-js";
import { Drawer } from "@/components/ui/drawer";
import { type Issue, type IssueStatus, type IssuesStore } from "@/lib/issues-store";
import { formatRelativeTime } from "@/lib/utils";

type IssueDetailDrawerProps = {
  store: IssuesStore;
};

const TrashIcon: Component = () => (
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
    <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);

export const IssueDetailDrawer: Component<IssueDetailDrawerProps> = (props) => {
  const selectedIssue = () => {
    const id = props.store.selectedIssueId();
    return id ? props.store.getIssue(id) : undefined;
  };

  const [editMode, setEditMode] = createSignal(false);
  const [editTitle, setEditTitle] = createSignal("");
  const [editDescription, setEditDescription] = createSignal("");
  const [editStatus, setEditStatus] = createSignal<IssueStatus>("backlog");
  const [editPriority, setEditPriority] = createSignal<Issue["priority"]>();

  const startEdit = (issue: Issue) => {
    setEditTitle(issue.title);
    setEditDescription(issue.description || "");
    setEditStatus(issue.status);
    setEditPriority(issue.priority);
    setEditMode(true);
  };

  const saveEdit = () => {
    const issue = selectedIssue();
    if (!issue) return;

    props.store.updateIssue(issue.id, {
      title: editTitle(),
      description: editDescription() || undefined,
      status: editStatus(),
      priority: editPriority(),
    });

    setEditMode(false);
  };

  const cancelEdit = () => {
    setEditMode(false);
  };

  const handleDelete = () => {
    const issue = selectedIssue();
    if (!issue) return;

    if (confirm(`Are you sure you want to delete "${issue.title}"?`)) {
      props.store.deleteIssue(issue.id);
      props.store.setSelectedIssueId(null);
    }
  };

  const handleClose = () => {
    setEditMode(false);
    props.store.setSelectedIssueId(null);
  };

  return (
    <Show when={selectedIssue()}>
      {(issue) => (
        <Drawer
          open={props.store.selectedIssueId() !== null}
          onClose={handleClose}
          title={editMode() ? "Edit Issue" : issue().title}
          subtitle={
            editMode()
              ? undefined
              : `Created ${formatRelativeTime(issue().createdAt)}`
          }
          footer={
            <div class="flex items-center justify-between gap-2">
              <button
                type="button"
                class="btn btn-ghost btn-destructive flex items-center gap-2"
                onClick={handleDelete}
              >
                <TrashIcon />
                Delete
              </button>

              <div class="flex items-center gap-2">
                <Show
                  when={editMode()}
                  fallback={
                    <button
                      type="button"
                      class="btn btn-primary"
                      onClick={() => startEdit(issue())}
                    >
                      Edit
                    </button>
                  }
                >
                  <button
                    type="button"
                    class="btn"
                    onClick={cancelEdit}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    class="btn btn-primary"
                    onClick={saveEdit}
                  >
                    Save
                  </button>
                </Show>
              </div>
            </div>
          }
        >
          <Show
            when={editMode()}
            fallback={
              <div class="space-y-6">
                {/* Description */}
                <Show when={issue().description}>
                  <div>
                    <h3 class="text-sm font-medium text-foreground mb-2">Description</h3>
                    <p class="text-sm text-muted-foreground whitespace-pre-wrap">
                      {issue().description}
                    </p>
                  </div>
                </Show>

                {/* Status */}
                <div>
                  <h3 class="text-sm font-medium text-foreground mb-2">Status</h3>
                  <span class="inline-flex px-3 py-1.5 bg-accent text-sm rounded-md capitalize">
                    {issue().status.replace("_", " ")}
                  </span>
                </div>

                {/* Priority */}
                <Show when={issue().priority}>
                  <div>
                    <h3 class="text-sm font-medium text-foreground mb-2">Priority</h3>
                    <span class="inline-flex px-3 py-1.5 bg-muted text-sm rounded-md capitalize">
                      {issue().priority}
                    </span>
                  </div>
                </Show>

                {/* Labels */}
                <Show when={issue().labels && issue().labels!.length > 0}>
                  <div>
                    <h3 class="text-sm font-medium text-foreground mb-2">Labels</h3>
                    <div class="flex flex-wrap gap-2">
                      {issue().labels!.map((label) => (
                        <span class="px-2 py-1 bg-muted text-xs rounded-md">{label}</span>
                      ))}
                    </div>
                  </div>
                </Show>

                {/* Metadata */}
                <div class="pt-4 border-t border-border">
                  <div class="space-y-2 text-xs text-muted-foreground">
                    <div>
                      <span class="font-medium">Created:</span>{" "}
                      {new Date(issue().createdAt).toLocaleString()}
                    </div>
                    <div>
                      <span class="font-medium">Updated:</span>{" "}
                      {new Date(issue().updatedAt).toLocaleString()}
                    </div>
                    <div>
                      <span class="font-medium">ID:</span> {issue().id}
                    </div>
                  </div>
                </div>
              </div>
            }
          >
            {/* Edit form */}
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-foreground mb-2">
                  Title <span class="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  class="input"
                  value={editTitle()}
                  onInput={(e) => setEditTitle(e.currentTarget.value)}
                  placeholder="Issue title"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-foreground mb-2">
                  Description
                </label>
                <textarea
                  class="input min-h-[120px] resize-y"
                  value={editDescription()}
                  onInput={(e) => setEditDescription(e.currentTarget.value)}
                  placeholder="Add a description..."
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-foreground mb-2">
                  Status
                </label>
                <select
                  class="input"
                  value={editStatus()}
                  onChange={(e) => setEditStatus(e.currentTarget.value as IssueStatus)}
                >
                  <option value="backlog">Backlog</option>
                  <option value="todo">Todo</option>
                  <option value="in_progress">In Progress</option>
                  <option value="in_review">In Review</option>
                  <option value="done">Done</option>
                </select>
              </div>

              <div>
                <label class="block text-sm font-medium text-foreground mb-2">
                  Priority
                </label>
                <select
                  class="input"
                  value={editPriority() || ""}
                  onChange={(e) =>
                    setEditPriority(
                      e.currentTarget.value
                        ? (e.currentTarget.value as Issue["priority"])
                        : undefined
                    )
                  }
                >
                  <option value="">None</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
          </Show>
        </Drawer>
      )}
    </Show>
  );
};
