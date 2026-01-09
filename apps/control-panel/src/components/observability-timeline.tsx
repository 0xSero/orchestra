/**
 * ObservabilityTimeline - Correlate and filter events across OpenCode and Orchestrator
 */

import { type Component, createSignal, createMemo, For, Show } from "solid-js";
import { useOpenCode } from "@/context/opencode";
import {
  correlateEvents,
  filterEventsByFamily,
  groupEventsByCorrelationId,
  type EventFamily,
  type CorrelationIds,
  type CorrelatedEvent,
} from "@/lib/event-correlation";
import { formatRelativeTime } from "@/lib/utils";

type GroupByOption = keyof CorrelationIds | "none";

const familyColors: Record<EventFamily, string> = {
  session: "text-blue-500",
  message: "text-green-500",
  orchestra: "text-purple-500",
  unknown: "text-muted-foreground",
};

const familyLabels: Record<EventFamily, string> = {
  session: "Session",
  message: "Message",
  orchestra: "Orchestra",
  unknown: "Other",
};

export const ObservabilityTimeline: Component = () => {
  const { events } = useOpenCode();

  // Filter state
  const [activeFilters, setActiveFilters] = createSignal<EventFamily[]>([]);
  const [groupBy, setGroupBy] = createSignal<GroupByOption>("none");
  const [paused, setPaused] = createSignal(false);
  const [pausedSnapshot, setPausedSnapshot] = createSignal<ReturnType<typeof events>>([]);

  // Toggle a family filter
  const toggleFilter = (family: EventFamily) => {
    setActiveFilters((prev) => {
      if (prev.includes(family)) {
        return prev.filter((f) => f !== family);
      }
      return [...prev, family];
    });
  };

  // Toggle pause/resume
  const togglePause = () => {
    if (!paused()) {
      // Pause: snapshot current events
      setPausedSnapshot(events());
      setPaused(true);
    } else {
      // Resume: clear snapshot
      setPaused(false);
    }
  };

  // Filtered events (use snapshot when paused, live events when not)
  const filteredEvents = createMemo(() => {
    const allEvents = paused() ? pausedSnapshot() : events();
    const families = activeFilters();
    return filterEventsByFamily(allEvents, families);
  });

  // Correlated events
  const correlatedEvents = createMemo(() => {
    return correlateEvents(filteredEvents());
  });

  // Grouped events (when groupBy is set)
  const groupedEvents = createMemo(() => {
    const groupByValue = groupBy();
    if (groupByValue === "none") return null;

    const evts = filteredEvents();
    return groupEventsByCorrelationId(evts, groupByValue);
  });

  // Count of events
  const eventCount = createMemo(() => filteredEvents().length);

  // Family counts for badges
  const familyCounts = createMemo(() => {
    const counts: Record<EventFamily, number> = { session: 0, message: 0, orchestra: 0, unknown: 0 };
    for (const evt of correlatedEvents()) {
      counts[evt.family]++;
    }
    return counts;
  });

  const isFilterActive = (family: EventFamily) => activeFilters().includes(family);

  return (
    <div class="flex flex-col h-full">
      {/* Header */}
      <div class="flex items-center justify-between px-4 py-3 border-b border-border">
        <div class="flex items-center gap-3">
          {/* Pause/Resume button */}
          <button
            type="button"
            onClick={togglePause}
            class="px-3 py-1 text-xs rounded border border-border hover:bg-accent transition-colors"
            classList={{
              "bg-accent": paused(),
            }}
          >
            {paused() ? "Resume" : "Pause"}
          </button>
          <h2 class="text-sm font-semibold">Observability Timeline</h2>
          <span class="text-xs text-muted-foreground">{eventCount()} events</span>
        </div>
      </div>

      {/* Filters */}
      <div class="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30">
        <span class="text-xs text-muted-foreground mr-2">Filter:</span>
        <For each={(["session", "message", "orchestra"] as EventFamily[])}>
          {(family) => (
            <button
              type="button"
              onClick={() => toggleFilter(family)}
              class={`px-2 py-1 text-xs rounded border transition-colors ${
                isFilterActive(family)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-muted"
              }`}
            >
              {familyLabels[family]} ({familyCounts()[family]})
            </button>
          )}
        </For>

        <div class="flex-1" />

        <label class="flex items-center gap-2 text-xs">
          <span class="text-muted-foreground">Group by:</span>
          <select
            aria-label="Group by"
            value={groupBy()}
            onChange={(e) => setGroupBy(e.target.value as GroupByOption)}
            class="text-xs bg-background border border-border rounded px-2 py-1"
          >
            <option value="none">None</option>
            <option value="sessionId">Session</option>
            <option value="workerId">Worker</option>
            <option value="runId">Workflow Run</option>
            <option value="jobId">Job</option>
            <option value="taskId">Task</option>
          </select>
        </label>
      </div>

      {/* Timeline content */}
      <div class="flex-1 overflow-auto scrollbar-thin p-4">
        <Show
          when={eventCount() > 0}
          fallback={
            <div class="flex items-center justify-center h-32 text-sm text-muted-foreground">
              No events to display
            </div>
          }
        >
          {/* Grouped view */}
          <Show when={groupedEvents()}>
            {(groups) => (
              <div class="space-y-4">
                <For each={Object.entries(groups())}>
                  {([groupId, groupEvents]) => (
                    <div class="border border-border rounded-lg overflow-hidden">
                      <div class="px-3 py-2 bg-muted/50 border-b border-border flex items-center justify-between">
                        <span class="text-xs font-medium">
                          {groupId === "__uncorrelated" ? "Uncorrelated" : groupId}
                        </span>
                        <span class="text-xs text-muted-foreground">{groupEvents.length} events</span>
                      </div>
                      <div class="p-2 space-y-1">
                        <For each={correlateEvents(groupEvents)}>
                          {(correlated) => <EventRow event={correlated} />}
                        </For>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            )}
          </Show>

          {/* Flat timeline view */}
          <Show when={!groupedEvents()}>
            <div class="space-y-1">
              <For each={correlatedEvents()}>{(correlated) => <EventRow event={correlated} />}</For>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
};

/** Single event row in the timeline */
const EventRow: Component<{ event: CorrelatedEvent }> = (props) => {
  const event = () => props.event;
  const ids = () => event().correlationIds;

  // Build correlation badges
  const badges = createMemo(() => {
    const result: { label: string; value: string; href?: string }[] = [];
    const i = ids();

    if (i.sessionId) result.push({ label: "S", value: i.sessionId, href: `/chat?session=${i.sessionId}` });
    if (i.workerId) result.push({ label: "W", value: i.workerId, href: `/agents?worker=${i.workerId}` });
    if (i.runId) result.push({ label: "R", value: i.runId, href: `/workflows?run=${i.runId}` });
    if (i.jobId) result.push({ label: "J", value: i.jobId, href: `/tasks?job=${i.jobId}` });
    if (i.taskId) result.push({ label: "T", value: i.taskId, href: `/tasks?task=${i.taskId}` });

    return result;
  });

  return (
    <div class="flex items-start gap-3 text-xs py-1.5 px-2 rounded hover:bg-muted/50 transition-colors group">
      {/* Timestamp */}
      <span class="text-muted-foreground w-14 flex-shrink-0 font-mono">
        {formatRelativeTime(event().event.at)}
      </span>

      {/* Family indicator */}
      <span class={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${familyColors[event().family].replace("text-", "bg-")}`} />

      {/* Description */}
      <span class="flex-1 text-foreground/90">{event().description}</span>

      {/* Correlation badges */}
      <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <For each={badges()}>
          {(badge) => (
            <a
              href={badge.href}
              class="px-1.5 py-0.5 text-[10px] bg-muted rounded border border-border hover:bg-muted/80"
              title={`${badge.label}: ${badge.value}`}
            >
              {badge.label}
            </a>
          )}
        </For>
      </div>
    </div>
  );
};
