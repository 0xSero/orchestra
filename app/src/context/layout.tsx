/**
 * Layout Context - UI layout state with mobile responsiveness
 */

import {
  createContext,
  useContext,
  createSignal,
  createEffect,
  onCleanup,
  type ParentComponent,
  type Accessor,
} from "solid-js";
import { createStore } from "solid-js/store";

interface LayoutState {
  sidebarOpen: boolean;
  selectedWorkerId: string | null;
  showJobQueue: boolean;
  showLogs: boolean;
  activePanel: "workers" | "skills" | "jobs" | "logs" | "settings";
  commandPaletteOpen: boolean;
}

interface LayoutContextValue {
  state: LayoutState;

  // Screen size
  isMobile: Accessor<boolean>;
  isTablet: Accessor<boolean>;
  isDesktop: Accessor<boolean>;

  // Sidebar
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // Worker selection
  selectWorker: (id: string | null) => void;
  selectedWorkerId: Accessor<string | null>;

  // Panels
  toggleJobQueue: () => void;
  setShowJobQueue: (show: boolean) => void;
  toggleLogs: () => void;
  setShowLogs: (show: boolean) => void;
  setActivePanel: (panel: LayoutState["activePanel"]) => void;

  // Command palette
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
}

const LayoutContext = createContext<LayoutContextValue>();

// Breakpoints
const MOBILE_BREAKPOINT = 640;
const TABLET_BREAKPOINT = 1024;

export const LayoutProvider: ParentComponent = (props) => {
  const [state, setState] = createStore<LayoutState>({
    sidebarOpen: false, // Start closed on mobile
    selectedWorkerId: null,
    showJobQueue: true,
    showLogs: true,
    activePanel: "workers",
    commandPaletteOpen: false,
  });

  // Responsive signals
  const [windowWidth, setWindowWidth] = createSignal(
    typeof window !== "undefined" ? window.innerWidth : 1024
  );

  const isMobile = () => windowWidth() < MOBILE_BREAKPOINT;
  const isTablet = () => windowWidth() >= MOBILE_BREAKPOINT && windowWidth() < TABLET_BREAKPOINT;
  const isDesktop = () => windowWidth() >= TABLET_BREAKPOINT;

  // Listen for window resize
  createEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleResize);
    onCleanup(() => window.removeEventListener("resize", handleResize));
  });

  // Auto-open sidebar on desktop
  createEffect(() => {
    if (isDesktop()) {
      setState("sidebarOpen", true);
    }
  });

  // Keyboard shortcuts
  createEffect(() => {
    if (typeof window === "undefined") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K for command palette
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setState("commandPaletteOpen", (v) => !v);
      }
      // Cmd/Ctrl + B for sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        setState("sidebarOpen", (v) => !v);
      }
      // Escape to close modals
      if (e.key === "Escape") {
        if (state.commandPaletteOpen) {
          setState("commandPaletteOpen", false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  const value: LayoutContextValue = {
    state,

    isMobile,
    isTablet,
    isDesktop,

    toggleSidebar: () => setState("sidebarOpen", (v) => !v),
    setSidebarOpen: (open) => setState("sidebarOpen", open),

    selectWorker: (id) => {
      setState("selectedWorkerId", id);
      // On mobile, close sidebar when selecting
      if (isMobile()) {
        setState("sidebarOpen", false);
      }
    },
    selectedWorkerId: () => state.selectedWorkerId,

    toggleJobQueue: () => setState("showJobQueue", (v) => !v),
    setShowJobQueue: (show) => setState("showJobQueue", show),

    toggleLogs: () => setState("showLogs", (v) => !v),
    setShowLogs: (show) => setState("showLogs", show),

    setActivePanel: (panel) => setState("activePanel", panel),

    openCommandPalette: () => setState("commandPaletteOpen", true),
    closeCommandPalette: () => setState("commandPaletteOpen", false),
    toggleCommandPalette: () => setState("commandPaletteOpen", (v) => !v),
  };

  return (
    <LayoutContext.Provider value={value}>
      {props.children}
    </LayoutContext.Provider>
  );
};

export function useLayout(): LayoutContextValue {
  const ctx = useContext(LayoutContext);
  if (!ctx) {
    throw new Error("useLayout must be used within a LayoutProvider");
  }
  return ctx;
}
