/**
 * Issues Store - Persistence layer for Kanban issues
 * Uses localStorage for simple persistence
 */

import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";

export type IssueStatus = "backlog" | "todo" | "in_progress" | "in_review" | "done";

export type Issue = {
  id: string;
  title: string;
  description?: string;
  status: IssueStatus;
  priority?: "low" | "medium" | "high" | "urgent";
  assignee?: string; // worker ID
  labels?: string[];
  createdAt: number;
  updatedAt: number;
  linkedRunId?: string; // orchestrator task/run ID
};

const STORAGE_KEY = "orchestra-issues";

// Load issues from localStorage
function loadIssues(): Issue[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (err) {
    console.error("[IssuesStore] Failed to load issues:", err);
    return [];
  }
}

// Save issues to localStorage
function saveIssues(issues: Issue[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(issues));
  } catch (err) {
    console.error("[IssuesStore] Failed to save issues:", err);
  }
}

// Generate unique ID
function generateId(): string {
  return `issue_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Create the issues store
export function createIssuesStore() {
  const [issues, setIssues] = createStore<Issue[]>(loadIssues());
  const [selectedIssueId, setSelectedIssueId] = createSignal<string | null>(null);

  // Sync to localStorage whenever issues change
  function sync() {
    saveIssues(issues);
  }

  return {
    issues,
    selectedIssueId,
    setSelectedIssueId,

    // Get issue by ID
    getIssue: (id: string): Issue | undefined => {
      return issues.find((i) => i.id === id);
    },

    // Get issues by status
    getIssuesByStatus: (status: IssueStatus): Issue[] => {
      return issues.filter((i) => i.status === status);
    },

    // Create new issue
    createIssue: (data: Omit<Issue, "id" | "createdAt" | "updatedAt">): Issue => {
      const now = Date.now();
      const newIssue: Issue = {
        id: generateId(),
        ...data,
        createdAt: now,
        updatedAt: now,
      };

      setIssues((prev) => [...prev, newIssue]);
      sync();
      return newIssue;
    },

    // Update existing issue
    updateIssue: (id: string, data: Partial<Omit<Issue, "id" | "createdAt">>): void => {
      setIssues((prev) =>
        prev.map((issue) =>
          issue.id === id
            ? { ...issue, ...data, updatedAt: Date.now() }
            : issue
        )
      );
      sync();
    },

    // Delete issue
    deleteIssue: (id: string): void => {
      setIssues((prev) => prev.filter((i) => i.id !== id));
      sync();
    },

    // Move issue to different status
    moveIssue: (id: string, newStatus: IssueStatus): void => {
      setIssues((prev) =>
        prev.map((issue) =>
          issue.id === id
            ? { ...issue, status: newStatus, updatedAt: Date.now() }
            : issue
        )
      );
      sync();
    },

    // Reorder issues within a column (for drag & drop)
    reorderIssues: (status: IssueStatus, issueIds: string[]): void => {
      // Get all issues not in this status
      const otherIssues = issues.filter((i) => i.status !== status);

      // Get issues in this status in new order
      const reorderedIssues = issueIds
        .map((id) => issues.find((i) => i.id === id))
        .filter((issue): issue is Issue => issue !== undefined);

      // Combine and update
      setIssues([...otherIssues, ...reorderedIssues]);
      sync();
    },
  };
}

export type IssuesStore = ReturnType<typeof createIssuesStore>;
