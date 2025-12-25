/**
 * CommandPalette Component - Quick action command palette
 */

import {
  type Component,
  createSignal,
  createMemo,
  For,
  Show,
  onMount,
  onCleanup,
} from "solid-js";
import { useLayout } from "@/context/layout";
import { useOpenCode } from "@/context/opencode";
import { Dialog, DialogContent, DialogOverlay } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, formatShortcut } from "@/lib/utils";

// Icons
const SearchIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </svg>
);

const StopIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" />
  </svg>
);

const RefreshIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
    <path d="M16 16h5v5" />
  </svg>
);

const TerminalIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" x2="20" y1="19" y2="19" />
  </svg>
);

const ListIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="8" x2="21" y1="6" y2="6" />
    <line x1="8" x2="21" y1="12" y2="12" />
    <line x1="8" x2="21" y1="18" y2="18" />
    <line x1="3" x2="3.01" y1="6" y2="6" />
    <line x1="3" x2="3.01" y1="12" y2="12" />
    <line x1="3" x2="3.01" y1="18" y2="18" />
  </svg>
);

const SettingsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const SidebarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M9 3v18" />
  </svg>
);

interface Command {
  id: string;
  title: string;
  description?: string;
  icon: Component;
  shortcut?: string;
  category: "worker" | "view" | "settings";
  action: () => void;
}

