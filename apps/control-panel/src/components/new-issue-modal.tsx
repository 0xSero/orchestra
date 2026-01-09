/**
 * New Issue Modal - Create new issues
 */

import { type Component, createSignal, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { type Issue, type IssuesStore } from "@/lib/issues-store";

const CloseIcon: Component = () => (
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
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

type NewIssueModalProps = {
  open: boolean;
  onClose: () => void;
  store: IssuesStore;
};

export const NewIssueModal: Component<NewIssueModalProps> = (props) => {
  const [title, setTitle] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [priority, setPriority] = createSignal<Issue["priority"]>();

  const handleSubmit = (e: Event) => {
    e.preventDefault();

    if (!title().trim()) {
      alert("Title is required");
      return;
    }

    props.store.createIssue({
      title: title().trim(),
      description: description().trim() || undefined,
      status: "backlog",
      priority: priority(),
    });

    // Reset form
    setTitle("");
    setDescription("");
    setPriority(undefined);

    props.onClose();
  };

  const handleCancel = () => {
    setTitle("");
    setDescription("");
    setPriority(undefined);
    props.onClose();
  };

  return (
    <Show when={props.open}>
      <Portal>
        {/* Backdrop */}
        <div
          class="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 animate-fade-in"
          onClick={handleCancel}
        />

        {/* Modal */}
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            class="w-full max-w-lg bg-card border border-border rounded-lg shadow-2xl animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div class="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 class="text-lg font-semibold text-foreground">New Issue</h2>
              <button
                type="button"
                class="p-2 text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md transition-colors"
                onClick={handleCancel}
              >
                <CloseIcon />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} class="p-6 space-y-4">
              <div>
                <label class="block text-sm font-medium text-foreground mb-2">
                  Title <span class="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  class="input"
                  value={title()}
                  onInput={(e) => setTitle(e.currentTarget.value)}
                  placeholder="Issue title"
                  required
                  autofocus
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-foreground mb-2">
                  Description
                </label>
                <textarea
                  class="input min-h-[120px] resize-y"
                  value={description()}
                  onInput={(e) => setDescription(e.currentTarget.value)}
                  placeholder="Add a description..."
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-foreground mb-2">
                  Priority
                </label>
                <select
                  class="input"
                  value={priority() || ""}
                  onChange={(e) =>
                    setPriority(
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

              {/* Footer */}
              <div class="flex items-center justify-end gap-2 pt-4">
                <button type="button" class="btn" onClick={handleCancel}>
                  Cancel
                </button>
                <button type="submit" class="btn btn-primary">
                  Create Issue
                </button>
              </div>
            </form>
          </div>
        </div>
      </Portal>
    </Show>
  );
};
