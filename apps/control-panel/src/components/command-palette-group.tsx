import { For, Show } from "solid-js";
import type { Command } from "./command-palette-commands";
import { CommandItem } from "./command-palette-item";

type CommandGroupProps = {
  title: string;
  commands: Command[];
  indexById: Map<string, number>;
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
};

/** Render a grouped section of command palette items. */
export const CommandGroup = (props: CommandGroupProps) => {
  return (
    <Show when={props.commands.length > 0}>
      <div class="mb-2">
        <p class="px-2 py-1 text-xs text-muted-foreground uppercase tracking-wider">{props.title}</p>
        <For each={props.commands}>
          {(cmd) => {
            const globalIndex = () => props.indexById.get(cmd.id) ?? -1;

            return (
              <CommandItem
                command={cmd}
                isSelected={props.selectedIndex === globalIndex()}
                onSelect={cmd.action}
                onHover={() => props.onSelectIndex(globalIndex())}
              />
            );
          }}
        </For>
      </div>
    </Show>
  );
};
