/**
 * Header Component - Top navigation with stats and controls
 */

import { type Component, Show } from "solid-js";
import { StatusDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLayout } from "@/context/layout";
import { useOpenCode } from "@/context/opencode";
import { formatShortcut } from "@/lib/utils";

// Icons
const CommandIcon = () => (
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
    <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
  </svg>
);

const SettingsIcon = () => (
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
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const AppHeader: Component = () => {
  const { connected } = useOpenCode();
  const { openCommandPalette, isMobile, setActivePanel } = useLayout();

  return (
    <div class="flex items-center justify-between w-full gap-4">
      {/* Left: Logo and title */}
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
            <CommandIcon />
          </div>
          <Show when={!isMobile()}>
            <span class="font-semibold text-foreground">OpenCode Studio</span>
          </Show>
        </div>

        {/* Connection status */}
        <div class="flex items-center gap-2 ml-2">
          <StatusDot status={connected() ? "ready" : "error"} pulse={connected()} />
          <span class="text-xs text-muted-foreground hidden sm:inline">
            {connected() ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>

      {/* Right: Controls */}
      <div class="flex items-center gap-1">
        {/* Command palette button */}
        <Tooltip>
          <TooltipTrigger as={Button} variant="ghost" size="icon" onClick={openCommandPalette}>
            <CommandIcon />
          </TooltipTrigger>
          <TooltipContent>Command palette ({formatShortcut("mod+K")})</TooltipContent>
        </Tooltip>

        {/* Settings */}
        <Tooltip>
          <TooltipTrigger as={Button} variant="ghost" size="icon" onClick={() => setActivePanel("settings")}>
            <SettingsIcon />
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};

// Re-export for backward compatibility
export { AppHeader as Header };
