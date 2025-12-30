/**
 * Dashboard - Live system overview
 */

import { useNavigate } from "@solidjs/router";
import { type Component, createMemo, For, Show } from "solid-js";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLayout } from "@/context/layout";
import { useOpenCode } from "@/context/opencode";
import { parseOrchestratorEvent } from "@/context/opencode-helpers";
import type { OrchestratorEvent, WorkerRuntime } from "@/context/opencode-types";
import { formatDuration, formatRelativeTime, truncate } from "@/lib/utils";

const statusLabel = (status: WorkerRuntime["status"]) => {
  switch (status) {
    case "ready":
      return "Ready";
    case "busy":
      return "Busy";
    case "error":
      return "Error";
    case "stopped":
      return "Stopped";
    default:
      return "Starting";
  }
};

const getMemoryField = (data: Record<string, unknown>, key: string) => {
  const value = data[key];
  return typeof value === "string" ? value : "";
};

/** Main dashboard page with worker + workflow overview. */
export const DashboardPage: Component = () => {
  const navigate = useNavigate();
  const { selectWorker } = useLayout();
  const { workers, workerStreams, workflowRuns, events } = useOpenCode();

  const sortedWorkers = createMemo(() =>
    workers()
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  const streamsByWorker = createMemo(() => {
    const map = new Map<string, string>();
    for (const stream of workerStreams()) {
      map.set(stream.workerId, stream.chunk);
    }
    return map;
  });

  const sortedRuns = createMemo(() =>
    workflowRuns()
      .slice()
      .sort((a, b) => b.startedAt - a.startedAt),
  );

  const activeRuns = createMemo(() => sortedRuns().filter((run) => run.status === "running"));

  const memoryWrites = createMemo(() =>
    events()
      .map((item) => parseOrchestratorEvent(item.payload))
      .filter((event): event is OrchestratorEvent => Boolean(event) && event.type === "orchestra.memory.written")
      .sort((a, b) => b.timestamp - a.timestamp),
  );

  const errorEvents = createMemo(() =>
    events()
      .map((item) => parseOrchestratorEvent(item.payload))
      .filter((event): event is OrchestratorEvent => Boolean(event) && event.type === "orchestra.error")
      .sort((a, b) => b.timestamp - a.timestamp),
  );

  const openChat = (worker: WorkerRuntime) => {
    if (!worker.sessionId) return;
    selectWorker(worker.sessionId);
    navigate("/chat");
  };

  return (
    <div class="flex-1 flex flex-col overflow-hidden">
      <header class="px-6 py-5 border-b border-border">
        <h1 class="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p class="text-sm text-muted-foreground">
          Live overview of workers, active workflows, and recent memory writes.
        </p>
      </header>

      <div class="flex-1 overflow-auto">
        <div class="p-6 space-y-6">
          <div class="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle class="text-sm text-muted-foreground">Workers</CardTitle>
              </CardHeader>
              <CardContent class="text-2xl font-semibold">{workers().length}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle class="text-sm text-muted-foreground">Active Workflows</CardTitle>
              </CardHeader>
              <CardContent class="text-2xl font-semibold">{activeRuns().length}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle class="text-sm text-muted-foreground">Memory Writes</CardTitle>
              </CardHeader>
              <CardContent class="text-2xl font-semibold">{memoryWrites().length}</CardContent>
            </Card>
          </div>

          <section class="space-y-3">
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold">Workers</h2>
              <span class="text-xs text-muted-foreground">{sortedWorkers().length} total</span>
            </div>
            <Show
              when={sortedWorkers().length > 0}
              fallback={<div class="text-sm text-muted-foreground">No worker activity yet.</div>}
            >
              <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <For each={sortedWorkers()}>
                  {(worker) => (
                    <Card>
                      <CardHeader class="space-y-2">
                        <div class="flex items-center justify-between">
                          <div class="flex items-center gap-2">
                            <StatusDot status={worker.status} pulse={worker.status === "busy"} />
                            <CardTitle class="text-base">{worker.name}</CardTitle>
                          </div>
                          <Badge variant={worker.status}>{statusLabel(worker.status)}</Badge>
                        </div>
                        <div class="text-xs text-muted-foreground">
                          {worker.model ?? "Auto model"} · {worker.id}
                        </div>
                      </CardHeader>
                      <CardContent class="space-y-3 text-sm">
                        <div class="grid gap-2 text-xs text-muted-foreground">
                          <div class="flex items-center justify-between">
                            <span>Session</span>
                            <span class="font-mono">{worker.sessionId?.slice(0, 10) ?? "—"}</span>
                          </div>
                          <div class="flex items-center justify-between">
                            <span>Last activity</span>
                            <span>{worker.lastActivity ? formatRelativeTime(worker.lastActivity) : "—"}</span>
                          </div>
                        </div>

                        <Show when={worker.currentTask}>
                          <div class="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs">
                            <div class="text-[10px] uppercase text-muted-foreground mb-1">Current task</div>
                            <div class="text-foreground">{truncate(worker.currentTask ?? "", 120)}</div>
                          </div>
                        </Show>

                        <Show when={streamsByWorker().get(worker.id)}>
                          {(stream) => (
                            <div class="rounded-md border border-border/60 bg-card/70 px-3 py-2 text-xs">
                              <div class="text-[10px] uppercase text-muted-foreground mb-1">Live stream</div>
                              <div class="text-foreground whitespace-pre-wrap">{truncate(stream(), 220)}</div>
                            </div>
                          )}
                        </Show>

                        <Show when={worker.lastResult}>
                          {(result) => (
                            <div class="rounded-md border border-border/60 bg-card/70 px-3 py-2 text-xs">
                              <div class="text-[10px] uppercase text-muted-foreground mb-1">Last result</div>
                              <div class="text-foreground">
                                {truncate(
                                  result().report?.summary ?? result().response ?? result().report?.details ?? "",
                                  200,
                                ) || "No summary available."}
                              </div>
                              <div class="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                                <span>{result().at ? formatRelativeTime(result().at) : "—"}</span>
                                <span>{formatDuration(result().durationMs)}</span>
                              </div>
                            </div>
                          )}
                        </Show>

                        <div class="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            Vision {worker.supportsVision ? "on" : "off"} · Web {worker.supportsWeb ? "on" : "off"}
                          </span>
                          <Button size="sm" variant="secondary" onClick={() => openChat(worker)} disabled={!worker.sessionId}>
                            Open Chat
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </For>
              </div>
            </Show>
          </section>

          <section class="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle class="text-lg">Active Workflows</CardTitle>
              </CardHeader>
              <CardContent class="space-y-3 text-sm">
                <Show
                  when={activeRuns().length > 0}
                  fallback={<div class="text-sm text-muted-foreground">No running workflows.</div>}
                >
                  <For each={activeRuns().slice(0, 6)}>
                    {(run) => (
                      <div class="rounded-md border border-border/60 bg-card/70 px-3 py-2">
                        <div class="flex items-center justify-between">
                          <div>
                            <div class="font-medium text-foreground">{run.workflowName ?? run.workflowId}</div>
                            <div class="text-xs text-muted-foreground">
                              Started {formatRelativeTime(run.startedAt)}
                            </div>
                          </div>
                          <Badge variant="busy">Running</Badge>
                        </div>
                        <div class="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                          <span>{run.steps.length} steps</span>
                          <span>ID {run.runId.slice(0, 8)}</span>
                        </div>
                      </div>
                    )}
                  </For>
                </Show>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle class="text-lg">Recent Memory Writes</CardTitle>
              </CardHeader>
              <CardContent class="space-y-3 text-sm">
                <Show
                  when={memoryWrites().length > 0}
                  fallback={<div class="text-sm text-muted-foreground">No memory writes observed yet.</div>}
                >
                  <For each={memoryWrites().slice(0, 6)}>
                    {(event) => (
                      <div class="rounded-md border border-border/60 bg-card/70 px-3 py-2">
                        <div class="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{getMemoryField(event.data, "scope") || "scope"}</span>
                          <span>{formatRelativeTime(event.timestamp)}</span>
                        </div>
                        <div class="text-sm font-medium text-foreground">
                          {getMemoryField(event.data, "key") || "Memory update"}
                        </div>
                        <div class="text-xs text-muted-foreground">
                          {getMemoryField(event.data, "action")} {getMemoryField(event.data, "projectId")}
                        </div>
                      </div>
                    )}
                  </For>
                </Show>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle class="text-lg">Recent Errors</CardTitle>
              </CardHeader>
              <CardContent class="space-y-3 text-sm">
                <Show
                  when={errorEvents().length > 0}
                  fallback={<div class="text-sm text-muted-foreground">No errors reported yet.</div>}
                >
                  <For each={errorEvents().slice(0, 6)}>
                    {(event) => {
                      const data = event.data;
                      const message = getMemoryField(data, "message") || "Unknown error";
                      const source = getMemoryField(data, "source");
                      const workerId = getMemoryField(data, "workerId");
                      return (
                        <div class="rounded-md border border-border/60 bg-card/70 px-3 py-2">
                          <div class="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{source || "orchestrator"}</span>
                            <span>{formatRelativeTime(event.timestamp)}</span>
                          </div>
                          <div class="text-sm font-medium text-foreground">{message}</div>
                          <Show when={workerId}>
                            <div class="text-xs text-muted-foreground">Worker: {workerId}</div>
                          </Show>
                        </div>
                      );
                    }}
                  </For>
                </Show>
              </CardContent>
            </Card>
          </section>

          <section>
            <Card>
              <CardHeader>
                <CardTitle class="text-lg">Workflow History</CardTitle>
              </CardHeader>
              <CardContent class="space-y-3 text-sm">
                <Show
                  when={sortedRuns().length > 0}
                  fallback={<div class="text-sm text-muted-foreground">No workflow history yet.</div>}
                >
                  <For each={sortedRuns().slice(0, 8)}>
                    {(run) => (
                      <div class="flex items-center justify-between border-b border-border/60 pb-2">
                        <div>
                          <div class="font-medium text-foreground">{run.workflowName ?? run.workflowId}</div>
                          <div class="text-xs text-muted-foreground">
                            {formatRelativeTime(run.startedAt)} · {run.steps.length} steps
                          </div>
                        </div>
                        <Badge
                          variant={run.status === "error" ? "error" : run.status === "running" ? "busy" : "ready"}
                        >
                          {run.status === "running"
                            ? "Running"
                            : run.status === "error"
                              ? "Error"
                              : "Success"}
                        </Badge>
                      </div>
                    )}
                  </For>
                </Show>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
};
