/**
 * AppLayout - Shared layout with top navigation for all pages
 * Warm Paper Design System
 */

import { A, useLocation, useNavigate } from "@solidjs/router";
import { type Component, createEffect, createMemo, createSignal, For, type JSX } from "solid-js";
import { CommandPalette } from "@/components/command-palette";
import { SpawnDialog } from "@/components/spawn-dialog";
import { useLayout } from "@/context/layout";
import { useOpenCode } from "@/context/opencode";
import { countActiveSessions } from "@/lib/session-utils";
import { navItems, SearchIcon } from "./app-layout-nav";

const THEME_STORAGE_KEY = "opencode-theme";

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
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
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

/** Shared application shell with navigation and global modals. */
export const AppLayout: Component<{ children: JSX.Element }> = (props) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, openCommandPalette, closeSpawnDialog, selectWorker, setCommandPaletteQuery } = useLayout();
  const { connected, sessions, workers } = useOpenCode();
  const getInitialTheme = () => {
    if (typeof window === "undefined") return "light";
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
    const prefersDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)").matches : false;
    return prefersDark ? "dark" : "light";
  };
  const [theme, setTheme] = createSignal<"light" | "dark">(getInitialTheme());

  // Stats - count active sessions based on recent activity or worker status
  const stats = createMemo(() => {
    const allSessions = sessions();
    const allWorkers = workers();

    return {
      sessions: allSessions.length,
      active: countActiveSessions(allSessions, allWorkers),
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
    if (path === "/dashboard") {
      return location.pathname === "/" || location.pathname.startsWith("/dashboard");
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

  const handleSearchInput = (value: string) => {
    setCommandPaletteQuery(value);
    if (!state.commandPaletteOpen) {
      openCommandPalette();
    }
  };

  return (
    <div class="h-full flex flex-col app-shell">
      {/* Top navigation bar */}
      <nav class="nav-tabs">
        {/* Brand */}
        <A href="/dashboard" class="flex items-center gap-2 px-3 mr-6 hover:opacity-80 transition-opacity">
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

          {/* Theme toggle */}
          <button
            type="button"
            class="nav-pill text-foreground hover:bg-accent/50 transition-colors"
            onClick={() => setTheme(theme() === "dark" ? "light" : "dark")}
            title={`Switch to ${theme() === "dark" ? "light" : "dark"} mode`}
          >
            {theme() === "dark" ? <SunIcon /> : <MoonIcon />}
            <span class="text-xs">{theme() === "dark" ? "Light" : "Dark"}</span>
          </button>

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
