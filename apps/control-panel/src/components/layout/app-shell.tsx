/**
 * AppShell - New sidebar-based layout
 * OpenCode + Linear + Dashboard inspired
 */

import { A, useLocation, useNavigate } from "@solidjs/router";
import {
  type Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  type JSX,
  Show,
} from "solid-js";
import { CommandPalette } from "@/components/command-palette";
import { SpawnDialog } from "@/components/spawn-dialog";
import { useLayout } from "@/context/layout";
import { useOpenCode } from "@/context/opencode";
import { countActiveSessions } from "@/lib/session-utils";

const THEME_STORAGE_KEY = "opencode-theme";

// Icons
const SunIcon: Component = () => (
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
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2m-8.93-8.93 1.41 1.41m15.86 0 1.41-1.41M2 12h2m18 0h2M6.34 17.66l-1.41 1.41m13.32-13.32 1.41-1.41" />
  </svg>
);

const MoonIcon: Component = () => (
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
    <path d="M12 3a7 7 0 1 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
);

const ChevronDownIcon: Component = () => (
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
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const DashboardIcon: Component = () => (
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
    <rect width="7" height="7" x="3" y="3" rx="1" />
    <rect width="7" height="7" x="14" y="3" rx="1" />
    <rect width="7" height="7" x="3" y="14" rx="1" />
    <rect width="7" height="7" x="14" y="14" rx="1" />
  </svg>
);

const TasksIcon: Component = () => (
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
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <path d="m9 11 3 3L22 4" />
  </svg>
);

const WorkersIcon: Component = () => (
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
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const AutomationIcon: Component = () => (
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
    <path d="M3 7h6M3 17h6M15 7h6M15 17h6M9 7a3 3 0 0 1 6 0M9 17a3 3 0 0 0 6 0" />
  </svg>
);

const MemoryIcon: Component = () => (
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
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5v6c0 1.7 4 3 9 3s9-1.3 9-3V5M3 11v6c0 1.7 4 3 9 3s9-1.3 9-3v-6" />
  </svg>
);

const ObserveIcon: Component = () => (
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
    <path d="M3 3v18h18" />
    <path d="m19 9-5 5-4-4-3 3" />
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

type NavItem = {
  path: string;
  label: string;
  icon: Component;
  shortcut?: string;
};

const navItems: NavItem[] = [
  { path: "/dashboard", label: "Dashboard", icon: DashboardIcon, shortcut: "1" },
  { path: "/tasks", label: "Tasks", icon: TasksIcon, shortcut: "2" },
  { path: "/workers", label: "Workers", icon: WorkersIcon, shortcut: "3" },
  { path: "/automation", label: "Automation", icon: AutomationIcon, shortcut: "4" },
  { path: "/memory", label: "Memory", icon: MemoryIcon, shortcut: "5" },
  { path: "/observe", label: "Observe", icon: ObserveIcon, shortcut: "6" },
  { path: "/settings", label: "Settings", icon: SettingsIcon, shortcut: "7" },
];

/** New AppShell with left sidebar navigation */
export const AppShell: Component<{ children: JSX.Element }> = (props) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, openCommandPalette, closeSpawnDialog, selectWorker } = useLayout();
  const { connected, sessions, workers } = useOpenCode();

  const [sessionsExpanded, setSessionsExpanded] = createSignal(true);

  const getInitialTheme = () => {
    if (typeof window === "undefined") return "light";
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
    const prefersDark = window.matchMedia?.(("prefers-color-scheme: dark")).matches ?? false;
    return prefersDark ? "dark" : "light";
  };
  const [theme, setTheme] = createSignal<"light" | "dark">(getInitialTheme());

  // Stats
  const stats = createMemo(() => {
    const allSessions = sessions();
    const allWorkers = workers();
    return {
      sessions: allSessions.length,
      active: countActiveSessions(allSessions, allWorkers),
    };
  });

  // Keyboard shortcuts
  createEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        // Handle Cmd/Ctrl+K for command palette
        if (e.key === "k") {
          e.preventDefault();
          openCommandPalette();
          return;
        }

        // Handle numbered shortcuts
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
    if (path === "/dashboard") {
      return location.pathname === "/" || location.pathname.startsWith("/dashboard");
    }
    // Handle /observe matching /observability
    if (path === "/observe") {
      return location.pathname.startsWith("/observe");
    }
    // Handle /automation matching /automation/* and legacy routes
    if (path === "/automation") {
      return (
        location.pathname.startsWith("/automation") ||
        location.pathname.startsWith("/workflows") ||
        location.pathname.startsWith("/skills") ||
        location.pathname.startsWith("/prompts")
      );
    }
    return location.pathname.startsWith(path);
  };

  createEffect(() => {
    if (typeof document === "undefined") return;
    const isDark = theme() === "dark";
    document.documentElement.classList.toggle("dark", isDark);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme());
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", isDark ? "#1b1b1b" : "#f9f6f0");
  });

  return (
    <div class="h-full flex app-shell">
      {/* Left Sidebar */}
      <aside class="w-64 border-r border-border bg-card/50 backdrop-blur-sm flex flex-col">
        {/* Brand */}
        <div class="h-12 px-4 flex items-center gap-2 border-b border-border">
          <A href="/dashboard" class="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <span class="text-sm font-semibold text-foreground tracking-tight">Orchestra</span>
          </A>
          <div class="flex-1" />
          {/* Connection status indicator */}
          <span class={`status-dot ${connected() ? "ready" : "stopped"}`} title={connected() ? "Connected" : "Offline"} />
        </div>

        {/* Sessions Section */}
        <div class="border-b border-border">
          <button
            type="button"
            class="w-full px-4 py-2 flex items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors"
            onClick={() => setSessionsExpanded(!sessionsExpanded())}
          >
            <span>SESSIONS</span>
            <span
              class="transition-transform"
              style={{ transform: sessionsExpanded() ? "rotate(0deg)" : "rotate(-90deg)" }}
            >
              <ChevronDownIcon />
            </span>
          </button>

          <Show when={sessionsExpanded()}>
            <div class="max-h-64 overflow-y-auto scrollbar-thin">
              <Show
                when={sessions().length > 0}
                fallback={
                  <div class="px-4 py-3 text-xs text-muted-foreground">
                    No active sessions
                  </div>
                }
              >
                <For each={sessions()}>
                  {(session) => {
                    const worker = () =>
                      workers().find((w) => w.id === session.id || w.sessionId === session.id);
                    const status = () => {
                      const w = worker();
                      if (!w) return "stopped";
                      if (w.status === "ready") return "ready";
                      if (w.status === "busy") return "busy";
                      if (w.status === "error") return "error";
                      return "stopped";
                    };

                    return (
                      <A
                        href="/chat"
                        onClick={() => selectWorker(session.id)}
                        class="session-item"
                        classList={{ selected: state.selectedWorkerId === session.id }}
                      >
                        <div class="session-item-header">
                          <span class="session-item-title">
                            {session.title || `Session ${session.id.slice(0, 8)}`}
                          </span>
                          <span class={`status-dot ${status()}`} />
                        </div>
                        <div class="session-item-meta">
                          <span class="text-xs text-muted-foreground truncate">
                            {session.id.slice(0, 12)}
                          </span>
                        </div>
                      </A>
                    );
                  }}
                </For>
              </Show>
            </div>
          </Show>
        </div>

        {/* Navigation */}
        <nav class="flex-1 px-2 py-3 space-y-1 overflow-y-auto scrollbar-thin">
          <For each={navItems}>
            {(item) => {
              const Icon = item.icon;
              return (
                <A
                  href={item.path}
                  class="flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground rounded-md hover:text-foreground hover:bg-accent/50 transition-colors"
                  classList={{
                    "text-foreground bg-accent": isActive(item.path),
                  }}
                >
                  <Icon />
                  <span>{item.label}</span>
                  <Show when={item.shortcut}>
                    <span class="ml-auto text-xs text-muted-foreground/50">
                      ⌘{item.shortcut}
                    </span>
                  </Show>
                </A>
              );
            }}
          </For>
        </nav>

        {/* Sidebar footer */}
        <div class="p-3 border-t border-border space-y-2">
          {/* Stats */}
          <div class="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground bg-background/50 rounded-md">
            <span>{stats().sessions} sessions</span>
            <span class="text-border">|</span>
            <span class="flex items-center gap-1">
              <span class="status-dot busy" />
              {stats().active} active
            </span>
          </div>

          {/* Theme toggle */}
          <button
            type="button"
            class="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md transition-colors"
            onClick={() => setTheme(theme() === "dark" ? "light" : "dark")}
          >
            {theme() === "dark" ? <SunIcon /> : <MoonIcon />}
            <span>{theme() === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div class="flex-1 flex flex-col overflow-hidden">{props.children}</div>

      {/* Global modals */}
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
