import type { Navigator } from "@solidjs/router";
import type { Component } from "solid-js";
import type { Session } from "@/context/opencode";
import { ListIcon, PlusIcon, RefreshIcon, SettingsIcon, SidebarIcon, TerminalIcon } from "./command-palette-icons";

export interface Command {
  id: string;
  title: string;
  description?: string;
  icon: Component;
  shortcut?: string;
  category: "navigation" | "worker" | "agents" | "view" | "settings";
  action: () => void;
}

type CommandDeps = {
  sessions: Session[];
  closeCommandPalette: () => void;
  openSpawnDialog: () => void;
  toggleSidebar: () => void;
  selectWorker: (id: string) => void;
  refreshSessions: () => Promise<void>;
  refreshAgents: () => Promise<void>;
  openCreateDialog: () => void;
  navigate: Navigator;
};

/** Build the command list for the command palette. */
export const buildCommandList = (deps: CommandDeps): Command[] => {
  const navigateTo = (path: string) => {
    deps.navigate(path);
    deps.closeCommandPalette();
  };

  const cmds: Command[] = [
    // Navigation
    {
      id: "nav-dashboard",
      title: "Go to Dashboard",
      description: "Overview of workers and active workflows",
      icon: ListIcon,
      category: "navigation",
      action: () => navigateTo("/dashboard"),
    },
    {
      id: "nav-workflows",
      title: "Go to Workflows",
      description: "Run and track workflow history",
      icon: ListIcon,
      category: "navigation",
      action: () => navigateTo("/workflows"),
    },
    {
      id: "nav-memory",
      title: "Go to Memory",
      description: "Inspect memory writes and tags",
      icon: ListIcon,
      category: "navigation",
      action: () => navigateTo("/memory"),
    },
    {
      id: "nav-config",
      title: "Go to Config",
      description: "View and update orchestrator config",
      icon: SettingsIcon,
      category: "navigation",
      action: () => navigateTo("/config"),
    },
    {
      id: "nav-prompts",
      title: "Go to Prompts",
      description: "Review prompt sources and profiles",
      icon: ListIcon,
      category: "navigation",
      action: () => navigateTo("/prompts"),
    },
    {
      id: "nav-chat",
      title: "Go to Chat",
      description: "Send messages to sessions",
      icon: TerminalIcon,
      category: "navigation",
      action: () => navigateTo("/chat"),
    },

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

    // Agents commands
    {
      id: "open-agents",
      title: "Go to Agents",
      description: "Open the agent profile workspace",
      icon: ListIcon,
      category: "agents",
      action: () => {
        navigateTo("/agents");
      },
    },
    {
      id: "refresh-agents",
      title: "Refresh Agents",
      description: "Reload agents from the API",
      icon: RefreshIcon,
      category: "agents",
      action: async () => {
        await deps.refreshAgents();
        deps.closeCommandPalette();
      },
    },
    {
      id: "create-agent",
      title: "Create Agent",
      description: "Start a new agent profile",
      icon: PlusIcon,
      category: "agents",
      action: () => {
        deps.navigate("/agents");
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

    // Settings commands
    {
      id: "settings",
      title: "Open Settings",
      icon: SettingsIcon,
      category: "settings",
      action: () => {
        navigateTo("/settings");
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
        deps.navigate("/chat");
        deps.closeCommandPalette();
      },
    });
  }

  return cmds;
};
