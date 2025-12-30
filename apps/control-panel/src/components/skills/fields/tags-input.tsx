import { createSignal, For } from "solid-js";
import { cn } from "@/lib/utils";

export function TagsInput(props: { value: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = createSignal("");

  const addTag = (tag: string) => {
    const next = tag.trim();
    if (!next) return;
    if (props.value.includes(next)) return;
    props.onChange([...props.value, next]);
  };

  const removeTag = (tag: string) => {
    props.onChange(props.value.filter((t) => t !== tag));
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(input());
      setInput("");
    }
    if (event.key === "Backspace" && !input() && props.value.length > 0) {
      removeTag(props.value[props.value.length - 1]);
    }
  };

  return (
    <label class="flex flex-col gap-2 text-xs text-muted-foreground">
      <span class="font-medium text-foreground">Tags</span>
      <div class={cn("flex flex-wrap gap-2 rounded-md border border-input bg-background px-2 py-2")}>
        <For each={props.value}>
          {(tag) => (
            <span class="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">
              {tag}
              <button type="button" class="text-muted-foreground hover:text-foreground" onClick={() => removeTag(tag)}>
                x
              </button>
            </span>
          )}
        </For>
        <input
          class="flex-1 min-w-[120px] bg-transparent text-sm text-foreground focus:outline-none"
          placeholder="Add tag"
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
    </label>
  );
}
