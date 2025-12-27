/**
 * AppLayout - Shared layout with top navigation for all pages
 * Warm Paper Design System
 */

import { A, useLocation, useNavigate } from "@solidjs/router";
import { type Component, createEffect, createMemo, For, type JSX } from "solid-js";
import { CommandPalette } from "@/components/command-palette";
import { SpawnDialog } from "@/components/spawn-dialog";
import { useLayout } from "@/context/layout";
import { useOpenCode } from "@/context/opencode";

interface NavItem {
  path: string;
  label: string;
  icon: Component;
  shortcut: string;
}

const ChatIcon: Component = () => (
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
    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
  </svg>
);

const AgentsIcon: Component = () => (
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
    <path d="M12 8V4H8" />
    <rect width="16" height="12" x="4" y="8" rx="2" />
    <path d="M2 14h2" />
    <path d="M20 14h2" />
    <path d="M15 13v2" />
    <path d="M9 13v2" />
  </svg>
);

const LogsIcon: Component = () => (
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
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14,2 14,8 20,8" />
    <line x1="16" x2="8" y1="13" y2="13" />
    <line x1="16" x2="8" y1="17" y2="17" />
    <polyline points="10,9 9,9 8,9" />
  </svg>
);

const OnboardingIcon: Component = () => (
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
    <circle cx="12" cy="12" r="10" />
    <path d="m12 6 2.5 6L18 9" />
    <path d="m12 6-2.5 6L6 9" />
  </svg>
);

const SettingsIcon: Component = () => (
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
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const SearchIcon: Component = () => (
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
);

const SystemIcon: Component = () => (
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
    <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
    <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
    <line x1="6" x2="6.01" y1="6" y2="6" />
    <line x1="6" x2="6.01" y1="18" y2="18" />
  </svg>
);

const navItems: NavItem[] = [
  { path: "/chat", label: "Chat", icon: ChatIcon, shortcut: "1" },
  { path: "/agents", label: "Agents", icon: AgentsIcon, shortcut: "2" },
  { path: "/logs", label: "Logs", icon: LogsIcon, shortcut: "3" },
  { path: "/system", label: "System", icon: SystemIcon, shortcut: "4" },
  { path: "/settings", label: "Settings", icon: SettingsIcon, shortcut: "5" },
];

export const AppLayout: Component<{ children: JSX.Element }> = (props) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, openCommandPalette, closeSpawnDialog, selectWorker, setCommandPaletteQuery } = useLayout();
  const { connected, sessions, workers } = useOpenCode();

  // Stats - count active sessions based on recent activity or worker status
  const stats = createMemo(() => {
    const allSessions = sessions();
    const allWorkers = workers();
    const now = Date.now();

    // Build worker lookup by session
    const workerBySession = new Map<string, (typeof allWorkers)[0]>();
    for (const w of allWorkers) {
      if (w.sessionId) workerBySession.set(w.sessionId, w);
    }

    let activeCount = 0;
    for (const session of allSessions) {
      const worker = workerBySession.get(session.id);

      // Check worker status first
      if (worker && worker.status === "busy") {
        activeCount++;
        continue;
      }

      // Check if compacting
      const s = session as any;
      if (s.time?.compacting) {
        activeCount++;
        continue;
      }

      // Check if recently updated (within 30 seconds)
      const lastUpdate = session.time?.updated || 0;
      if (now - lastUpdate < 30000) {
        activeCount++;
      }
    }

    return {
      sessions: allSessions.length,
      active: activeCount,
    };
  });

  // Keyboard shortcuts for navigation
  createEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        const item = navItems.find((n) => n.shortcut === e.key);
        if (item) {
          e.preventDefault();
          navigate(item.path);
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  const isActive = (path: string) => {
    if (path === "/chat") {
      return location.pathname === "/" || location.pathname === "/chat";
    }
    return location.pathname.startsWith(path);
  };

  const handleSearchInput = (value: string) => {
    setCommandPaletteQuery(value);
    if (!state.commandPaletteOpen) {
      openCommandPalette();
    }
  };

  return (
    <div class="h-full flex flex-col bg-background">
      {/* Top navigation bar */}
      <nav class="nav-tabs">
        {/* Brand */}
        <A href="/chat" class="flex items-center gap-2 px-3 mr-6 hover:opacity-80 transition-opacity">
          <span class="text-sm font-semibold text-foreground tracking-tight">Orchestra</span>
        </A>

        {/* Navigation tabs */}
        <For each={navItems}>
          {(item) => {
            const Icon = item.icon;
            return (
              <A href={item.path} class={`nav-tab ${isActive(item.path) ? "active" : ""}`}>
                <span class="nav-tab-icon">
                  <Icon />
                </span>
                {item.label}
              </A>
            );
          }}
        </For>

        {/* Spacer */}
        <div class="flex-1" />

        {/* Right controls */}
        <div class="nav-controls">
          {/* Connection status */}
          <div class="nav-pill">
            <span class={`status-dot ${connected() ? "ready" : "stopped"}`} />
            <span>{connected() ? "Connected" : "Offline"}</span>
          </div>

          {/* Search */}
          <div class="nav-pill">
            <SearchIcon />
            <input
              class="nav-input"
              type="text"
              placeholder="Search..."
              value={state.commandPaletteQuery}
              onFocus={() => openCommandPalette()}
              onInput={(e) => handleSearchInput(e.currentTarget.value)}
            />
          </div>

          {/* Stats */}
          <div class="nav-pill">
            <span>{stats().sessions} sessions</span>
            <span class="text-border">|</span>
            <span class="flex items-center gap-1">
              <span class="status-dot busy" />
              {stats().active} active
            </span>
          </div>
        </div>
      </nav>

      {/* Page content */}
      <div class="flex-1 flex overflow-hidden">{props.children}</div>

      {/* Command palette (global) */}
      <CommandPalette />
      <SpawnDialog
        open={state.spawnDialogOpen}
        onClose={closeSpawnDialog}
        onSessionCreated={(sessionId) => {
          selectWorker(sessionId);
          navigate("/chat");
        }}
      />
    </div>
  );
};
