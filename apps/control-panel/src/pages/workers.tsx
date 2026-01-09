/**
 * Workers Page - View all workers, their status, and last activation
 */

import { type Component, createMemo, createSignal, For, Show } from "solid-js";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useOpenCode, type WorkerRuntime } from "@/context/opencode";
import { formatRelativeTime } from "@/lib/utils";

const getStatusVariant = (status: WorkerRuntime["status"]) => {
  switch (status) {
    case "ready":
      return "ready" as const;
    case "busy":
      return "busy" as const;
    case "error":
      return "error" as const;
    case "starting":
      return "busy" as const;
    case "stopped":
      return "outline" as const;
    default:
      return "secondary" as const;
  }
};

export const WorkersPage: Component = () => {
  const { workers } = useOpenCode();

  const sortedWorkers = createMemo(() =>
    workers()
      .slice()
      .sort((a, b) => {
        // Active workers first
        const aActive = a.status === "ready" || a.status === "busy";
        const bActive = b.status === "ready" || b.status === "busy";
        if (aActive !== bActive) return aActive ? -1 : 1;
        // Then by name
        return a.name.localeCompare(b.name);
      })
  );

  return (
    <div class="flex-1 flex flex-col overflow-hidden">
      <header class="px-6 py-5 border-b border-border">
        <h1 class="text-2xl font-semibold text-foreground">Workers</h1>
        <p class="text-sm text-muted-foreground">
          View all workers on your device, their status, and recent activity.
        </p>
      </header>

      <div class="flex-1 overflow-auto">
        <div class="p-6">
          {/* Summary stats */}
          <div class="grid gap-4 md:grid-cols-4 mb-6">
            <Card>
              <CardContent class="pt-4">
                <div class="text-2xl font-bold">{workers().length}</div>
                <div class="text-xs text-muted-foreground">Total Workers</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent class="pt-4">
                <div class="text-2xl font-bold text-status-ready">
                  {workers().filter((w) => w.status === "ready").length}
                </div>
                <div class="text-xs text-muted-foreground">Ready</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent class="pt-4">
                <div class="text-2xl font-bold text-status-busy">
                  {workers().filter((w) => w.status === "busy").length}
                </div>
                <div class="text-xs text-muted-foreground">Busy</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent class="pt-4">
                <div class="text-2xl font-bold text-status-error">
                  {workers().filter((w) => w.status === "error").length}
                </div>
                <div class="text-xs text-muted-foreground">Errors</div>
              </CardContent>
            </Card>
          </div>

          {/* Workers list */}
          <div class="grid gap-4">
            <Show
              when={sortedWorkers().length > 0}
              fallback={
                <div class="text-center py-12 text-muted-foreground">
                  No workers found
                </div>
              }
            >
              <For each={sortedWorkers()}>
                {(worker) => (
                  <Card>
                    <CardContent class="pt-4">
                      <div class="flex items-start justify-between gap-4">
                        {/* Worker info */}
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-3 mb-2">
                            <h3 class="text-lg font-semibold text-foreground">
                              {worker.name}
                            </h3>
                            <Badge variant={getStatusVariant(worker.status)}>
                              {worker.status}
                            </Badge>
                            <Show when={worker.supportsVision}>
                              <span class="text-xs px-2 py-0.5 bg-muted rounded">
                                Vision
                              </span>
                            </Show>
                            <Show when={worker.supportsWeb}>
                              <span class="text-xs px-2 py-0.5 bg-muted rounded">
                                Web
                              </span>
                            </Show>
                          </div>

                          <div class="space-y-1 text-sm text-muted-foreground">
                            <div>
                              <span class="font-medium">ID:</span> {worker.id}
                            </div>
                            <Show when={worker.model}>
                              <div>
                                <span class="font-medium">Model:</span> {worker.model}
                              </div>
                            </Show>
                            <Show when={worker.port}>
                              <div>
                                <span class="font-medium">Port:</span> {worker.port}
                              </div>
                            </Show>
                            <Show when={worker.lastActivity}>
                              <div>
                                <span class="font-medium">Last Activity:</span>{" "}
                                {formatRelativeTime(new Date(worker.lastActivity!).getTime())}
                              </div>
                            </Show>
                          </div>

                          {/* Current task */}
                          <Show when={worker.currentTask}>
                            <div class="mt-3 p-3 bg-accent/30 rounded-md">
                              <div class="text-xs font-medium text-foreground mb-1">
                                Current Task
                              </div>
                              <div class="text-sm text-muted-foreground">
                                {worker.currentTask}
                              </div>
                            </div>
                          </Show>

                          {/* Last result */}
                          <Show when={worker.lastResult}>
                            {(result) => (
                              <div class="mt-3 p-3 bg-card/70 border border-border rounded-md">
                                <div class="text-xs font-medium text-foreground mb-1">
                                  Last Result
                                </div>
                                <Show when={result().report?.summary}>
                                  <div class="text-sm text-muted-foreground mb-2">
                                    {result().report!.summary}
                                  </div>
                                </Show>
                                <div class="flex items-center gap-3 text-xs text-muted-foreground">
                                  <Show when={result().at}>
                                    <span>
                                      {formatRelativeTime(new Date(result().at!).getTime())}
                                    </span>
                                  </Show>
                                  <Show when={result().durationMs}>
                                    <span>{(result().durationMs! / 1000).toFixed(1)}s</span>
                                  </Show>
                                </div>
                              </div>
                            )}
                          </Show>

                          {/* Error */}
                          <Show when={worker.error}>
                            <div class="mt-3 p-3 bg-destructive/10 border border-destructive/50 rounded-md">
                              <div class="text-xs font-medium text-destructive mb-1">
                                Error
                              </div>
                              <div class="text-sm text-destructive">
                                {worker.error}
                              </div>
                            </div>
                          </Show>

                          {/* Warning */}
                          <Show when={worker.warning}>
                            <div class="mt-3 p-3 bg-status-busy/10 border border-status-busy/50 rounded-md">
                              <div class="text-xs font-medium text-status-busy mb-1">
                                Warning
                              </div>
                              <div class="text-sm text-status-busy">
                                {worker.warning}
                              </div>
                            </div>
                          </Show>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </For>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
};
