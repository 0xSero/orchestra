import type { NavigateFunction } from "@solidjs/router";
import type { Component } from "solid-js";
import type { Session } from "@/context/opencode";
import { ListIcon, PlusIcon, RefreshIcon, SettingsIcon, SidebarIcon, TerminalIcon } from "./command-palette-icons";

export interface Command {
  id: string;
  title: string;
  description?: string;
  icon: Component;
  shortcut?: string;
  category: "worker" | "skills" | "view" | "settings";
  action: () => void;
}

type CommandDeps = {
  sessions: Session[];
  closeCommandPalette: () => void;
  openSpawnDialog: () => void;
  toggleSidebar: () => void;
  toggleJobQueue: () => void;
  toggleLogs: () => void;
  selectWorker: (id: string) => void;
  setActivePanel: (panel: string) => void;
  refreshSessions: () => Promise<void>;
  refreshSkills: () => Promise<void>;
  openCreateDialog: () => void;
  navigate: NavigateFunction;
};

/** Build the command list for the command palette. */
export const buildCommandList = (deps: CommandDeps): Command[] => {
  const cmds: Command[] = [
    // Worker commands
    {
      id: "spawn-worker",
      title: "Spawn New Worker",
      description: "Create a new worker instance",
      icon: PlusIcon,
      category: "worker",
      action: () => {
        deps.closeCommandPalette();
        deps.openSpawnDialog();
      },
    },
    {
      id: "refresh-sessions",
      title: "Refresh Sessions",
      description: "Reload session list from server",
      icon: RefreshIcon,
      category: "worker",
      action: async () => {
        await deps.refreshSessions();
        deps.closeCommandPalette();
      },
    },

    // Skills commands
    {
      id: "open-skills",
      title: "Open Recipes",
      description: "Switch to recipes management",
      icon: ListIcon,
      category: "skills",
      action: () => {
        deps.setActivePanel("skills");
        deps.closeCommandPalette();
      },
    },
    {
      id: "refresh-skills",
      title: "Refresh Recipes",
      description: "Reload recipes from the API",
      icon: RefreshIcon,
      category: "skills",
      action: async () => {
        await deps.refreshSkills();
        deps.closeCommandPalette();
      },
    },
    {
      id: "create-skill",
      title: "Create Recipe",
      description: "Start a new recipe profile",
      icon: PlusIcon,
      category: "skills",
      action: () => {
        deps.setActivePanel("skills");
        deps.openCreateDialog();
        deps.closeCommandPalette();
      },
    },

    // View commands
    {
      id: "toggle-sidebar",
      title: "Toggle Sidebar",
      icon: SidebarIcon,
      shortcut: "mod+B",
      category: "view",
      action: () => {
        deps.toggleSidebar();
        deps.closeCommandPalette();
      },
    },
    {
      id: "toggle-jobs",
      title: "Toggle Activity",
      icon: ListIcon,
      category: "view",
      action: () => {
        deps.toggleJobQueue();
        deps.closeCommandPalette();
      },
    },
    {
      id: "toggle-logs",
      title: "Toggle Logs",
      icon: TerminalIcon,
      category: "view",
      action: () => {
        deps.toggleLogs();
        deps.closeCommandPalette();
      },
    },

    // Settings commands
    {
      id: "settings",
      title: "Open Settings",
      icon: SettingsIcon,
      category: "settings",
      action: () => {
        deps.setActivePanel("settings");
        deps.closeCommandPalette();
      },
    },
    {
      id: "onboarding",
      title: "Open Onboarding",
      description: "Run the 5-minute guided demos",
      icon: SettingsIcon,
      category: "settings",
      action: () => {
        deps.navigate("/onboarding");
        deps.closeCommandPalette();
      },
    },
  ];

  for (const session of deps.sessions) {
    cmds.push({
      id: `select-session-${session.id}`,
      title: `Go to ${session.title || "Untitled"}`,
      description: `Session ${session.id.slice(0, 8)}...`,
      icon: TerminalIcon,
      category: "worker",
      action: () => {
        deps.selectWorker(session.id);
        deps.closeCommandPalette();
      },
    });
  }

  return cmds;
};
