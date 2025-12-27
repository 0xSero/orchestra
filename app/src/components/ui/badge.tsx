/**
 * Badge Component - Status indicators and labels
 */

import { type Component, type JSX, splitProps } from "solid-js";
import { cn } from "@/lib/utils";

export interface BadgeProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "outline" | "ready" | "busy" | "error" | "stopped" | "starting";
}

const badgeVariants = {
  base: "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  variant: {
    default: "border-transparent bg-primary text-primary-foreground",
    secondary: "border-transparent bg-secondary text-secondary-foreground",
    outline: "border border-border text-foreground",
    // Status variants
    ready: "border-transparent bg-status-ready/20 text-status-ready",
    busy: "border-transparent bg-status-busy/20 text-status-busy",
    error: "border-transparent bg-status-error/20 text-status-error",
    stopped: "border-transparent bg-status-stopped/20 text-status-stopped",
    starting: "border-transparent bg-status-starting/20 text-status-starting",
  },
};

export const Badge: Component<BadgeProps> = (props) => {
  const [local, others] = splitProps(props, ["variant", "class", "children"]);

  return (
    <span class={cn(badgeVariants.base, badgeVariants.variant[local.variant ?? "default"], local.class)} {...others}>
      {local.children}
    </span>
  );
};

// Status dot indicator
export interface StatusDotProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  status: "ready" | "busy" | "error" | "stopped" | "starting";
  pulse?: boolean;
}

export const StatusDot: Component<StatusDotProps> = (props) => {
  const [local, others] = splitProps(props, ["status", "pulse", "class"]);

  const statusColors = {
    ready: "bg-status-ready",
    busy: "bg-status-busy",
    error: "bg-status-error",
    stopped: "bg-status-stopped",
    starting: "bg-status-starting",
  };

  return (
    <span class={cn("relative flex h-2 w-2", local.class)} {...others}>
      {local.pulse && (
        <span
          class={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
            statusColors[local.status],
          )}
        />
      )}
      <span class={cn("relative inline-flex h-2 w-2 rounded-full", statusColors[local.status])} />
    </span>
  );
};
