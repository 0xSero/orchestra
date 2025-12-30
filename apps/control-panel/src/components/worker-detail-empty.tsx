import type { Component } from "solid-js";
import { ChatIcon } from "@/components/icons/session-icons";
import { useLayout } from "@/context/layout";
import { useOpenCode } from "@/context/opencode";

/** Empty state shown when no session is selected. */
export const WorkerDetailEmptyState: Component = () => {
  const { createSession } = useOpenCode();
  const { selectWorker } = useLayout();

  const handleNew = async () => {
    const session = await createSession();
    if (session) selectWorker(session.id);
  };

  return (
    <div class="empty-state">
      <div class="empty-state-icon">
        <ChatIcon />
      </div>
      <p class="empty-state-title">Start a conversation</p>
      <p class="empty-state-description">Select a session or create a new one.</p>
      <button class="btn" onClick={handleNew}>
        New Chat
      </button>
    </div>
  );
};
