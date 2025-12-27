import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOpenCode } from "@/context/opencode";
import { cn, formatRelativeTime } from "@/lib/utils";
import { type SdkAction, sdkActions } from "./sdk-actions";

const ACTIONS = sdkActions;

type RunEntry = {
  id: string;
  actionId: string;
  actionLabel: string;
  startedAt: number;
  durationMs: number;
  ok: boolean;
  output: string;
};

export function SdkWorkspace() {
  const { client } = useOpenCode();
  const [selectedActionId, setSelectedActionId] = createSignal(ACTIONS[0]?.id ?? "");
  const [inputText, setInputText] = createSignal("");
  const [runs, setRuns] = createSignal<RunEntry[]>([]);
  const [error, setError] = createSignal<string | null>(null);
  const [running, setRunning] = createSignal(false);

  const groupedActions = createMemo(() => {
    const groups: Record<string, SdkAction[]> = {};
    for (const action of ACTIONS) {
      if (!groups[action.group]) groups[action.group] = [];
      groups[action.group].push(action);
    }
    return groups;
  });

  const selectedAction = createMemo(() => ACTIONS.find((action) => action.id === selectedActionId()));

  createEffect(() => {
    const action = selectedAction();
    if (!action) return;
    if (!action.template) {
      setInputText("");
      return;
    }
    setInputText(JSON.stringify(action.template, null, 2));
  });

  const parseInput = () => {
    const raw = inputText().trim();
    if (!raw) return undefined;
    return JSON.parse(raw);
  };

  const normalizeOutput = (value: any) => {
    if (!value || typeof value !== "object") return value;
    if ("data" in value || "error" in value || "response" in value) {
      return {
        ok: !value.error,
        status: value.response?.status,
        data: value.data ?? null,
        error: value.error ?? null,
      };
    }
    return value;
  };

  const runAction = async () => {
    const action = selectedAction();
    if (!action || running()) return;
    setRunning(true);
    setError(null);

    const startedAt = Date.now();
    try {
      const input = parseInput();
      const result = await action.run(client, input);
      const normalized = normalizeOutput(result);
      const output = JSON.stringify(normalized, null, 2);

      setRuns((prev) =>
        [
          {
            id: `${startedAt}-${Math.random().toString(36).slice(2)}`,
            actionId: action.id,
            actionLabel: action.label,
            startedAt,
            durationMs: Date.now() - startedAt,
            ok: !(normalized as any)?.error,
            output,
          },
          ...prev,
        ].slice(0, 25),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setRuns((prev) =>
        [
          {
            id: `${startedAt}-${Math.random().toString(36).slice(2)}`,
            actionId: action.id,
            actionLabel: action.label,
            startedAt,
            durationMs: Date.now() - startedAt,
            ok: false,
            output: JSON.stringify({ error: message }, null, 2),
          },
          ...prev,
        ].slice(0, 25),
      );
    } finally {
      setRunning(false);
    }
  };

  const latestRun = createMemo(() => runs()[0]);

  return (
    <div class="flex h-full flex-col bg-background">
      <div class="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 class="text-sm font-semibold text-foreground">SDK Console</h2>
          <p class="text-xs text-muted-foreground">
            Run any OpenCode SDK endpoint with real data. Event streaming stays active in the Logs panel.
          </p>
        </div>
      </div>

      <div class="flex-1 overflow-auto p-4 space-y-4">
        <Card>
          <CardHeader class="pb-2">
            <CardTitle class="text-sm">Action Runner</CardTitle>
          </CardHeader>
          <CardContent class="space-y-3">
            <div class="grid gap-3 md:grid-cols-[220px_1fr]">
              <div>
                <label class="text-xs text-muted-foreground">Action</label>
                <select
                  class={cn(
                    "mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm",
                    "focus:outline-none focus:ring-2 focus:ring-ring/30",
                  )}
                  value={selectedActionId()}
                  onChange={(e) => setSelectedActionId(e.currentTarget.value)}
                >
                  <For each={Object.entries(groupedActions())}>
                    {([group, actions]) => (
                      <optgroup label={group}>
                        <For each={actions}>{(action) => <option value={action.id}>{action.label}</option>}</For>
                      </optgroup>
                    )}
                  </For>
                </select>
              </div>
              <div>
                <label class="text-xs text-muted-foreground">Options (JSON)</label>
                <textarea
                  class={cn(
                    "mt-1 h-32 w-full rounded-md border border-border bg-background px-2 py-2 text-xs font-mono",
                    "focus:outline-none focus:ring-2 focus:ring-ring/30",
                  )}
                  value={inputText()}
                  onInput={(e) => setInputText(e.currentTarget.value)}
                  placeholder="{}"
                />
              </div>
            </div>

            <Show when={error()}>
              <div class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error()}
              </div>
            </Show>

            <div class="flex items-center gap-2">
              <Button size="sm" onClick={runAction} disabled={running()}>
                {running() ? "Running..." : "Run"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRuns([])} disabled={runs().length === 0}>
                Clear Runs
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="pb-2">
            <CardTitle class="text-sm">Latest Output</CardTitle>
          </CardHeader>
          <CardContent>
            <Show when={latestRun()} fallback={<div class="text-xs text-muted-foreground">No runs yet.</div>}>
              {(run) => (
                <div>
                  <div class="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{run().actionLabel}</span>
                    <span>{formatRelativeTime(run().startedAt)}</span>
                  </div>
                  <pre class="mt-2 whitespace-pre-wrap rounded-md border border-border/60 bg-muted/40 p-3 text-xs text-foreground">
                    {run().output}
                  </pre>
                </div>
              )}
            </Show>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="pb-2">
            <CardTitle class="text-sm">Recent Runs</CardTitle>
          </CardHeader>
          <CardContent>
            <Show when={runs().length > 0} fallback={<div class="text-xs text-muted-foreground">No activity yet.</div>}>
              <div class="space-y-2">
                <For each={runs()}>
                  {(run) => (
                    <div class="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-xs">
                      <div>
                        <div class="font-medium text-foreground">{run.actionLabel}</div>
                        <div class="text-muted-foreground">{formatRelativeTime(run.startedAt)}</div>
                      </div>
                      <div class="text-right">
                        <div class={run.ok ? "text-green-500" : "text-destructive"}>{run.ok ? "ok" : "error"}</div>
                        <div class="text-muted-foreground">{run.durationMs} ms</div>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
