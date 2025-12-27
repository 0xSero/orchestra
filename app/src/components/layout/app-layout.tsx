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
import { countActiveSessions } from "@/lib/session-utils";
import { navItems, SearchIcon } from "./app-layout-nav";

/** Shared application shell with navigation and global modals. */
export const AppLayout: Component<{ children: JSX.Element }> = (props) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, openCommandPalette, closeSpawnDialog, selectWorker, setCommandPaletteQuery } = useLayout();
  const { connected, sessions, workers } = useOpenCode();

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
