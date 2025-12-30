/**
 * Workflows Page - Run and monitor orchestrator workflows
 */

import { type Component, createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { useLayout } from "@/context/layout";
import { useOpenCode } from "@/context/opencode";
import { formatDuration, formatRelativeTime, truncate } from "@/lib/utils";

type WorkflowDefinition = {
  id: string;
  name?: string;
  description?: string;
  steps?: Array<{ id?: string; title?: string }>;
};

type TextPart = { type?: string; text?: string };

const extractText = (parts: TextPart[] | undefined): string => {
  if (!parts || parts.length === 0) return "";
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n");
};

export const WorkflowsPage: Component = () => {
  const { client, workflowRuns, sessions } = useOpenCode();
  const { selectedWorkerId } = useLayout();

  const [selectedSessionId, setSelectedSessionId] = createSignal<string | null>(null);
  const [availableWorkflows, setAvailableWorkflows] = createSignal<WorkflowDefinition[]>([]);
  const [workflowsLoading, setWorkflowsLoading] = createSignal(false);
  const [workflowsError, setWorkflowsError] = createSignal<string | null>(null);
  const [workflowRaw, setWorkflowRaw] = createSignal("");

  const [selectedWorkflowId, setSelectedWorkflowId] = createSignal<string>("");
  const [task, setTask] = createSignal("");
  const [runOutput, setRunOutput] = createSignal("");
  const [runError, setRunError] = createSignal<string | null>(null);
  const [running, setRunning] = createSignal(false);

  const sortedRuns = createMemo(() =>
    workflowRuns()
      .slice()
      .sort((a, b) => b.startedAt - a.startedAt),
  );
  const activeRuns = createMemo(() => sortedRuns().filter((run) => run.status === "running"));

  createEffect(() => {
    const preferred = selectedWorkerId();
    if (!selectedSessionId() && preferred) {
      setSelectedSessionId(preferred);
      return;
    }
    if (!selectedSessionId() && sessions().length > 0) {
      setSelectedSessionId(sessions()[0].id);
    }
  });

  const loadWorkflows = async () => {
    const sessionId = selectedSessionId();
    if (!sessionId) {
      setWorkflowsError("Select a session to query available workflows.");
      return;
    }
    setWorkflowsLoading(true);
    setWorkflowsError(null);
    try {
      const res = await client.session.command({
        path: { id: sessionId },
        body: { command: "list_workflows", arguments: "--format json" },
      });
      const text = extractText(res.data?.parts as TextPart[] | undefined);
      setWorkflowRaw(text);
      const parsed = text ? JSON.parse(text) : [];
      if (Array.isArray(parsed)) {
        setAvailableWorkflows(parsed as WorkflowDefinition[]);
        if (!selectedWorkflowId() && parsed.length > 0) {
          setSelectedWorkflowId(String(parsed[0].id ?? ""));
        }
      } else {
        setAvailableWorkflows([]);
        setWorkflowsError("Unexpected workflow list response.");
      }
    } catch (err) {
      setAvailableWorkflows([]);
      setWorkflowsError(err instanceof Error ? err.message : "Failed to load workflows.");
    } finally {
      setWorkflowsLoading(false);
    }
  };

  createEffect(() => {
    if (!selectedSessionId()) return;
    void loadWorkflows();
  });

  const handleRunWorkflow = async () => {
    const sessionId = selectedSessionId();
    if (!sessionId) {
      setRunError("Select a session to run workflows.");
      return;
    }
    if (!selectedWorkflowId()) {
      setRunError("Pick a workflow to run.");
      return;
    }
    if (!task().trim()) {
      setRunError("Provide a task for the workflow.");
      return;
    }
    setRunning(true);
    setRunError(null);
    setRunOutput("");
    try {
      const safeTask = task().trim().replace(/"/g, '\\"');
      const args = `--workflowId ${selectedWorkflowId()} --task "${safeTask}" --format json`;
      const res = await client.session.command({
        path: { id: sessionId },
        body: { command: "run_workflow", arguments: args },
      });
      const text = extractText(res.data?.parts as TextPart[] | undefined);
      setRunOutput(text || "Workflow run completed.");
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Failed to run workflow.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div class="flex-1 flex flex-col overflow-hidden">
      <header class="px-6 py-5 border-b border-border">
        <h1 class="text-2xl font-semibold text-foreground">Workflows</h1>
        <p class="text-sm text-muted-foreground">
          Run orchestrator workflows and monitor their active and historical runs.
        </p>
      </header>

      <div class="flex-1 overflow-auto">
        <div class="p-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Run Workflow</CardTitle>
              <CardDescription>Trigger a workflow from a selected session context.</CardDescription>
            </CardHeader>
            <CardContent class="space-y-4">
              <div class="grid gap-4 md:grid-cols-3">
                <label class="flex flex-col gap-2 text-xs text-muted-foreground">
                  <span class="font-medium text-foreground">Session</span>
                  <select
                    class="input"
                    value={selectedSessionId() ?? ""}
                    onChange={(e) => setSelectedSessionId(e.currentTarget.value)}
                  >
                    <For
                      each={sessions()}
                      fallback={
                        <option value="" disabled>
                          No sessions available
                        </option>
                      }
                    >
                      {(session) => (
                        <option value={session.id}>{session.title || session.id.slice(0, 8)}</option>
                      )}
                    </For>
                  </select>
                </label>

                <label class="flex flex-col gap-2 text-xs text-muted-foreground md:col-span-2">
                  <span class="font-medium text-foreground">Workflow</span>
                  <select
                    class="input"
                    value={selectedWorkflowId()}
                    onChange={(e) => setSelectedWorkflowId(e.currentTarget.value)}
                  >
                    <For
                      each={availableWorkflows()}
                      fallback={
                        <option value="" disabled>
                          No workflows loaded
                        </option>
                      }
                    >
                      {(workflow) => (
                        <option value={workflow.id}>
                          {workflow.name ?? workflow.id} · {workflow.steps?.length ?? 0} steps
                        </option>
                      )}
                    </For>
                  </select>
                </label>
              </div>

              <label class="flex flex-col gap-2 text-xs text-muted-foreground">
                <span class="font-medium text-foreground">Task</span>
                <Textarea
                  rows={4}
                  value={task()}
                  onInput={(e) => setTask(e.currentTarget.value)}
                  placeholder="Describe the task to run through the workflow..."
                />
              </label>

              <div class="flex items-center gap-2">
                <Button onClick={handleRunWorkflow} disabled={running() || workflowsLoading()}>
                  {running() ? "Running..." : "Run Workflow"}
                </Button>
                <Button variant="outline" onClick={loadWorkflows} disabled={workflowsLoading()}>
                  {workflowsLoading() ? "Refreshing..." : "Refresh Workflows"}
                </Button>
                <Show when={workflowsError()}>
                  {(err) => <span class="text-xs text-destructive">{err()}</span>}
                </Show>
              </div>

              <Show when={runError()}>
                {(err) => (
                  <div class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {err()}
                  </div>
                )}
              </Show>

              <Show when={runOutput()}>
                <pre class="rounded-md border border-border bg-card/70 p-3 text-xs text-muted-foreground whitespace-pre-wrap">
                  {runOutput()}
                </pre>
              </Show>

              <Show when={!runOutput() && workflowRaw()}>
                <pre class="rounded-md border border-border bg-card/70 p-3 text-xs text-muted-foreground whitespace-pre-wrap">
                  {workflowRaw()}
                </pre>
              </Show>
            </CardContent>
          </Card>

          <div class="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Active Runs</CardTitle>
                <CardDescription>In-flight workflows across the orchestrator.</CardDescription>
              </CardHeader>
              <CardContent class="space-y-3 text-sm">
                <Show
                  when={activeRuns().length > 0}
                  fallback={<div class="text-sm text-muted-foreground">No active workflows.</div>}
                >
                  <For each={activeRuns()}>
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
                        <div class="mt-2 text-xs text-muted-foreground">
                          {run.steps.length} steps · Run {run.runId.slice(0, 8)}
                        </div>
                      </div>
                    )}
                  </For>
                </Show>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent Runs</CardTitle>
                <CardDescription>Most recent workflow history.</CardDescription>
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
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Workflow Timeline</CardTitle>
              <CardDescription>Step-level breakdown of recent runs.</CardDescription>
            </CardHeader>
            <CardContent class="space-y-3 text-sm">
              <Show
                when={sortedRuns().length > 0}
                fallback={<div class="text-sm text-muted-foreground">No workflow steps yet.</div>}
              >
                <For each={sortedRuns().slice(0, 3)}>
                  {(run) => (
                    <div class="rounded-md border border-border/60 bg-card/70 p-3">
                      <div class="flex items-center justify-between">
                        <div>
                          <div class="font-medium text-foreground">{run.workflowName ?? run.workflowId}</div>
                          <div class="text-xs text-muted-foreground">
                            {formatRelativeTime(run.startedAt)} · {run.steps.length} steps
                          </div>
                        </div>
                        <span class="text-xs text-muted-foreground">{formatDuration(run.durationMs)}</span>
                      </div>
                      <div class="mt-3 space-y-2">
                        <For each={run.steps.slice(0, 4)}>
                          {(step) => (
                            <div class="flex items-center justify-between text-xs">
                              <span class="text-muted-foreground">{step.stepTitle ?? step.stepId}</span>
                              <span class="text-foreground">
                                {step.status === "error" ? "Error" : "Success"} · {formatDuration(step.durationMs)}
                              </span>
                            </div>
                          )}
                        </For>
                        <Show when={run.steps.length > 4}>
                          <div class="text-xs text-muted-foreground">
                            {truncate(`${run.steps.length - 4} more steps`, 80)}
                          </div>
                        </Show>
                      </div>
                    </div>
                  )}
                </For>
              </Show>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
