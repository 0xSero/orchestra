import type { Component } from "solid-js";
import { ChatIcon, ServerIcon } from "@/components/icons/session-icons";

export type DashboardTabId = "chat" | "agents" | "logs" | "system";

export type DashboardTab = {
  id: DashboardTabId;
  label: string;
  icon: Component;
};

const ChatTabIcon: Component = () => <ChatIcon size={14} strokeWidth={2} />;

const AgentsIcon: Component = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M8 6h13" />
    <path d="M8 12h13" />
    <path d="M8 18h13" />
    <path d="M3 6h.01" />
    <path d="M3 12h.01" />
    <path d="M3 18h.01" />
  </svg>
);

const LogsIcon: Component = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M4 6h16" />
    <path d="M4 12h16" />
    <path d="M4 18h16" />
  </svg>
);

const SystemTabIcon: Component = () => <ServerIcon size={14} strokeWidth={2} />;

export const dashboardTabs: DashboardTab[] = [
  { id: "chat", label: "Chat", icon: ChatTabIcon },
  { id: "agents", label: "Agents", icon: AgentsIcon },
  { id: "logs", label: "Logs", icon: LogsIcon },
  { id: "system", label: "System", icon: SystemTabIcon },
];
