/**
 * Task Composer - Create and manage orchestrator tasks
 */

import { type Component, createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { useOpenCode } from "@/context/opencode";
import {
  buildTaskStartArgs,
  buildTaskAwaitArgs,
  buildTaskPeekArgs,
  buildTaskCancelArgs,
  type TaskKind,
  type OpKind,
  type TaskStartArgs,
} from "@/lib/task-args";

type TextPart = { type?: string; text?: string };

const extractText = (parts: TextPart[] | undefined): string => {
  if (!parts || parts.length === 0) return "";
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n");
};

const parseJson = <T,>(value: string): T | null => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

export const TaskComposer: Component = () => {
  const { client, sessions, workers, jobs } = useOpenCode();

  // Form state
  const [selectedSessionId, setSelectedSessionId] = createSignal<string>("");
  const [kind, setKind] = createSignal<TaskKind>("auto");
  const [task, setTask] = createSignal("");

  // Worker-specific
  const [workerId, setWorkerId] = createSignal<string>("");
  const [model, setModel] = createSignal("");
  const [modelPolicy, setModelPolicy] = createSignal<"dynamic" | "sticky">("dynamic");

  // Workflow-specific
  const [workflowId, setWorkflowId] = createSignal("");
  const [continueRunId, _setContinueRunId] = createSignal("");
  // _setContinueRunId can be exposed via UI when workflow continuation is needed

  // Op-specific
  const [op, setOp] = createSignal<OpKind>("memory.put");
  const [memoryKey, setMemoryKey] = createSignal("");
  const [memoryValue, setMemoryValue] = createSignal("");
  const [memoryScope, setMemoryScope] = createSignal<"project" | "global">("project");

  // Common options
  const [autoSpawn, setAutoSpawn] = createSignal(true);
  const [timeoutMs, setTimeoutMs] = createSignal<number | undefined>(undefined);

  // Execution state
  const [running, setRunning] = createSignal(false);
  const [lastTaskId, setLastTaskId] = createSignal<string | null>(null);
  const [output, setOutput] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);

  // Await/peek/cancel state
  const [targetTaskId, setTargetTaskId] = createSignal("");
  const [actionRunning, setActionRunning] = createSignal(false);
  const [actionOutput, setActionOutput] = createSignal("");
  const [actionError, setActionError] = createSignal<string | null>(null);

  // Auto-select first session
  createEffect(() => {
    if (!selectedSessionId() && sessions().length > 0) {
      setSelectedSessionId(sessions()[0].id);
    }
  });

  // Auto-select first worker
  createEffect(() => {
    if (!workerId() && workers().length > 0) {
      setWorkerId(workers()[0].id);
    }
  });

  const runningJobs = createMemo(() => jobs().filter((j) => j.status === "running"));

  const canStart = createMemo(() => {
    if (!selectedSessionId()) return false;
    if (!task().trim()) return false;
    if (kind() === "worker" && !workerId()) return false;
    if (kind() === "workflow" && !workflowId() && !continueRunId()) return false;
    if (kind() === "op" && !op()) return false;
    return true;
  });

  const handleStartTask = async () => {
    if (!canStart()) return;

    setRunning(true);
    setError(null);
    setOutput("");
    setLastTaskId(null);

    try {
      const args: TaskStartArgs = {
        kind: kind(),
        task: task().trim(),
      };

      // Add kind-specific options
      switch (kind()) {
        case "worker":
          args.workerId = workerId();
          if (model()) args.model = model();
          args.modelPolicy = modelPolicy();
          break;
        case "workflow":
          if (workflowId()) args.workflowId = workflowId();
          if (continueRunId()) args.continueRunId = continueRunId();
          break;
        case "op":
          args.op = op();
          if (op().startsWith("memory.")) {
            args.memory = {};
            if (memoryKey()) args.memory.key = memoryKey();
            if (memoryValue()) args.memory.value = memoryValue();
            args.memory.scope = memoryScope();
          }
          break;
      }

      // Add common options
      if (!autoSpawn()) args.autoSpawn = false;
      if (timeoutMs()) args.timeoutMs = timeoutMs();

      const argsStr = buildTaskStartArgs(args);

      const res = await client.session.command({
        path: { id: selectedSessionId() },
        body: { command: "task_start", arguments: argsStr },
      });

      const text = extractText(res.data?.parts as TextPart[] | undefined);
      setOutput(text);

      const payload = parseJson<{ taskId?: string }>(text);
      if (payload?.taskId) {
        setLastTaskId(payload.taskId);
        setTargetTaskId(payload.taskId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start task");
    } finally {
      setRunning(false);
    }
  };

  const handleAwait = async () => {
    if (!targetTaskId() || !selectedSessionId()) return;

    setActionRunning(true);
    setActionError(null);
    setActionOutput("");

    try {
      const args = buildTaskAwaitArgs({ taskId: targetTaskId() });
      const res = await client.session.command({
        path: { id: selectedSessionId() },
        body: { command: "task_await", arguments: args },
      });

      setActionOutput(extractText(res.data?.parts as TextPart[] | undefined));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Await failed");
    } finally {
      setActionRunning(false);
    }
  };

  const handlePeek = async () => {
    if (!targetTaskId() || !selectedSessionId()) return;

    setActionRunning(true);
    setActionError(null);
    setActionOutput("");

    try {
      const args = buildTaskPeekArgs({ taskId: targetTaskId() });
      const res = await client.session.command({
        path: { id: selectedSessionId() },
        body: { command: "task_peek", arguments: args },
      });

      setActionOutput(extractText(res.data?.parts as TextPart[] | undefined));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Peek failed");
    } finally {
      setActionRunning(false);
    }
  };

  const handleCancel = async () => {
    if (!targetTaskId() || !selectedSessionId()) return;

    setActionRunning(true);
    setActionError(null);
    setActionOutput("");

    try {
      const args = buildTaskCancelArgs({ taskId: targetTaskId() });
      const res = await client.session.command({
        path: { id: selectedSessionId() },
        body: { command: "task_cancel", arguments: args },
      });

      setActionOutput(extractText(res.data?.parts as TextPart[] | undefined));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setActionRunning(false);
    }
  };

  return (
    <div class="flex-1 flex flex-col overflow-hidden">
      <header class="px-6 py-5 border-b border-border">
        <h1 class="text-2xl font-semibold text-foreground">Task Composer</h1>
        <p class="text-sm text-muted-foreground">
          Create and manage orchestrator tasks for workers, workflows, and operations.
        </p>
      </header>

      <div class="flex-1 overflow-auto">
        <div class="p-6 space-y-6">
          {/* Create Task Card */}
          <Card>
            <CardHeader>
              <CardTitle>Create Task</CardTitle>
              <CardDescription>Start a new task on the orchestrator.</CardDescription>
            </CardHeader>
            <CardContent class="space-y-4">
              <div class="grid gap-4 md:grid-cols-3">
                {/* Session Selector */}
                <label class="flex flex-col gap-2 text-xs text-muted-foreground">
                  <span class="font-medium text-foreground" id="session-label">
                    Session
                  </span>
                  <select
                    class="input"
                    aria-labelledby="session-label"
                    value={selectedSessionId()}
                    onChange={(e) => setSelectedSessionId(e.currentTarget.value)}
                  >
                    <For
                      each={sessions()}
                      fallback={
                        <option value="" disabled>
                          No sessions
                        </option>
                      }
                    >
                      {(session) => (
                        <option value={session.id}>
                          {session.title || session.id.slice(0, 8)}
                        </option>
                      )}
                    </For>
                  </select>
                </label>

                {/* Kind Selector */}
                <label class="flex flex-col gap-2 text-xs text-muted-foreground">
                  <span class="font-medium text-foreground" id="kind-label">
                    Kind
                  </span>
                  <select
                    class="input"
                    aria-labelledby="kind-label"
                    value={kind()}
                    onChange={(e) => setKind(e.currentTarget.value as TaskKind)}
                  >
                    <option value="auto">Auto (pick worker)</option>
                    <option value="worker">Worker</option>
                    <option value="workflow">Workflow</option>
                    <option value="op">Operation</option>
                  </select>
                </label>

                {/* Worker Selector - shown when kind=worker */}
                <Show when={kind() === "worker"}>
                  <label class="flex flex-col gap-2 text-xs text-muted-foreground">
                    <span class="font-medium text-foreground" id="worker-label">
                      Worker
                    </span>
                    <select
                      class="input"
                      aria-labelledby="worker-label"
                      value={workerId()}
                      onChange={(e) => setWorkerId(e.currentTarget.value)}
                    >
                      <For each={workers()}>
                        {(worker) => (
                          <option value={worker.id}>
                            {worker.name} ({worker.status})
                          </option>
                        )}
                      </For>
                    </select>
                  </label>
                </Show>

                {/* Workflow ID - shown when kind=workflow */}
                <Show when={kind() === "workflow"}>
                  <label class="flex flex-col gap-2 text-xs text-muted-foreground">
                    <span class="font-medium text-foreground" id="workflow-label">
                      Workflow ID
                    </span>
                    <input
                      type="text"
                      class="input"
                      aria-labelledby="workflow-label"
                      placeholder="e.g., roocode-boomerang"
                      value={workflowId()}
                      onInput={(e) => setWorkflowId(e.currentTarget.value)}
                    />
                  </label>
                </Show>

                {/* Op Selector - shown when kind=op */}
                <Show when={kind() === "op"}>
                  <label class="flex flex-col gap-2 text-xs text-muted-foreground">
                    <span class="font-medium text-foreground" id="op-label">
                      Operation
                    </span>
                    <select
                      class="input"
                      aria-labelledby="op-label"
                      value={op()}
                      onChange={(e) => setOp(e.currentTarget.value as OpKind)}
                    >
                      <option value="memory.put">memory.put</option>
                      <option value="memory.link">memory.link</option>
                      <option value="memory.done">memory.done</option>
                      <option value="worker.model.set">worker.model.set</option>
                      <option value="worker.model.reset">worker.model.reset</option>
                    </select>
                  </label>
                </Show>
              </div>

              {/* Worker options */}
              <Show when={kind() === "worker"}>
                <div class="grid gap-4 md:grid-cols-2">
                  <label class="flex flex-col gap-2 text-xs text-muted-foreground">
                    <span class="font-medium text-foreground">Model Override (optional)</span>
                    <input
                      type="text"
                      class="input"
                      placeholder="e.g., anthropic/claude-3-haiku-20240307"
                      value={model()}
                      onInput={(e) => setModel(e.currentTarget.value)}
                    />
                  </label>
                  <label class="flex flex-col gap-2 text-xs text-muted-foreground">
                    <span class="font-medium text-foreground">Model Policy</span>
                    <select
                      class="input"
                      value={modelPolicy()}
                      onChange={(e) =>
                        setModelPolicy(e.currentTarget.value as "dynamic" | "sticky")
                      }
                    >
                      <option value="dynamic">Dynamic (per-task)</option>
                      <option value="sticky">Sticky (update worker)</option>
                    </select>
                  </label>
                </div>
              </Show>

              {/* Memory op options */}
              <Show when={kind() === "op" && op().startsWith("memory.")}>
                <div class="grid gap-4 md:grid-cols-3">
                  <label class="flex flex-col gap-2 text-xs text-muted-foreground">
                    <span class="font-medium text-foreground">Memory Key</span>
                    <input
                      type="text"
                      class="input"
                      placeholder="e.g., architecture/decision-001"
                      value={memoryKey()}
                      onInput={(e) => setMemoryKey(e.currentTarget.value)}
                    />
                  </label>
                  <label class="flex flex-col gap-2 text-xs text-muted-foreground">
                    <span class="font-medium text-foreground">Scope</span>
                    <select
                      class="input"
                      value={memoryScope()}
                      onChange={(e) =>
                        setMemoryScope(e.currentTarget.value as "project" | "global")
                      }
                    >
                      <option value="project">Project</option>
                      <option value="global">Global</option>
                    </select>
                  </label>
                </div>
                <Show when={op() === "memory.put"}>
                  <label class="flex flex-col gap-2 text-xs text-muted-foreground">
                    <span class="font-medium text-foreground">Memory Value</span>
                    <Textarea
                      rows={3}
                      value={memoryValue()}
                      onInput={(e) => setMemoryValue(e.currentTarget.value)}
                      placeholder="Content to store..."
                    />
                  </label>
                </Show>
              </Show>

              {/* Task Input */}
              <label class="flex flex-col gap-2 text-xs text-muted-foreground">
                <span class="font-medium text-foreground" id="task-label">
                  Task
                </span>
                <Textarea
                  rows={4}
                  aria-labelledby="task-label"
                  value={task()}
                  onInput={(e) => setTask(e.currentTarget.value)}
                  placeholder="Describe what the task should do..."
                />
              </label>

              {/* Common Options */}
              <div class="flex items-center gap-4">
                <label class="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={autoSpawn()}
                    onChange={(e) => setAutoSpawn(e.currentTarget.checked)}
                  />
                  <span>Auto-spawn workers</span>
                </label>
                <label class="flex items-center gap-2 text-xs">
                  <span>Timeout (ms):</span>
                  <input
                    type="number"
                    class="input w-24"
                    placeholder="600000"
                    value={timeoutMs() ?? ""}
                    onInput={(e) => {
                      const val = parseInt(e.currentTarget.value);
                      setTimeoutMs(isNaN(val) ? undefined : val);
                    }}
                  />
                </label>
              </div>

              {/* Start Button */}
              <div class="flex items-center gap-2">
                <Button onClick={handleStartTask} disabled={!canStart() || running()}>
                  {running() ? "Starting..." : "Start Task"}
                </Button>
                <Show when={lastTaskId()}>
                  <Badge variant="secondary">Task: {lastTaskId()?.slice(0, 12)}</Badge>
                </Show>
              </div>

              <Show when={error()}>
                {(err) => (
                  <div class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {err()}
                  </div>
                )}
              </Show>

              <Show when={output()}>
                <pre class="rounded-md border border-border bg-card/70 p-3 text-xs text-muted-foreground whitespace-pre-wrap max-h-48 overflow-auto">
                  {output()}
                </pre>
              </Show>
            </CardContent>
          </Card>

          {/* Task Actions Card */}
          <Card>
            <CardHeader>
              <CardTitle>Task Actions</CardTitle>
              <CardDescription>Await, peek, or cancel a running task.</CardDescription>
            </CardHeader>
            <CardContent class="space-y-4">
              <div class="flex items-center gap-4">
                <label class="flex flex-col gap-2 text-xs text-muted-foreground flex-1">
                  <span class="font-medium text-foreground">Task ID</span>
                  <input
                    type="text"
                    class="input"
                    placeholder="task-..."
                    value={targetTaskId()}
                    onInput={(e) => setTargetTaskId(e.currentTarget.value)}
                  />
                </label>
              </div>

              <div class="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleAwait}
                  disabled={!targetTaskId() || !selectedSessionId() || actionRunning()}
                >
                  {actionRunning() ? "Waiting..." : "Await"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handlePeek}
                  disabled={!targetTaskId() || !selectedSessionId() || actionRunning()}
                >
                  Peek
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={!targetTaskId() || !selectedSessionId() || actionRunning()}
                >
                  Cancel
                </Button>
              </div>

              <Show when={actionError()}>
                {(err) => (
                  <div class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {err()}
                  </div>
                )}
              </Show>

              <Show when={actionOutput()}>
                <pre class="rounded-md border border-border bg-card/70 p-3 text-xs text-muted-foreground whitespace-pre-wrap max-h-48 overflow-auto">
                  {actionOutput()}
                </pre>
              </Show>
            </CardContent>
          </Card>

          {/* Running Tasks Card */}
          <Show when={runningJobs().length > 0}>
            <Card>
              <CardHeader>
                <CardTitle>Running Tasks</CardTitle>
                <CardDescription>Quick access to in-flight tasks.</CardDescription>
              </CardHeader>
              <CardContent class="space-y-2">
                <For each={runningJobs().slice(0, 5)}>
                  {(job) => (
                    <button
                      type="button"
                      class="w-full text-left flex items-center justify-between border-b border-border/60 pb-2 hover:bg-accent/50 transition-colors rounded px-2 py-1"
                      onClick={() => setTargetTaskId(job.id)}
                    >
                      <div class="min-w-0 flex-1">
                        <div class="font-medium text-foreground truncate text-sm">
                          {job.message.slice(0, 60)}
                        </div>
                        <div class="text-xs text-muted-foreground">{job.id.slice(0, 12)}</div>
                      </div>
                      <Badge variant="busy">Running</Badge>
                    </button>
                  )}
                </For>
              </CardContent>
            </Card>
          </Show>
        </div>
      </div>
    </div>
  );
};
