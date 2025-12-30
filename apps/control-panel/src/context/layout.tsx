/**
 * Layout Context - UI layout state with mobile responsiveness
 */

import {
  type Accessor,
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  type ParentComponent,
  useContext,
} from "solid-js";
import { createStore } from "solid-js/store";
import { useDb } from "@/context/db";
import { useOpenCode } from "@/context/opencode";

interface LayoutState {
  sidebarOpen: boolean;
  selectedWorkerId: string | null;
  activeSubagentSessionId: string | null;
  activeSubagentParentId: string | null;
  showJobQueue: boolean;
  showLogs: boolean;
  activePanel: "workers" | "agents" | "jobs" | "logs" | "settings";
  commandPaletteOpen: boolean;
  commandPaletteQuery: string;
  spawnDialogOpen: boolean;
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
  activeSubagentSessionId: Accessor<string | null>;
  activeSubagentParentId: Accessor<string | null>;
  returnToParentSession: () => void;

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
  setCommandPaletteQuery: (query: string) => void;

  // Spawn dialog
  openSpawnDialog: () => void;
  closeSpawnDialog: () => void;
}

const LayoutContext = createContext<LayoutContextValue>();

// Breakpoints
const MOBILE_BREAKPOINT = 640;
const TABLET_BREAKPOINT = 1024;

export const LayoutProvider: ParentComponent = (props) => {
  const [state, setState] = createStore<LayoutState>({
    sidebarOpen: false, // Start closed on mobile
    selectedWorkerId: null,
    activeSubagentSessionId: null,
    activeSubagentParentId: null,
    showJobQueue: true,
    showLogs: true,
    activePanel: "workers",
    commandPaletteOpen: false,
    commandPaletteQuery: "",
    spawnDialogOpen: false,
  });

  const openCode = useOpenCode();
  const db = useDb();

  // Responsive signals
  const [windowWidth, setWindowWidth] = createSignal(typeof window !== "undefined" ? window.innerWidth : 1024);

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

  const selectWorker = (id: string | null) => {
    setState("selectedWorkerId", id);
    if (isMobile()) {
      setState("sidebarOpen", false);
    }
  };

  createEffect(() => {
    const workerStates = db.workerStates();
    if (workerStates.length === 0) return;
    openCode.hydrateWorkers(workerStates);
  });

  createEffect(() => {
    const event = openCode.lastSubagentEvent();
    if (!event) return;
    if (event.type === "active") {
      const sessionId = event.subagent.sessionId;
      setState("activeSubagentSessionId", sessionId);
      setState("activeSubagentParentId", event.subagent.parentSessionId ?? null);
      if (state.selectedWorkerId !== sessionId) selectWorker(sessionId);
      return;
    }

    if (event.type === "closed") {
      if (state.activeSubagentSessionId !== event.subagent.sessionId) return;
      const parentId = event.subagent.parentSessionId ?? state.activeSubagentParentId;
      setState("activeSubagentSessionId", null);
      setState("activeSubagentParentId", null);
      if (parentId && state.selectedWorkerId === event.subagent.sessionId) selectWorker(parentId);
    }
  });

  // Keyboard shortcuts
  createEffect(() => {
    if (typeof window === "undefined") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K for command palette
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setState("commandPaletteOpen", (v) => {
          if (v) setState("commandPaletteQuery", "");
          return !v;
        });
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
          setState("commandPaletteQuery", "");
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

    selectWorker,
    selectedWorkerId: () => state.selectedWorkerId,
    activeSubagentSessionId: () => state.activeSubagentSessionId,
    activeSubagentParentId: () => state.activeSubagentParentId,
    returnToParentSession: () => {
      const parentId = state.activeSubagentParentId;
      if (!parentId) return;
      setState("activeSubagentSessionId", null);
      setState("activeSubagentParentId", null);
      selectWorker(parentId);
    },

    toggleJobQueue: () => setState("showJobQueue", (v) => !v),
    setShowJobQueue: (show) => setState("showJobQueue", show),

    toggleLogs: () => setState("showLogs", (v) => !v),
    setShowLogs: (show) => setState("showLogs", show),

    setActivePanel: (panel) => setState("activePanel", panel),

    openCommandPalette: () => setState("commandPaletteOpen", true),
    closeCommandPalette: () => {
      setState("commandPaletteOpen", false);
      setState("commandPaletteQuery", "");
    },
    toggleCommandPalette: () =>
      setState("commandPaletteOpen", (v) => {
        if (v) setState("commandPaletteQuery", "");
        return !v;
      }),
    setCommandPaletteQuery: (query) => setState("commandPaletteQuery", query),

    openSpawnDialog: () => setState("spawnDialogOpen", true),
    closeSpawnDialog: () => setState("spawnDialogOpen", false),
  };

  return <LayoutContext.Provider value={value}>{props.children}</LayoutContext.Provider>;
};

export function useLayout(): LayoutContextValue {
  const ctx = useContext(LayoutContext);
  if (!ctx) {
    throw new Error("useLayout must be used within a LayoutProvider");
  }
  return ctx;
}
