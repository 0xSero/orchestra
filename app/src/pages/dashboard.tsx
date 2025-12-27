/**
 * Dashboard - vLLM Studio-style layout
 *
 * Top nav with tabs, collapsible sidebar, centered content area
 */

import { type Component, createEffect, createMemo, createSignal, Show } from "solid-js";
import { CommandPalette } from "@/components/command-palette";
import { LogsPanel } from "@/components/log-stream";
import { SessionList } from "@/components/sidebar/worker-list";
import { SkillList, SkillsWorkspace } from "@/components/skills";
import { SystemMonitor } from "@/components/system-monitor";
import { ChatView } from "@/components/worker-detail";
import { useOpenCode } from "@/context/opencode";
import { countActiveSessions } from "@/lib/session-utils";
import { DashboardNav } from "./dashboard-nav";
import type { DashboardTabId } from "./dashboard-tabs";

/** Main dashboard page with tabbed panes. */
export const Dashboard: Component = () => {
  const { connected, sessions, workers, abortAllSessions, deleteAllSessions, disposeAllInstances } = useOpenCode();
  const [activeTab, setActiveTab] = createSignal<DashboardTabId>("chat");
  const [sidebarOpen, setSidebarOpen] = createSignal(true);

  createEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey) {
        if (event.key === "b") {
          event.preventDefault();
          setSidebarOpen((value) => !value);
        }
        if (event.key === "1") {
          event.preventDefault();
          setActiveTab("chat");
        }
        if (event.key === "2") {
          event.preventDefault();
          setActiveTab("skills");
        }
        if (event.key === "3") {
          event.preventDefault();
          setActiveTab("logs");
        }
        if (event.key === "4") {
          event.preventDefault();
          setActiveTab("system");
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  const sessionStats = createMemo(() => {
    const allSessions = sessions();
    const active = countActiveSessions(allSessions, workers());
    return { total: allSessions.length, active };
  });

  return (
    <div class="h-full flex flex-col bg-background">
      <DashboardNav
        activeTab={activeTab()}
        onSelectTab={setActiveTab}
        connected={connected()}
        sessionTotals={sessionStats()}
        onAbortAll={abortAllSessions}
        onDisposeAll={disposeAllInstances}
        onDeleteAll={deleteAllSessions}
      />

      <div class="flex-1 flex overflow-hidden">
        <Show when={activeTab() === "chat"}>
          <div class="flex">
            <button
              class="w-6 flex items-center justify-center border-r border-border hover:bg-accent text-muted-foreground hover:text-foreground"
              onClick={() => setSidebarOpen((value) => !value)}
              title={sidebarOpen() ? "Collapse sidebar" : "Expand sidebar"}
            >
              <span class="text-xs">{sidebarOpen() ? "‹" : "›"}</span>
            </button>

            <Show when={sidebarOpen()}>
              <aside class="w-64 border-r border-border overflow-hidden flex flex-col">
                <SessionList />
              </aside>
            </Show>
          </div>

          <div class="flex-1 overflow-hidden">
            <ChatView />
          </div>
        </Show>

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

        <Show when={activeTab() === "logs"}>
          <div class="flex-1 overflow-hidden">
            <LogsPanel />
          </div>
        </Show>

        <Show when={activeTab() === "system"}>
          <div class="flex-1 overflow-hidden">
            <SystemMonitor />
          </div>
        </Show>
      </div>

      <CommandPalette />
    </div>
  );
};
