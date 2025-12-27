import { type Component, Show } from "solid-js";
import { cn, formatShortcut } from "@/lib/utils";
import type { Command } from "./command-palette-commands";

export interface CommandItemProps {
  command: Command;
  isSelected: boolean;
  onSelect: () => void;
  onHover: () => void;
}

/** Render a single command row in the palette. */
export const CommandItem: Component<CommandItemProps> = (props) => {
  return (
    <button
      class={cn(
        "w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors",
        props.isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
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
