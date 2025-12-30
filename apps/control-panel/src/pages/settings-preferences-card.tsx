import { type Component, createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type PreferenceRowProps = {
  name: string;
  value: string | null;
  onSave: (key: string, value: string | null) => void;
  onDelete: (key: string) => void;
};

const PreferenceRow: Component<PreferenceRowProps> = (props) => {
  const [localValue, setLocalValue] = createSignal(props.value ?? "");

  createEffect(() => {
    setLocalValue(props.value ?? "");
  });

  const handleSave = () => {
    props.onSave(props.name, localValue().trim() ? localValue() : null);
  };

  return (
    <div class="flex items-center gap-2">
      <div class="w-40 text-xs font-medium text-foreground">{props.name}</div>
      <Input value={localValue()} onInput={(e) => setLocalValue(e.currentTarget.value)} class="flex-1" />
      <Button variant="outline" size="sm" onClick={handleSave}>
        Save
      </Button>
      <Button variant="ghost" size="sm" onClick={() => props.onDelete(props.name)}>
        Remove
      </Button>
    </div>
  );
};

interface SettingsPreferencesCardProps {
  preferences: Record<string, string | null>;
  onSave: (key: string, value: string | null) => Promise<void>;
  onDelete: (key: string) => Promise<void>;
}

/** Card for browsing and editing preference key/value pairs. */
export const SettingsPreferencesCard: Component<SettingsPreferencesCardProps> = (props) => {
  const preferenceEntries = createMemo(() => Object.entries(props.preferences).sort(([a], [b]) => a.localeCompare(b)));

  const [newPrefKey, setNewPrefKey] = createSignal("");
  const [newPrefValue, setNewPrefValue] = createSignal("");

  const handleAddPreference = async () => {
    const key = newPrefKey().trim();
    if (!key) return;
    await props.onSave(key, newPrefValue().trim() || null);
    setNewPrefKey("");
    setNewPrefValue("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
        <CardDescription>Key-value preferences persisted in SQLite.</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="space-y-3">
          <Show when={preferenceEntries().length > 0}>
            <For each={preferenceEntries()}>
              {([key, value]) => (
                <PreferenceRow
                  name={key}
                  value={value}
                  onSave={(k, v) => void props.onSave(k, v)}
                  onDelete={(k) => void props.onDelete(k)}
                />
              )}
            </For>
          </Show>

          <div class="flex items-center gap-2 pt-2 border-t border-border">
            <Input
              placeholder="preference.key"
              value={newPrefKey()}
              onInput={(e) => setNewPrefKey(e.currentTarget.value)}
              class="w-48"
            />
            <Input
              placeholder="value"
              value={newPrefValue()}
              onInput={(e) => setNewPrefValue(e.currentTarget.value)}
              class="flex-1"
            />
            <Button size="sm" onClick={() => void handleAddPreference()}>
              Add
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
