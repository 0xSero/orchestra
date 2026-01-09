/**
 * Observability Page - Timeline view for correlated events
 */

import type { Component } from "solid-js";
import { ObservabilityTimeline } from "@/components/observability-timeline";

export const ObservabilityPage: Component = () => {
  return (
    <div class="h-full flex flex-col">
      <ObservabilityTimeline />
    </div>
  );
};
