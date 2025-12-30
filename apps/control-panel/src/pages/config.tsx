/**
 * Config Page - View and safely edit orchestrator config
 */

import { type Component, createEffect, createMemo, createSignal, Show } from "solid-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { useOpenCode } from "@/context/opencode";

export const ConfigPage: Component = () => {
  const { client } = useOpenCode();
  const [config, setConfig] = createSignal<Record<string, unknown> | null>(null);
  const [editorValue, setEditorValue] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [loadError, setLoadError] = createSignal<string | null>(null);
  const [saveError, setSaveError] = createSignal<string | null>(null);
  const [saveSuccess, setSaveSuccess] = createSignal<string | null>(null);

  const formattedConfig = createMemo(() => (config() ? JSON.stringify(config(), null, 2) : ""));

  const parseError = createMemo(() => {
    if (!editorValue().trim()) return "Config cannot be empty.";
    try {
      JSON.parse(editorValue());
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Invalid JSON.";
    }
  });

  const isDirty = createMemo(() => editorValue().trim() !== formattedConfig().trim());

  const loadConfig = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await client.config.get();
      const next = (res.data ?? {}) as Record<string, unknown>;
      setConfig(next);
      setEditorValue(JSON.stringify(next, null, 2));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load config.");
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    void loadConfig();
  });

  const handleSave = async () => {
    setSaveError(null);
    setSaveSuccess(null);
    if (parseError()) {
      setSaveError(parseError());
      return;
    }
    setSaving(true);
    try {
      const next = JSON.parse(editorValue()) as Record<string, unknown>;
      await client.config.update({ body: next });
      setConfig(next);
      setSaveSuccess("Config updated. Changes apply to new sessions.");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save config.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="flex-1 flex flex-col overflow-hidden">
      <header class="px-6 py-5 border-b border-border">
        <h1 class="text-2xl font-semibold text-foreground">Config</h1>
        <p class="text-sm text-muted-foreground">
          View the active orchestrator config and edit with validation safeguards.
        </p>
      </header>

      <div class="flex-1 overflow-auto">
        <div class="p-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Active Config</CardTitle>
              <CardDescription>Read-only snapshot of the current server configuration.</CardDescription>
            </CardHeader>
            <CardContent>
              <Show
                when={!loading() && !loadError()}
                fallback={<div class="text-sm text-muted-foreground">Loading config...</div>}
              >
                <pre class="rounded-md border border-border bg-card/70 p-3 text-xs text-muted-foreground whitespace-pre-wrap">
                  {formattedConfig() || "No config loaded."}
                </pre>
              </Show>
              <Show when={loadError()}>
                {(err) => (
                  <div class="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {err()}
                  </div>
                )}
              </Show>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Edit Config</CardTitle>
              <CardDescription>Paste a JSON update. Invalid JSON will be blocked.</CardDescription>
            </CardHeader>
            <CardContent class="space-y-3">
              <Textarea
                rows={12}
                value={editorValue()}
                onInput={(e) => setEditorValue(e.currentTarget.value)}
                class={parseError() ? "border-destructive/50" : ""}
              />
              <div class="flex items-center gap-2">
                <Button onClick={handleSave} disabled={saving() || Boolean(parseError()) || !isDirty()}>
                  {saving() ? "Saving..." : "Save Config"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setEditorValue(formattedConfig())}
                  disabled={!isDirty()}
                >
                  Reset
                </Button>
                <Button variant="ghost" onClick={loadConfig} disabled={loading()}>
                  Refresh
                </Button>
              </div>
              <Show when={parseError()}>
                {(err) => <p class="text-xs text-destructive">{err()}</p>}
              </Show>
              <Show when={saveError()}>
                {(err) => <p class="text-xs text-destructive">{err()}</p>}
              </Show>
              <Show when={saveSuccess()}>
                {(msg) => <p class="text-xs text-green-600 dark:text-green-400">{msg()}</p>}
              </Show>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
