import { Textarea } from "@/components/ui/input";

export function PromptEditor(props: { value: string; onChange: (v: string) => void }) {
  return (
    <label class="flex flex-col gap-2 text-xs text-muted-foreground">
      <span class="font-medium text-foreground">System Prompt</span>
      <Textarea
        rows={12}
        value={props.value}
        onInput={(e) => props.onChange(e.currentTarget.value)}
      />
    </label>
  );
}
