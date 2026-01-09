/**
 * Tasks Page - View and monitor orchestrator tasks/jobs
 */

import { type Component, createMemo, createSignal, For, Show } from "solid-js";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useOpenCode, type JobRecord } from "@/context/opencode";
import { formatDuration, formatRelativeTime, truncate } from "@/lib/utils";

const getStatusVariant = (status: JobRecord["status"]) => {
  switch (status) {
    case "running":
      return "busy" as const;
    case "succeeded":
      return "ready" as const;
    case "failed":
      return "error" as const;
    case "canceled":
      return "outline" as const;
    default:
      return "secondary" as const;
  }
};

const getStatusLabel = (status: JobRecord["status"]) => {
  switch (status) {
    case "running":
      return "Running";
    case "succeeded":
      return "Succeeded";
    case "failed":
      return "Failed";
    case "canceled":
      return "Canceled";
    default:
      return status;
  }
};

export const TasksPage: Component = () => {
  const { jobs, jobSummary, workers } = useOpenCode();
  const [selectedJobId, setSelectedJobId] = createSignal<string | null>(null);

  const sortedJobs = createMemo(() =>
    jobs()
      .slice()
      .sort((a, b) => b.startedAt - a.startedAt),
  );

  const runningJobs = createMemo(() => sortedJobs().filter((job) => job.status === "running"));
  const completedJobs = createMemo(() => sortedJobs().filter((job) => job.status !== "running"));

  const selectedJob = createMemo(() => {
    const id = selectedJobId();
    if (!id) return null;
    return jobs().find((j) => j.id === id) ?? null;
  });

  const getWorkerName = (workerId: string): string => {
    const worker = workers().find((w) => w.id === workerId);
    return worker?.name ?? workerId;
  };

  return (
    <div class="flex-1 flex flex-col overflow-hidden">
      <header class="px-6 py-5 border-b border-border">
        <h1 class="text-2xl font-semibold text-foreground">Tasks</h1>
        <p class="text-sm text-muted-foreground">
          Monitor orchestrator tasks and jobs across all workers.
        </p>
      </header>

      <div class="flex-1 overflow-auto">
        <div class="p-6 space-y-6">
          {/* Summary Stats */}
          <Show when={jobSummary()}>
            {(summary) => (
              <div class="grid gap-4 md:grid-cols-5">
                <Card>
                  <CardContent class="pt-4">
                    <div class="text-2xl font-bold">{summary().total}</div>
                    <div class="text-xs text-muted-foreground">Total Jobs</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent class="pt-4">
                    <div class="text-2xl font-bold text-status-busy">{summary().running}</div>
                    <div class="text-xs text-muted-foreground">Running</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent class="pt-4">
                    <div class="text-2xl font-bold text-status-ready">{summary().succeeded}</div>
                    <div class="text-xs text-muted-foreground">Succeeded</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent class="pt-4">
                    <div class="text-2xl font-bold text-status-error">{summary().failed}</div>
                    <div class="text-xs text-muted-foreground">Failed</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent class="pt-4">
                    <div class="text-2xl font-bold">{summary().canceled}</div>
                    <div class="text-xs text-muted-foreground">Canceled</div>
                  </CardContent>
                </Card>
              </div>
            )}
          </Show>

          <div class="grid gap-6 lg:grid-cols-2">
            {/* Running Tasks */}
            <Card>
              <CardHeader>
                <CardTitle>Running Tasks</CardTitle>
                <CardDescription>Currently active jobs across workers.</CardDescription>
              </CardHeader>
              <CardContent class="space-y-3 text-sm">
                <Show
                  when={runningJobs().length > 0}
                  fallback={<div class="text-sm text-muted-foreground">No running tasks.</div>}
                >
                  <For each={runningJobs()}>
                    {(job) => (
                      <button
                        type="button"
                        class="w-full text-left rounded-md border border-border/60 bg-card/70 px-3 py-2 hover:bg-accent/50 transition-colors"
                        onClick={() => setSelectedJobId(job.id)}
                      >
                        <div class="flex items-center justify-between">
                          <div class="min-w-0 flex-1">
                            <div class="font-medium text-foreground truncate">
                              {truncate(job.message, 60)}
                            </div>
                            <div class="text-xs text-muted-foreground">
                              {getWorkerName(job.workerId)} · Started{" "}
                              {formatRelativeTime(job.startedAt)}
                            </div>
                          </div>
                          <Badge variant="busy">Running</Badge>
                        </div>
                        <Show when={job.progress}>
                          {(progress) => (
                            <div class="mt-2">
                              <div class="text-xs text-muted-foreground mb-1">
                                {progress().message}
                              </div>
                              <Show when={progress().percent !== undefined}>
                                <div class="h-1 bg-muted rounded-full overflow-hidden">
                                  <div
                                    class="h-full bg-primary transition-all"
                                    style={{ width: `${progress().percent}%` }}
                                  />
                                </div>
                              </Show>
                            </div>
                          )}
                        </Show>
                      </button>
                    )}
                  </For>
                </Show>
              </CardContent>
            </Card>

            {/* Recent Completed Tasks */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Tasks</CardTitle>
                <CardDescription>Recently completed, failed, or canceled jobs.</CardDescription>
              </CardHeader>
              <CardContent class="space-y-3 text-sm max-h-96 overflow-auto">
                <Show
                  when={completedJobs().length > 0}
                  fallback={<div class="text-sm text-muted-foreground">No completed tasks yet.</div>}
                >
                  <For each={completedJobs().slice(0, 20)}>
                    {(job) => (
                      <button
                        type="button"
                        class="w-full text-left flex items-center justify-between border-b border-border/60 pb-2 hover:bg-accent/50 transition-colors rounded px-2 py-1 -mx-2"
                        onClick={() => setSelectedJobId(job.id)}
                      >
                        <div class="min-w-0 flex-1">
                          <div class="font-medium text-foreground truncate">
                            {truncate(job.message, 50)}
                          </div>
                          <div class="text-xs text-muted-foreground">
                            {getWorkerName(job.workerId)} · {formatRelativeTime(job.startedAt)}
                            <Show when={job.durationMs}>
                              {(ms) => <span> · {formatDuration(ms())}</span>}
                            </Show>
                          </div>
                        </div>
                        <Badge variant={getStatusVariant(job.status)}>
                          {getStatusLabel(job.status)}
                        </Badge>
                      </button>
                    )}
                  </For>
                </Show>
              </CardContent>
            </Card>
          </div>

          {/* Task Detail Panel */}
          <Show when={selectedJob()}>
            {(job) => (
              <Card>
                <CardHeader>
                  <div class="flex items-center justify-between">
                    <div>
                      <CardTitle>Task Detail</CardTitle>
                      <CardDescription>Job {job().id.slice(0, 12)}</CardDescription>
                    </div>
                    <button
                      type="button"
                      class="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setSelectedJobId(null)}
                    >
                      Close
                    </button>
                  </div>
                </CardHeader>
                <CardContent class="space-y-4">
                  <div class="grid gap-4 md:grid-cols-2">
                    <div>
                      <div class="text-xs text-muted-foreground mb-1">Status</div>
                      <Badge variant={getStatusVariant(job().status)}>
                        {getStatusLabel(job().status)}
                      </Badge>
                    </div>
                    <div>
                      <div class="text-xs text-muted-foreground mb-1">Worker</div>
                      <div class="text-sm font-medium">{getWorkerName(job().workerId)}</div>
                    </div>
                    <div>
                      <div class="text-xs text-muted-foreground mb-1">Started</div>
                      <div class="text-sm">{new Date(job().startedAt).toLocaleString()}</div>
                    </div>
                    <Show when={job().finishedAt}>
                      {(finished) => (
                        <div>
                          <div class="text-xs text-muted-foreground mb-1">Finished</div>
                          <div class="text-sm">{new Date(finished()).toLocaleString()}</div>
                        </div>
                      )}
                    </Show>
                    <Show when={job().durationMs}>
                      {(ms) => (
                        <div>
                          <div class="text-xs text-muted-foreground mb-1">Duration</div>
                          <div class="text-sm">{formatDuration(ms())}</div>
                        </div>
                      )}
                    </Show>
                    <Show when={job().requestedBy}>
                      {(requestedBy) => (
                        <div>
                          <div class="text-xs text-muted-foreground mb-1">Requested By</div>
                          <div class="text-sm">{requestedBy()}</div>
                        </div>
                      )}
                    </Show>
                  </div>

                  <div>
                    <div class="text-xs text-muted-foreground mb-1">Message</div>
                    <div class="text-sm bg-muted/50 rounded-md p-3 whitespace-pre-wrap">
                      {job().message}
                    </div>
                  </div>

                  <Show when={job().progress}>
                    {(progress) => (
                      <div>
                        <div class="text-xs text-muted-foreground mb-1">Progress</div>
                        <div class="text-sm">{progress().message}</div>
                        <Show when={progress().percent !== undefined}>
                          <div class="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              class="h-full bg-primary transition-all"
                              style={{ width: `${progress().percent}%` }}
                            />
                          </div>
                          <div class="text-xs text-muted-foreground mt-1">
                            {progress().percent}% complete
                          </div>
                        </Show>
                      </div>
                    )}
                  </Show>

                  <Show when={job().error}>
                    {(error) => (
                      <div>
                        <div class="text-xs text-muted-foreground mb-1">Error</div>
                        <div class="text-sm text-destructive bg-destructive/10 border border-destructive/40 rounded-md p-3 whitespace-pre-wrap">
                          {error()}
                        </div>
                      </div>
                    )}
                  </Show>

                  <Show when={job().responsePreview || job().responseText}>
                    <div>
                      <div class="text-xs text-muted-foreground mb-1">
                        Response
                        <Show when={job().responseLength}>
                          {(len) => <span class="ml-1">({len()} chars)</span>}
                        </Show>
                      </div>
                      <pre class="text-xs bg-muted/50 rounded-md p-3 whitespace-pre-wrap max-h-48 overflow-auto">
                        {job().responsePreview || job().responseText}
                      </pre>
                    </div>
                  </Show>

                  <Show when={job().sessionId}>
                    {(sessionId) => (
                      <div>
                        <div class="text-xs text-muted-foreground mb-1">Session</div>
                        <div class="text-sm font-mono">{sessionId()}</div>
                      </div>
                    )}
                  </Show>
                </CardContent>
              </Card>
            )}
          </Show>
        </div>
      </div>
    </div>
  );
};
