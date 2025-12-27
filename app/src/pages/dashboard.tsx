/**
 * Dashboard - vLLM Studio-style layout
 *
 * Top nav with tabs, collapsible sidebar, centered content area
 */

import { type Component, createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { CommandPalette } from "@/components/command-palette";
import { LogsPanel } from "@/components/log-stream";
import { SessionList } from "@/components/sidebar/worker-list";
import { SkillList, SkillsWorkspace } from "@/components/skills";
import { SystemMonitor } from "@/components/system-monitor";
import { ChatView } from "@/components/worker-detail";
import { useOpenCode } from "@/context/opencode";

type Tab = "chat" | "skills" | "logs" | "system";

export const Dashboard: Component = () => {
  const { connected, sessions, workers, abortAllSessions, deleteAllSessions, disposeAllInstances } = useOpenCode();
  const [activeTab, setActiveTab] = createSignal<Tab>("chat");
  const [sidebarOpen, setSidebarOpen] = createSignal(true);
  const [actionsOpen, setActionsOpen] = createSignal(false);

  // Keyboard shortcuts
  createEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === "b") {
          e.preventDefault();
          setSidebarOpen((v) => !v);
        }
        if (e.key === "1") {
          e.preventDefault();
          setActiveTab("chat");
        }
        if (e.key === "2") {
          e.preventDefault();
          setActiveTab("skills");
        }
        if (e.key === "3") {
          e.preventDefault();
          setActiveTab("logs");
        }
        if (e.key === "4") {
          e.preventDefault();
          setActiveTab("system");
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  // Calculate active sessions based on worker status or recent activity
  const sessionStats = createMemo(() => {
    const allSessions = sessions();
    const allWorkers = workers();

    // Build a map of sessionId -> worker for quick lookup
    const workerBySession = new Map<string, (typeof allWorkers)[0]>();
    for (const w of allWorkers) {
      if (w.sessionId) workerBySession.set(w.sessionId, w);
    }

    let active = 0;
    const now = Date.now();

    for (const session of allSessions) {
      const worker = workerBySession.get(session.id);
      // Active if: worker is busy/starting, or session was updated within last 30 seconds
      if (worker?.status === "busy" || worker?.status === "starting") {
        active++;
      } else if (session.time?.updated && now - session.time.updated < 30000) {
        active++;
      }
    }

    return { total: allSessions.length, active };
  });

  const tabs: { id: Tab; label: string; icon: Component }[] = [
    {
      id: "chat",
      label: "Chat",
      icon: () => (
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
          <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
        </svg>
      ),
    },
    {
      id: "skills",
      label: "Recipes",
      icon: () => (
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
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h16" />
        </svg>
      ),
    },
    {
      id: "system",
      label: "System",
      icon: () => (
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
          <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
          <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
          <line x1="6" x2="6.01" y1="6" y2="6" />
          <line x1="6" x2="6.01" y1="18" y2="18" />
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
          <span class="font-medium text-foreground">Orchestra</span>
        </div>

        {/* Tabs */}
        <For each={tabs}>
          {(tab) => {
            const Icon = tab.icon;
            return (
              <button class={`nav-tab ${activeTab() === tab.id ? "active" : ""}`} onClick={() => setActiveTab(tab.id)}>
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
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input class="nav-input" type="text" placeholder="Search" />
          </div>

          <div class="relative">
            <button
              class="btn btn-compact btn-ghost"
              onClick={() => setActionsOpen((v) => !v)}
              onBlur={() => setTimeout(() => setActionsOpen(false), 150)}
            >
              Actions ▾
            </button>
            <Show when={actionsOpen()}>
              <div class="absolute right-0 top-full mt-1 w-48 rounded-md border border-border bg-card shadow-lg z-50">
                <div class="py-1">
                  <button
                    class="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent/50 flex items-center gap-2"
                    onClick={async () => {
                      setActionsOpen(false);
                      const count = await abortAllSessions();
                      console.log(`Aborted ${count} sessions`);
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect width="14" height="14" x="5" y="5" rx="2" />
                    </svg>
                    Stop All Sessions
                  </button>
                  <button
                    class="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent/50 flex items-center gap-2"
                    onClick={async () => {
                      setActionsOpen(false);
                      const ok = await disposeAllInstances();
                      console.log(`Dispose instances: ${ok}`);
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                    Kill All Workers
                  </button>
                  <div class="border-t border-border my-1" />
                  <button
                    class="w-full px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10 flex items-center gap-2"
                    onClick={async () => {
                      if (confirm("Delete all sessions? This cannot be undone.")) {
                        setActionsOpen(false);
                        const count = await deleteAllSessions();
                        console.log(`Deleted ${count} sessions`);
                      }
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                    Delete All Sessions
                  </button>
                </div>
              </div>
            </Show>
          </div>

          <div class="nav-pill">
            <Show when={sessionStats().active > 0}>
              <span class="status-dot busy animate-pulse-soft" />
              <span class="text-status-busy">{sessionStats().active}</span>
              <span>/</span>
            </Show>
            <span>{sessionStats().total} sessions</span>
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
              onClick={() => setSidebarOpen((v) => !v)}
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

        {/* System tab */}
        <Show when={activeTab() === "system"}>
          <div class="flex-1 overflow-hidden">
            <SystemMonitor />
          </div>
        </Show>
      </div>

      {/* Command palette */}
      <CommandPalette />
    </div>
  );
};