export const CommandPalette: Component = () => {
  const { state, closeCommandPalette, toggleSidebar, toggleJobQueue, toggleLogs, selectWorker } = useLayout();
  const { sessions, refreshSessions, deleteSession } = useOpenCode();

  const [query, setQuery] = createSignal("");
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  let inputRef: HTMLInputElement | undefined;

  // Define commands
  const commands = createMemo((): Command[] => {
    const cmds: Command[] = [
      // Worker commands
      {
        id: "spawn-worker",
        title: "Spawn New Worker",
        description: "Create a new worker instance",
        icon: PlusIcon,
        category: "worker",
        action: () => {
          closeCommandPalette();
          // TODO: Open spawn dialog
        },
      },
      {
        id: "refresh-sessions",
        title: "Refresh Sessions",
        description: "Reload session list from server",
        icon: RefreshIcon,
        category: "worker",
        action: async () => {
          await refreshSessions();
          closeCommandPalette();
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
          toggleSidebar();
          closeCommandPalette();
        },
      },
      {
        id: "toggle-jobs",
        title: "Toggle Job Queue",
        icon: ListIcon,
        category: "view",
        action: () => {
          toggleJobQueue();
          closeCommandPalette();
        },
      },
      {
        id: "toggle-logs",
        title: "Toggle Logs",
        icon: TerminalIcon,
        category: "view",
        action: () => {
          toggleLogs();
          closeCommandPalette();
        },
      },

      // Settings commands
      {
        id: "settings",
        title: "Open Settings",
        icon: SettingsIcon,
        category: "settings",
        action: () => {
          closeCommandPalette();
          // TODO: Open settings
        },
      },
    ];

    // Add session-specific commands for each session
    for (const session of sessions()) {
      cmds.push({
        id: `select-session-${session.id}`,
        title: `Go to ${session.title || "Untitled"}`,
        description: `Session ${session.id.slice(0, 8)}...`,
        icon: TerminalIcon,
        category: "worker",
        action: () => {
          selectWorker(session.id);
          closeCommandPalette();
        },
      });
    }

    return cmds;
  });

  // Filter commands based on query
  const filteredCommands = createMemo(() => {
    const q = query().toLowerCase().trim();
    if (!q) return commands();

    return commands().filter((cmd) => {
      return (
        cmd.title.toLowerCase().includes(q) ||
        cmd.description?.toLowerCase().includes(q) ||
        cmd.category.toLowerCase().includes(q)
      );
    });
  });

  // Group commands by category
  const groupedCommands = createMemo(() => {
    const groups: Record<string, Command[]> = {
      worker: [],
      view: [],
      settings: [],
    };

    for (const cmd of filteredCommands()) {
      groups[cmd.category].push(cmd);
    }

    return groups;
  });

  // Handle keyboard navigation
  const handleKeyDown = (e: KeyboardEvent) => {
    const cmds = filteredCommands();

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % cmds.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + cmds.length) % cmds.length);
        break;
      case "Enter":
        e.preventDefault();
        cmds[selectedIndex()]?.action();
        break;
      case "Escape":
        closeCommandPalette();
        break;
    }
  };

  // Reset selection when query changes
  const handleInput = (value: string) => {
    setQuery(value);
    setSelectedIndex(0);
  };

  // Focus input when opened
  onMount(() => {
    if (state.commandPaletteOpen) {
      setTimeout(() => inputRef?.focus(), 50);
    }
  });

  return (
    <Dialog open={state.commandPaletteOpen} onOpenChange={(open) => !open && closeCommandPalette()}>
      <DialogContent class="max-w-xl p-0 gap-0 overflow-hidden">
        {/* Search input */}
        <div class="flex items-center gap-3 px-4 py-3 border-b border-border">
          <SearchIcon />
          <input
            ref={inputRef}
            type="text"
            value={query()}
            onInput={(e) => handleInput(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            class="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <kbd class="hidden sm:inline-flex px-2 py-1 text-xs rounded bg-muted text-muted-foreground">
            Esc
          </kbd>
        </div>

        {/* Command list */}
        <ScrollArea class="max-h-80">
          <div class="p-2">
            <Show
              when={filteredCommands().length > 0}
              fallback={
                <div class="py-6 text-center text-sm text-muted-foreground">
                  No commands found
                </div>
              }
            >
              {/* Workers section */}
              <Show when={groupedCommands().worker.length > 0}>
                <div class="mb-2">
                  <p class="px-2 py-1 text-xs text-muted-foreground uppercase tracking-wider">
                    Workers
                  </p>
                  <For each={groupedCommands().worker}>
                    {(cmd, index) => {
                      const globalIndex = () => {
                        let i = 0;
                        for (const c of filteredCommands()) {
                          if (c.id === cmd.id) return i;
                          i++;
                        }
                        return -1;
                      };

                      return (
                        <CommandItem
                          command={cmd}
                          isSelected={selectedIndex() === globalIndex()}
                          onSelect={cmd.action}
                          onHover={() => setSelectedIndex(globalIndex())}
                        />
                      );
                    }}
                  </For>
                </div>
              </Show>

              {/* View section */}
              <Show when={groupedCommands().view.length > 0}>
                <div class="mb-2">
                  <p class="px-2 py-1 text-xs text-muted-foreground uppercase tracking-wider">
                    View
                  </p>
                  <For each={groupedCommands().view}>
                    {(cmd) => {
                      const globalIndex = () => {
                        let i = 0;
                        for (const c of filteredCommands()) {
                          if (c.id === cmd.id) return i;
                          i++;
                        }
                        return -1;
                      };

                      return (
                        <CommandItem
                          command={cmd}
                          isSelected={selectedIndex() === globalIndex()}
                          onSelect={cmd.action}
                          onHover={() => setSelectedIndex(globalIndex())}
                        />
                      );
                    }}
                  </For>
                </div>
              </Show>

              {/* Settings section */}
              <Show when={groupedCommands().settings.length > 0}>
                <div class="mb-2">
                  <p class="px-2 py-1 text-xs text-muted-foreground uppercase tracking-wider">
                    Settings
                  </p>
                  <For each={groupedCommands().settings}>
                    {(cmd) => {
                      const globalIndex = () => {
                        let i = 0;
                        for (const c of filteredCommands()) {
                          if (c.id === cmd.id) return i;
                          i++;
                        }
                        return -1;
                      };

                      return (
                        <CommandItem
                          command={cmd}
                          isSelected={selectedIndex() === globalIndex()}
                          onSelect={cmd.action}
                          onHover={() => setSelectedIndex(globalIndex())}
                        />
                      );
                    }}
                  </For>
                </div>
              </Show>
            </Show>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div class="flex items-center justify-between px-4 py-2 border-t border-border text-xs text-muted-foreground">
          <div class="flex items-center gap-4">
            <span class="flex items-center gap-1">
              <kbd class="px-1.5 py-0.5 rounded bg-muted">↑↓</kbd> navigate
            </span>
            <span class="flex items-center gap-1">
              <kbd class="px-1.5 py-0.5 rounded bg-muted">↵</kbd> select
            </span>
          </div>
          <span class="flex items-center gap-1">
            <kbd class="px-1.5 py-0.5 rounded bg-muted">{formatShortcut("mod+K")}</kbd> toggle
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Command item component
interface CommandItemProps {
  command: Command;
  isSelected: boolean;
  onSelect: () => void;
  onHover: () => void;
}

const CommandItem: Component<CommandItemProps> = (props) => {
  return (
    <button
      class={cn(
        "w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors",
        props.isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
      )}
      onClick={props.onSelect}
      onMouseEnter={props.onHover}
    >
      <span class="text-muted-foreground">
        <props.command.icon />
      </span>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-foreground">{props.command.title}</p>
        <Show when={props.command.description}>
          <p class="text-xs text-muted-foreground truncate">{props.command.description}</p>
        </Show>
      </div>
      <Show when={props.command.shortcut}>
        <kbd class="px-1.5 py-0.5 text-xs rounded bg-muted text-muted-foreground">
          {formatShortcut(props.command.shortcut!)}
        </kbd>
      </Show>
    </button>
  );
};
