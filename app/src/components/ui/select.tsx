/**
 * Select Component - Kobalte-based dropdown select
 */

import { type Component, type JSX, splitProps } from "solid-js";
import { Select as KobalteSelect } from "@kobalte/core/select";
import { cn } from "@/lib/utils";

// Icons
const ChevronDown = () => (
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

const Check = () => (
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
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

// Select Root
export const Select = KobalteSelect;

// Select Value
export const SelectValue = KobalteSelect.Value;

// Select Trigger
interface SelectTriggerProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {}

export const SelectTrigger: Component<SelectTriggerProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "children"]);

  return (
    <KobalteSelect.Trigger
      class={cn(
        "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm",
        "ring-offset-background placeholder:text-muted-foreground",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        local.class
      )}
      {...others}
    >
      {local.children}
      <KobalteSelect.Icon class="ml-2 opacity-50">
        <ChevronDown />
      </KobalteSelect.Icon>
    </KobalteSelect.Trigger>
  );
};

// Select Content
interface SelectContentProps extends JSX.HTMLAttributes<HTMLDivElement> {}

export const SelectContent: Component<SelectContentProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "children"]);

  return (
    <KobalteSelect.Portal>
      <KobalteSelect.Content
        class={cn(
          "relative z-50 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md",
          "data-[expanded]:animate-in data-[closed]:animate-out",
          "data-[closed]:fade-out-0 data-[expanded]:fade-in-0",
          "data-[closed]:zoom-out-95 data-[expanded]:zoom-in-95",
          local.class
        )}
        {...others}
      >
        <KobalteSelect.Listbox class="p-1" />
      </KobalteSelect.Content>
    </KobalteSelect.Portal>
  );
};

// Select Item
interface SelectItemProps extends JSX.HTMLAttributes<HTMLDivElement> {
  item: { value: string; label: string };
}

export const SelectItem: Component<SelectItemProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "item"]);

  return (
    <KobalteSelect.Item
      item={local.item}
      class={cn(
        "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none",
        "focus:bg-accent focus:text-accent-foreground",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        local.class
      )}
      {...others}
    >
      <span class="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <KobalteSelect.ItemIndicator>
          <Check />
        </KobalteSelect.ItemIndicator>
      </span>
      <KobalteSelect.ItemLabel>{local.item.label}</KobalteSelect.ItemLabel>
    </KobalteSelect.Item>
  );
};
