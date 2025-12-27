/**
 * Separator Component - Visual divider
 */

import { Separator as KobalteSeparator } from "@kobalte/core/separator";
import { type Component, type JSX, splitProps } from "solid-js";
import { cn } from "@/lib/utils";

export interface SeparatorProps extends JSX.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
  decorative?: boolean;
}

export const Separator: Component<SeparatorProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "orientation", "decorative"]);

  return (
    <KobalteSeparator
      orientation={local.orientation ?? "horizontal"}
      class={cn(
        "shrink-0 bg-border",
        local.orientation === "vertical" ? "h-full w-[1px]" : "h-[1px] w-full",
        local.class,
      )}
      {...others}
    />
  );
};
