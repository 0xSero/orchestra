/**
 * Dashboard - vLLM Studio-style layout
 *
 * Top nav with tabs, collapsible sidebar, centered content area
 */

import { type Component, createSignal, Show, createEffect, For } from "solid-js";
import { SessionList } from "@/components/sidebar/worker-list";
import { ChatView } from "@/components/worker-detail";
import { LogsPanel } from "@/components/log-stream";
import { SkillList, SkillsWorkspace } from "@/components/skills";
import { CommandPalette } from "@/components/command-palette";
import { useLayout } from "@/context/layout";
import { useOpenCode } from "@/context/opencode";

type Tab = "chat" | "skills" | "logs";

export const Dashboard: Component = () => {
  const { connected, sessions } = useOpenCode();
  const [activeTab, setActiveTab] = createSignal<Tab>("chat");
  const [sidebarOpen, setSidebarOpen] = createSignal(true);

  // Keyboard shortcuts
  createEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === "b") { e.preventDefault(); setSidebarOpen(v => !v); }
        if (e.key === "1") { e.preventDefault(); setActiveTab("chat"); }
        if (e.key === "2") { e.preventDefault(); setActiveTab("skills"); }
        if (e.key === "3") { e.preventDefault(); setActiveTab("logs"); }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  const tabs: { id: Tab; label: string; icon: Component }[] = [
    {
      id: "chat",
      label: "Chat",
      icon: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
        </svg>
      ),
    },
    {
      id: "skills",
      label: "Recipes",
      icon: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 6h13" />
          <path d="M8 12h13" />
          <path d="M8 18h13" />
          <path d="M3 6h.01" />
          <path d="M3 12h.01" />
          <path d="M3 18h.01" />
        </svg>
      ),
    },
    {
      id: "logs",
      label: "Logs",
      icon: () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h16" />
        </svg>
      ),
    },
  ];

  return (
    <div class="h-full flex flex-col bg-background">
      {/* Top navigation bar */}
      <nav class="nav-tabs">
        {/* Brand */}
        <div class="flex items-center gap-2 px-2 mr-4">
          <span class="font-medium text-foreground">OpenCode Studio</span>
        </div>

        {/* Tabs */}
        <For each={tabs}>
          {(tab) => {
            const Icon = tab.icon;
            return (
              <button
                class={`nav-tab ${activeTab() === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span class="nav-tab-icon">
                  <Icon />
                </span>
                {tab.label}
              </button>
            );
          }}
        </For>

        {/* Spacer */}
        <div class="flex-1" />

        {/* Right controls */}
        <div class="nav-controls px-2">
          <div class="nav-pill">
            <span class={`dot ${connected() ? "dot-online" : "dot-offline"}`} />
            <span>{connected() ? "Connected" : "Offline"}</span>
          </div>

          <div class="nav-pill">
            <span class="text-muted-foreground">Model</span>
            <select class="bg-transparent text-xs text-foreground outline-none">
              <option>gpt-4.1-mini</option>
              <option>gpt-4.1</option>
              <option>o4-mini</option>
            </select>
          </div>

          <button class="btn btn-compact">Set Key</button>

          <div class="nav-pill">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input class="nav-input" type="text" placeholder="Search" />
          </div>

          <button class="btn btn-compact btn-ghost">Actions ▾</button>

          <div class="nav-pill">
            <span>{sessions().length} sessions</span>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <div class="flex-1 flex overflow-hidden">
        {/* Chat tab */}
        <Show when={activeTab() === "chat"}>
          {/* Sidebar toggle + sidebar */}
          <div class="flex">
            {/* Collapse button */}
            <button
              class="w-6 flex items-center justify-center border-r border-border hover:bg-accent text-muted-foreground hover:text-foreground"
              onClick={() => setSidebarOpen(v => !v)}
              title={sidebarOpen() ? "Collapse sidebar" : "Expand sidebar"}
            >
              <span class="text-xs">{sidebarOpen() ? "‹" : "›"}</span>
            </button>

            {/* Sidebar */}
            <Show when={sidebarOpen()}>
              <aside class="w-64 border-r border-border overflow-hidden flex flex-col">
                <SessionList />
              </aside>
            </Show>
          </div>

          {/* Chat area */}
          <div class="flex-1 overflow-hidden">
            <ChatView />
          </div>
        </Show>

        {/* Skills tab */}
        <Show when={activeTab() === "skills"}>
          <div class="flex-1 flex overflow-hidden">
            <aside class="w-64 border-r border-border overflow-hidden">
              <SkillList />
            </aside>
            <div class="flex-1 overflow-auto">
              <SkillsWorkspace />
            </div>
          </div>
        </Show>

        {/* Logs tab */}
        <Show when={activeTab() === "logs"}>
          <div class="flex-1 overflow-hidden">
            <LogsPanel />
          </div>
        </Show>
      </div>

      {/* Command palette */}
      <CommandPalette />
    </div>
  );
};
