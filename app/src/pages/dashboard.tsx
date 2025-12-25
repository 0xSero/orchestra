/**
 * Dashboard Page - Main control panel view
 *
 * Connected to OpenCode server for real session data.
 */

import { type Component, createSignal, Show } from "solid-js";
import { AppHeader } from "@/components/header";
import { WorkerList } from "@/components/sidebar/worker-list";
import { WorkerDetail } from "@/components/worker-detail";
import { JobQueue } from "@/components/job-queue";
import { LogStream } from "@/components/log-stream";
import { PromptInput } from "@/components/prompt-input";
import { CommandPalette } from "@/components/command-palette";
import { SpawnDialog } from "@/components/spawn-dialog";
import { useLayout } from "@/context/layout";
import { useOpenCode } from "@/context/opencode";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Icons
const MenuIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="4" x2="20" y1="12" y2="12" />
    <line x1="4" x2="20" y1="6" y2="6" />
    <line x1="4" x2="20" y1="18" y2="18" />
  </svg>
);

const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

export const Dashboard: Component = () => {
  const { state, isMobile, isDesktop, selectedWorkerId, toggleSidebar, setSidebarOpen } = useLayout();
  const { sendMessage } = useOpenCode();
  const [spawnDialogOpen, setSpawnDialogOpen] = createSignal(false);
  const [isSubmitting, setIsSubmitting] = createSignal(false);

  const handlePromptSubmit = async (message: string, attachments: any[]) => {
    const sessionId = selectedWorkerId();
    if (!sessionId) {
      console.warn("No session selected");
      return;
    }

    setIsSubmitting(true);
    try {
      await sendMessage(sessionId, message);
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div class="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Mobile overlay */}
      <Show when={!isDesktop() && state.sidebarOpen}>
        <div
          class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      </Show>

      {/* Main layout */}
      <div class="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside
          class={cn(
            "fixed inset-y-0 left-0 z-50 w-72 flex-shrink-0 bg-card border-r border-border transition-transform duration-300 lg:relative lg:translate-x-0",
            state.sidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          {/* Mobile close button */}
          <Show when={!isDesktop()}>
            <button
              class="absolute right-3 top-3 p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent z-10"
              onClick={() => setSidebarOpen(false)}
            >
              <XIcon />
            </button>
          </Show>
          <WorkerList />
        </aside>

        {/* Main content */}
        <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Header */}
          <header class="flex h-14 items-center gap-4 border-b border-border bg-card px-4 flex-shrink-0">
            {/* Mobile menu button */}
            <Show when={!isDesktop()}>
              <button
                class="p-2 -ml-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
                onClick={toggleSidebar}
              >
                <MenuIcon />
              </button>
            </Show>
            <AppHeader />
          </header>

          {/* Content area */}
          <div class="flex-1 flex overflow-hidden">
            {/* Main panel - Worker detail */}
            <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
              <div class="flex-1 overflow-auto">
                <WorkerDetail />
              </div>

              {/* Prompt input (when worker selected) */}
              <Show when={selectedWorkerId()}>
                <PromptInput
                  onSubmit={handlePromptSubmit}
                  isLoading={isSubmitting()}
                  onCancel={() => setIsSubmitting(false)}
                  placeholder={`Send a message to ${selectedWorkerId()}...`}
                />
              </Show>
            </div>

            {/* Right panel - Job queue (desktop only) */}
            <Show when={isDesktop() && state.showJobQueue}>
              <div class="w-80 flex-shrink-0 border-l border-border overflow-hidden">
                <JobQueue />
              </div>
            </Show>
          </div>

          {/* Bottom panel - Logs */}
          <Show when={isDesktop() && state.showLogs}>
            <div class="h-48 flex-shrink-0 border-t border-border overflow-hidden">
              <LogStream />
            </div>
          </Show>
        </div>
      </div>

      {/* Mobile bottom sheet for logs/jobs */}
      <Show when={!isDesktop() && (state.showLogs || state.showJobQueue)}>
        <div class="fixed inset-x-0 bottom-0 z-40 h-[50vh] bg-card border-t border-border rounded-t-xl shadow-lg">
          <div class="h-full flex flex-col">
            {/* Handle */}
            <div class="flex justify-center py-2">
              <div class="w-12 h-1 rounded-full bg-border" />
            </div>
            {/* Content */}
            <div class="flex-1 overflow-hidden">
              <Show when={state.showLogs}>
                <LogStream />
              </Show>
              <Show when={state.showJobQueue && !state.showLogs}>
                <JobQueue />
              </Show>
            </div>
          </div>
        </div>
      </Show>

      {/* Command palette */}
      <CommandPalette />

      {/* Spawn dialog */}
      <SpawnDialog
        open={spawnDialogOpen()}
        onClose={() => setSpawnDialogOpen(false)}
      />
    </div>
  );
};
