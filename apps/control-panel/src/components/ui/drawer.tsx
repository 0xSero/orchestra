/**
 * Drawer - Right-side panel component
 * Used for issue details, workflow details, memory details, etc.
 */

import { type Component, createEffect, type JSX, Show } from "solid-js";
import { Portal } from "solid-js/web";

const CloseIcon: Component = () => (
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
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: JSX.Element;
  footer?: JSX.Element;
};

/** Drawer component - slides in from the right */
export const Drawer: Component<DrawerProps> = (props) => {
  // Handle Escape key
  createEffect(() => {
    if (!props.open) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        props.onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  });

  // Prevent body scroll when drawer is open
  createEffect(() => {
    if (props.open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  });

  return (
    <Show when={props.open}>
      <Portal>
        {/* Backdrop */}
        <div
          class="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 animate-fade-in"
          onClick={props.onClose}
        />

        {/* Drawer */}
        <div
          class="fixed inset-y-0 right-0 w-full max-w-2xl bg-card border-l border-border shadow-2xl z-50 flex flex-col animate-slide-in-right"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div class="flex items-start justify-between gap-4 px-6 py-4 border-b border-border bg-card/50 backdrop-blur">
            <div class="flex-1 min-w-0">
              <Show when={props.title}>
                <h2 class="text-lg font-semibold text-foreground truncate">
                  {props.title}
                </h2>
              </Show>
              <Show when={props.subtitle}>
                <p class="text-sm text-muted-foreground mt-1">
                  {props.subtitle}
                </p>
              </Show>
            </div>

            <button
              type="button"
              class="p-2 text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md transition-colors"
              onClick={props.onClose}
              title="Close (Esc)"
            >
              <CloseIcon />
            </button>
          </div>

          {/* Content */}
          <div class="flex-1 overflow-y-auto scrollbar-thin px-6 py-4">
            {props.children}
          </div>

          {/* Footer */}
          <Show when={props.footer}>
            <div class="px-6 py-4 border-t border-border bg-card/50 backdrop-blur">
              {props.footer}
            </div>
          </Show>
        </div>
      </Portal>
    </Show>
  );
};
