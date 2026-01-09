/**
 * Chat Page - Main chat interface with sessions sidebar
 */

import { type Component, createEffect, createSignal, Show } from "solid-js";
import { SessionList } from "@/components/sidebar/worker-list";
import { ChatView } from "@/components/worker-detail";

// Icons
const ChevronLeftIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="m15 18-6-6 6-6" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

export const ChatPage: Component = () => {
  const [sidebarOpen, setSidebarOpen] = createSignal(true);

  // Keyboard shortcut for sidebar toggle
  createEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  return (
    <div class="flex-1 flex overflow-hidden">
        {/* Sidebar toggle + sidebar */}
        <div class="flex">
          {/* Collapse button */}
          <button
            class="w-6 flex items-center justify-center border-r border-border hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen() ? "Collapse sidebar (Ctrl+B)" : "Expand sidebar (Ctrl+B)"}
          >
            {sidebarOpen() ? <ChevronLeftIcon /> : <ChevronRightIcon />}
          </button>

          {/* Sidebar - wider at 320px */}
          <Show when={sidebarOpen()}>
            <aside class="w-80 border-r border-border overflow-hidden flex flex-col bg-card/30">
              <SessionList />
            </aside>
          </Show>
        </div>

      {/* Chat area */}
      <div class="flex-1 overflow-hidden">
        <ChatView />
      </div>
    </div>
  );
};
