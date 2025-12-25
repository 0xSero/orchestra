/**
 * Header Component - Top navigation with stats and controls
 */

import { type Component, Show, createMemo } from "solid-js";
import { useOpenCode } from "@/context/opencode";
import { useLayout } from "@/context/layout";
import { Button } from "@/components/ui/button";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { formatShortcut } from "@/lib/utils";

// Icons
const CommandIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
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

const CircleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="12" r="10" />
  </svg>
);

export const AppHeader: Component = () => {
  const { sessions, connected } = useOpenCode();
  const { state, toggleJobQueue, toggleLogs, openCommandPalette, isMobile } = useLayout();

  // Session stats
  const stats = createMemo(() => {
    const all = sessions();
    return {
      total: all.length,
      recent: all.filter((s) => Date.now() - s.time.updated < 3600000).length, // last hour
    };
  });

  return (
    <div class="flex items-center justify-between w-full gap-4">
      {/* Left: Logo and title */}
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
            <TerminalIcon />
          </div>
          <Show when={!isMobile()}>
            <span class="font-semibold text-foreground">Orchestrator</span>
          </Show>
        </div>

        {/* Connection status */}
        <div class="flex items-center gap-2 ml-2">
          <StatusDot
            status={connected() ? "ready" : "error"}
            pulse={connected()}
          />
          <span class="text-xs text-muted-foreground hidden sm:inline">
            {connected() ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>

      {/* Center: Stats badges (hidden on mobile) */}
      <Show when={!isMobile()}>
        <div class="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="secondary" class="gap-1">
                <CircleIcon />
                {stats().total} sessions
              </Badge>
            </TooltipTrigger>
            <TooltipContent>Total OpenCode sessions</TooltipContent>
          </Tooltip>

          <Show when={stats().recent > 0}>
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="ready" class="gap-1">
                  <CircleIcon />
                  {stats().recent} active
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Sessions active in last hour</TooltipContent>
            </Tooltip>
          </Show>
        </div>
      </Show>

      {/* Right: Controls */}
      <div class="flex items-center gap-1">
        {/* Command palette button */}
        <Tooltip>
          <TooltipTrigger
            as={Button}
            variant="ghost"
            size="icon"
            onClick={openCommandPalette}
          >
            <CommandIcon />
          </TooltipTrigger>
          <TooltipContent>
            Command palette ({formatShortcut("mod+K")})
          </TooltipContent>
        </Tooltip>

        {/* Toggle job queue */}
        <Show when={!isMobile()}>
          <Tooltip>
            <TooltipTrigger
              as={Button}
              variant={state.showJobQueue ? "secondary" : "ghost"}
              size="icon"
              onClick={toggleJobQueue}
            >
              <ListIcon />
            </TooltipTrigger>
            <TooltipContent>Toggle job queue</TooltipContent>
          </Tooltip>
        </Show>

        {/* Toggle logs */}
        <Show when={!isMobile()}>
          <Tooltip>
            <TooltipTrigger
              as={Button}
              variant={state.showLogs ? "secondary" : "ghost"}
              size="icon"
              onClick={toggleLogs}
            >
              <TerminalIcon />
            </TooltipTrigger>
            <TooltipContent>Toggle logs</TooltipContent>
          </Tooltip>
        </Show>

        {/* Settings */}
        <Tooltip>
          <TooltipTrigger as={Button} variant="ghost" size="icon">
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
