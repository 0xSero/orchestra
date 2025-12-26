import { For } from "solid-js";
import { cn } from "@/lib/utils";

const MODEL_OPTIONS = [
  { value: "auto", label: "Auto (Best Available)" },
  { value: "anthropic:claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { value: "anthropic:claude-opus-4-20250514", label: "Claude Opus 4" },
  { value: "anthropic:claude-haiku-3-5-20241022", label: "Claude Haiku 3.5" },
  { value: "openai:gpt-4o", label: "GPT-4o" },
  { value: "openai:gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "google:gemini-2.0-flash", label: "Gemini 2.0 Flash" },
];

export function ModelSelector(props: { value: string; onChange: (v: string) => void }) {
  return (
    <label class="flex flex-col gap-2 text-xs text-muted-foreground">
      <span class="font-medium text-foreground">Model</span>
      <select
        class={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        )}
        value={props.value}
        onChange={(e) => props.onChange(e.currentTarget.value)}
      >
        <For each={MODEL_OPTIONS}>
          {(option) => <option value={option.value}>{option.label}</option>}
        </For>
      </select>
    </label>
  );
}
