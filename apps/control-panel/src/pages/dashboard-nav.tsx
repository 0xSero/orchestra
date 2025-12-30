import { type Component, createSignal, For, Show } from "solid-js";
import { SearchIcon } from "@/components/command-palette-icons";
import { StopIcon, TrashIcon, XIcon } from "@/components/icons/session-icons";
import { type DashboardTabId, dashboardTabs } from "./dashboard-tabs";

interface DashboardNavProps {
  activeTab: DashboardTabId;
  onSelectTab: (tab: DashboardTabId) => void;
  connected: boolean;
  sessionTotals: { total: number; active: number };
  onAbortAll: () => Promise<number>;
  onDisposeAll: () => Promise<boolean>;
  onDeleteAll: () => Promise<number>;
}

/** Render the dashboard top navigation bar with tabs and actions. */
export const DashboardNav: Component<DashboardNavProps> = (props) => {
  const [actionsOpen, setActionsOpen] = createSignal(false);

  return (
    <nav class="nav-tabs">
      <div class="flex items-center gap-2 px-2 mr-4">
        <span class="font-medium text-foreground">Orchestra</span>
      </div>

      <For each={dashboardTabs}>
        {(tab) => {
          const Icon = tab.icon;
          return (
            <button
              class={`nav-tab ${props.activeTab === tab.id ? "active" : ""}`}
              onClick={() => props.onSelectTab(tab.id)}
            >
              <span class="nav-tab-icon">
                <Icon />
              </span>
              {tab.label}
            </button>
          );
        }}
      </For>

      <div class="flex-1" />

      <div class="nav-controls px-2">
        <div class="nav-pill">
          <span class={`dot ${props.connected ? "dot-online" : "dot-offline"}`} />
          <span>{props.connected ? "Connected" : "Offline"}</span>
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
          <SearchIcon />
          <input class="nav-input" type="text" placeholder="Search" />
        </div>

        <div class="relative">
          <button
            class="btn btn-compact btn-ghost"
            onClick={() => setActionsOpen((value) => !value)}
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
                    const count = await props.onAbortAll();
                    console.log(`Aborted ${count} sessions`);
                  }}
                >
                  <StopIcon />
                  Stop All Sessions
                </button>
                <button
                  class="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent/50 flex items-center gap-2"
                  onClick={async () => {
                    setActionsOpen(false);
                    const ok = await props.onDisposeAll();
                    console.log(`Dispose instances: ${ok}`);
                  }}
                >
                  <XIcon />
                  Kill All Workers
                </button>
                <div class="border-t border-border my-1" />
                <button
                  class="w-full px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10 flex items-center gap-2"
                  onClick={async () => {
                    if (confirm("Delete all sessions? This cannot be undone.")) {
                      setActionsOpen(false);
                      const count = await props.onDeleteAll();
                      console.log(`Deleted ${count} sessions`);
                    }
                  }}
                >
                  <TrashIcon />
                  Delete All Sessions
                </button>
              </div>
            </div>
          </Show>
        </div>

        <div class="nav-pill">
          <Show when={props.sessionTotals.active > 0}>
            <span class="status-dot busy animate-pulse-soft" />
            <span class="text-status-busy">{props.sessionTotals.active}</span>
            <span>/</span>
          </Show>
          <span>{props.sessionTotals.total} sessions</span>
        </div>
      </div>
    </nav>
  );
};
