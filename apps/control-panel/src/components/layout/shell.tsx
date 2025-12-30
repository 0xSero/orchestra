/**
 * Shell Component - Main app layout with responsive sidebar
 */

import { type Component, type ParentComponent, type ParentProps, Show } from "solid-js";
import { useLayout } from "@/context/layout";
import { cn } from "@/lib/utils";

// Icons
const MenuIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <line x1="4" x2="20" y1="12" y2="12" />
    <line x1="4" x2="20" y1="6" y2="6" />
    <line x1="4" x2="20" y1="18" y2="18" />
  </svg>
);

const XIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

export const Shell: ParentComponent = (props) => {
  return <div class="flex h-screen flex-col bg-background text-foreground overflow-hidden">{props.children}</div>;
};

// Sidebar component with mobile drawer
type SidebarProps = ParentProps;

export const Sidebar: Component<SidebarProps> = (props) => {
  const { state, setSidebarOpen, isMobile } = useLayout();

  return (
    <>
      {/* Mobile overlay */}
      <Show when={isMobile() && state.sidebarOpen}>
        <div class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      </Show>

      {/* Sidebar */}
      <aside
        class={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-card border-r border-border transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0",
          state.sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Mobile close button */}
        <Show when={isMobile()}>
          <button
            class="absolute right-3 top-3 p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
            onClick={() => setSidebarOpen(false)}
          >
            <XIcon />
          </button>
        </Show>

        {props.children}
      </aside>
    </>
  );
};

// Main content area
export const MainContent: ParentComponent = (props) => {
  const { state, isDesktop } = useLayout();

  return (
    <main
      class={cn(
        "flex-1 flex flex-col overflow-hidden transition-all duration-300",
        isDesktop() && state.sidebarOpen ? "lg:ml-0" : "",
      )}
    >
      {props.children}
    </main>
  );
};

// Header component
type HeaderProps = ParentProps;

export const Header: Component<HeaderProps> = (props) => {
  const { toggleSidebar, isMobile, isTablet } = useLayout();

  return (
    <header class="flex h-14 items-center gap-4 border-b border-border bg-card px-4 lg:px-6">
      {/* Mobile menu button */}
      <Show when={isMobile() || isTablet()}>
        <button
          class="p-2 -ml-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent lg:hidden"
          onClick={toggleSidebar}
        >
          <MenuIcon />
        </button>
      </Show>

      {props.children}
    </header>
  );
};

// Panel container for split views
interface PanelContainerProps extends ParentProps {
  direction?: "horizontal" | "vertical";
}

export const PanelContainer: Component<PanelContainerProps> = (props) => {
  const direction = props.direction ?? "horizontal";

  return (
    <div class={cn("flex-1 flex overflow-hidden", direction === "horizontal" ? "flex-row" : "flex-col")}>
      {props.children}
    </div>
  );
};

// Individual panel
interface PanelProps extends ParentProps {
  size?: "auto" | "sm" | "md" | "lg" | "full";
  class?: string;
}

export const Panel: Component<PanelProps> = (props) => {
  const sizeClass = {
    auto: "flex-1",
    sm: "w-64 flex-shrink-0",
    md: "w-80 flex-shrink-0",
    lg: "w-96 flex-shrink-0",
    full: "flex-1",
  };

  return (
    <div class={cn("flex flex-col overflow-hidden border-border", sizeClass[props.size ?? "auto"], props.class)}>
      {props.children}
    </div>
  );
};

// Panel header
type PanelHeaderProps = ParentProps<{ title: string }>;

export const PanelHeader: Component<PanelHeaderProps> = (props) => {
  return (
    <div class="flex h-12 items-center justify-between border-b border-border px-4 flex-shrink-0">
      <h2 class="text-sm font-medium text-foreground">{props.title}</h2>
      {props.children}
    </div>
  );
};

// Panel content
export const PanelContent: ParentComponent<{ class?: string }> = (props) => {
  return <div class={cn("flex-1 overflow-auto", props.class)}>{props.children}</div>;
};

// Footer component for mobile bottom nav
type FooterProps = ParentProps;

export const Footer: Component<FooterProps> = (props) => {
  return (
    <footer class="flex h-16 items-center border-t border-border bg-card px-4 lg:hidden safe-area-bottom">
      {props.children}
    </footer>
  );
};
