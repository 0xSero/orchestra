/**
 * Tasks Kanban Page - Linear-style kanban board for issues
 */

import { type Component, createSignal } from "solid-js";
import { KanbanBoard } from "@/components/kanban-board";
import { IssueDetailDrawer } from "@/components/issue-detail-drawer";
import { NewIssueModal } from "@/components/new-issue-modal";
import { createIssuesStore, type Issue } from "@/lib/issues-store";

export const TasksKanbanPage: Component = () => {
  const store = createIssuesStore();
  const [newIssueModalOpen, setNewIssueModalOpen] = createSignal(false);

  const handleIssueClick = (issue: Issue) => {
    store.setSelectedIssueId(issue.id);
  };

  const handleNewIssue = () => {
    setNewIssueModalOpen(true);
  };

  return (
    <>
      <KanbanBoard
        store={store}
        onIssueClick={handleIssueClick}
        onNewIssue={handleNewIssue}
      />

      <IssueDetailDrawer store={store} />

      <NewIssueModal
        open={newIssueModalOpen()}
        onClose={() => setNewIssueModalOpen(false)}
        store={store}
      />
    </>
  );
};
