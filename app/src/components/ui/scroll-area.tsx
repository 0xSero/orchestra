/**
 * ScrollArea Component - Custom scrollable container
 */

import { type Component, type JSX, splitProps } from "solid-js";
import { cn } from "@/lib/utils";

export interface ScrollAreaProps extends JSX.HTMLAttributes<HTMLDivElement> {
  orientation?: "vertical" | "horizontal" | "both";
}

export const ScrollArea: Component<ScrollAreaProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "children", "orientation"]);
  const orientation = local.orientation ?? "vertical";

  const overflowClass = {
    vertical: "overflow-y-auto overflow-x-hidden",
    horizontal: "overflow-x-auto overflow-y-hidden",
    both: "overflow-auto",
  };

  return (
    <div
      class={cn(
        "relative",
        overflowClass[orientation],
        // Custom scrollbar styles
        "scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border hover:scrollbar-thumb-muted-foreground/30",
        local.class
      )}
      {...others}
    >
      {local.children}
    </div>
  );
};

// Viewport wrapper for content
export interface ScrollViewportProps extends JSX.HTMLAttributes<HTMLDivElement> {}

export const ScrollViewport: Component<ScrollViewportProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "children"]);

  return (
    <div class={cn("h-full w-full", local.class)} {...others}>
      {local.children}
    </div>
  );
};
