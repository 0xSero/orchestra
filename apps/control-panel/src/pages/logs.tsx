/**
 * Logs Page - Logs and data view
 */

import type { Component } from "solid-js";
import { LogsPanel } from "@/components/log-stream";

export const LogsPage: Component = () => {
  return (
    <div class="flex-1 overflow-hidden">
      <LogsPanel />
    </div>
  );
};
