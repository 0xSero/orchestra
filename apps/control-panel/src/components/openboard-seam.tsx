/**
 * OpenBoard Integration Seam
 *
 * Provides a reversible integration point for OpenBoard features.
 * Can be toggled via localStorage or environment variable.
 */

import { type Component, createSignal, Show, onMount } from "solid-js";

/** Check if OpenBoard is enabled via localStorage or env */
export function isOpenBoardEnabled(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem("openboard.enabled") === "true";
}

/** Toggle OpenBoard on/off */
export function setOpenBoardEnabled(enabled: boolean): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem("openboard.enabled", enabled ? "true" : "false");
}

/**
 * OpenBoardSeam - Integration point for OpenBoard features
 *
 * This component acts as a seam that can switch between:
 * - Legacy control panel components
 * - New OpenBoard components
 *
 * The seam is reversible via localStorage toggle.
 */
export const OpenBoardSeam: Component = () => {
  const [enabled, setEnabled] = createSignal(false);

  onMount(() => {
    setEnabled(isOpenBoardEnabled());
  });

  const toggleOpenBoard = () => {
    const newState = !enabled();
    setOpenBoardEnabled(newState);
    setEnabled(newState);
  };

  return (
    <div data-testid="openboard-seam" class="p-4">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="text-sm font-medium">OpenBoard Integration</h3>
          <p class="text-xs text-muted-foreground mt-1">
            {enabled() ? "OpenBoard features are enabled" : "Using legacy control panel"}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleOpenBoard}
          class={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
            enabled()
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background border-border hover:bg-muted"
          }`}
        >
          {enabled() ? "Disable OpenBoard" : "Enable OpenBoard"}
        </button>
      </div>

      <Show when={enabled()}>
        <div class="p-4 rounded-lg bg-muted/50 border border-border">
          <p class="text-sm text-muted-foreground">
            OpenBoard features are now integrated. The following surfaces will use OpenBoard:
          </p>
          <ul class="mt-2 text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>Observability Timeline (shared)</li>
            <li>Task Management (shared)</li>
            <li>Workflow Monitoring (pending transplant)</li>
          </ul>
        </div>
      </Show>

      <Show when={!enabled()}>
        <div class="p-4 rounded-lg bg-muted/30 border border-border/50">
          <p class="text-sm text-muted-foreground">
            Enable OpenBoard to access integrated features. This toggle is reversible.
          </p>
        </div>
      </Show>
    </div>
  );
};

/**
 * OpenBoardRoute - Route-based seam for OpenBoard pages
 *
 * Use this as a route component to render OpenBoard features
 * under specific paths (e.g., /openboard/*).
 *
 * Note: This component doesn't use route props since it's a feature-flagged
 * landing page, not a data-driven route.
 */
export const OpenBoardRoute: Component = () => {
  const enabled = () => isOpenBoardEnabled();

  return (
    <Show
      when={enabled()}
      fallback={
        <div class="flex items-center justify-center h-full">
          <div class="text-center">
            <h2 class="text-lg font-medium mb-2">OpenBoard Not Enabled</h2>
            <p class="text-sm text-muted-foreground mb-4">
              Enable OpenBoard in settings to access this feature.
            </p>
            <button
              type="button"
              onClick={() => {
                setOpenBoardEnabled(true);
                window.location.reload();
              }}
              class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md"
            >
              Enable OpenBoard
            </button>
          </div>
        </div>
      }
    >
      {/* OpenBoard content will be rendered here */}
      <div class="h-full">
        <OpenBoardSeam />
      </div>
    </Show>
  );
};
