/**
 * Tooltip Component - Kobalte-based tooltip
 */

import { type Component, type JSX, splitProps } from "solid-js";
import { Tooltip as KobalteTooltip } from "@kobalte/core/tooltip";
import { cn } from "@/lib/utils";

// Tooltip Root
export const Tooltip = KobalteTooltip;

// Tooltip Trigger
export const TooltipTrigger = KobalteTooltip.Trigger;

// Tooltip Content
interface TooltipContentProps extends JSX.HTMLAttributes<HTMLDivElement> {}

export const TooltipContent: Component<TooltipContentProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "children"]);

  return (
    <KobalteTooltip.Portal>
      <KobalteTooltip.Content
        class={cn(
          "z-50 overflow-hidden rounded-md border border-border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md",
          "animate-in fade-in-0 zoom-in-95",
          "data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95",
          local.class
        )}
        {...others}
      >
        <KobalteTooltip.Arrow />
        {local.children}
      </KobalteTooltip.Content>
    </KobalteTooltip.Portal>
  );
};
