/**
 * Settings Config Card - Orchestrator config editor in Settings
 */

import { type Component, createEffect, createMemo, createSignal, Show } from "solid-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { useOpenCode } from "@/context/opencode";

export const SettingsConfigCard: Component = () => {
  const { client } = useOpenCode();
  const [config, setConfig] = createSignal<Record<string, unknown> | null>(null);
  const [editorValue, setEditorValue] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [loadError, setLoadError] = createSignal<string | null>(null);
  const [saveError, setSaveError] = createSignal<string | null>(null);
  const [saveSuccess, setSaveSuccess] = createSignal<string | null>(null);
  const [expanded, setExpanded] = createSignal(false);

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

  const handleReset = () => {
    setEditorValue(formattedConfig());
    setSaveError(null);
    setSaveSuccess(null);
  };

  return (
    <Card>
      <CardHeader>
        <div class="flex items-start justify-between">
          <div>
            <CardTitle>Orchestrator Config</CardTitle>
            <CardDescription>
              View and safely edit orchestrator configuration with validation.
            </CardDescription>
          </div>
          <button
            type="button"
            class="btn btn-sm"
            onClick={() => setExpanded(!expanded())}
          >
            {expanded() ? "Collapse" : "Expand"}
          </button>
        </div>
      </CardHeader>

      <Show when={expanded()}>
        <CardContent class="space-y-4">
          <Show when={loadError()}>
            {(err) => (
              <div class="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {err()}
              </div>
            )}
          </Show>

          <Show when={saveError()}>
            {(err) => (
              <div class="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {err()}
              </div>
            )}
          </Show>

          <Show when={saveSuccess()}>
            {(msg) => (
              <div class="rounded-md border border-status-ready/50 bg-status-ready/10 px-4 py-3 text-sm text-status-ready">
                {msg()}
              </div>
            )}
          </Show>

          <div>
            <label class="block text-sm font-medium text-foreground mb-2">
              Config JSON
            </label>
            <Textarea
              value={editorValue()}
              onInput={(e) => setEditorValue(e.currentTarget.value)}
              placeholder="Loading config..."
              disabled={loading()}
              class="min-h-[400px] font-mono text-xs"
            />
            <Show when={parseError()}>
              <p class="mt-2 text-sm text-destructive">{parseError()}</p>
            </Show>
          </div>

          <div class="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              onClick={handleReset}
              disabled={!isDirty() || loading()}
            >
              Reset
            </Button>
            <Button
              onClick={handleSave}
              disabled={!isDirty() || !!parseError() || saving() || loading()}
            >
              {saving() ? "Saving..." : "Save Config"}
            </Button>
          </div>
        </CardContent>
      </Show>
    </Card>
  );
};
