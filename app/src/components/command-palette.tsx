/**
 * CommandPalette Component - Quick action command palette
 */

import { useNavigate } from "@solidjs/router";
import { type Component, createEffect, createMemo, createSignal, Show } from "solid-js";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLayout } from "@/context/layout";
import { useOpenCode } from "@/context/opencode";
import { useSkills } from "@/context/skills";
import { formatShortcut } from "@/lib/utils";
import { buildCommandList, type Command } from "./command-palette-commands";
import { CommandGroup } from "./command-palette-group";
import { SearchIcon } from "./command-palette-icons";

/** Global command palette for quick actions. */
export const CommandPalette: Component = () => {
  const {
    state,
    closeCommandPalette,
    openSpawnDialog,
    toggleSidebar,
    toggleJobQueue,
    toggleLogs,
    selectWorker,
    setActivePanel,
    setCommandPaletteQuery,
  } = useLayout();
  const { sessions, refresh } = useOpenCode();
  const { refresh: refreshSkills, openCreateDialog } = useSkills();
  const navigate = useNavigate();

  const [selectedIndex, setSelectedIndex] = createSignal(0);
  let inputRef: HTMLInputElement | undefined;

  const commands = createMemo(() =>
    buildCommandList({
      sessions: sessions(),
      closeCommandPalette,
      openSpawnDialog,
      toggleSidebar,
      toggleJobQueue,
      toggleLogs,
      selectWorker,
      setActivePanel,
      refreshSessions: refresh,
      refreshSkills,
      openCreateDialog,
      navigate,
    }),
  );

  // Filter commands based on query
  const filteredCommands = createMemo(() => {
    const q = state.commandPaletteQuery.toLowerCase().trim();
    if (!q) return commands();

    return commands().filter((cmd) => {
      return (
        cmd.title.toLowerCase().includes(q) ||
        cmd.description?.toLowerCase().includes(q) ||
        cmd.category.toLowerCase().includes(q)
      );
    });
  });

  const indexById = createMemo(() => {
    const map = new Map<string, number>();
    filteredCommands().forEach((cmd, idx) => {
      map.set(cmd.id, idx);
    });
    return map;
  });

  // Group commands by category
  const groupedCommands = createMemo(() => {
    const groups: Record<string, Command[]> = {
      worker: [],
      skills: [],
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
    setCommandPaletteQuery(value);
  };

  createEffect(() => {
    state.commandPaletteQuery;
    setSelectedIndex(0);
  });

  // Focus input when opened
  createEffect(() => {
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
            value={state.commandPaletteQuery}
            onInput={(e) => handleInput(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            class="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <kbd class="hidden sm:inline-flex px-2 py-1 text-xs rounded bg-muted text-muted-foreground">Esc</kbd>
        </div>

        {/* Command list */}
        <ScrollArea class="max-h-80">
          <div class="p-2">
            <Show
              when={filteredCommands().length > 0}
              fallback={<div class="py-6 text-center text-sm text-muted-foreground">No commands found</div>}
            >
              <CommandGroup
                title="Workers"
                commands={groupedCommands().worker}
                indexById={indexById()}
                selectedIndex={selectedIndex()}
                onSelectIndex={setSelectedIndex}
              />
              <CommandGroup
                title="Recipes"
                commands={groupedCommands().skills}
                indexById={indexById()}
                selectedIndex={selectedIndex()}
                onSelectIndex={setSelectedIndex}
              />
              <CommandGroup
                title="View"
                commands={groupedCommands().view}
                indexById={indexById()}
                selectedIndex={selectedIndex()}
                onSelectIndex={setSelectedIndex}
              />
              <CommandGroup
                title="Settings"
                commands={groupedCommands().settings}
                indexById={indexById()}
                selectedIndex={selectedIndex()}
                onSelectIndex={setSelectedIndex}
              />
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
