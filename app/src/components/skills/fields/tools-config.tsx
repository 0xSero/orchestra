import { For } from "solid-js";
import { cn } from "@/lib/utils";

const TOOLS = [
  { id: "read", label: "Read Files", description: "Read file contents" },
  { id: "write", label: "Write Files", description: "Create new files" },
  { id: "edit", label: "Edit Files", description: "Modify existing files" },
  { id: "bash", label: "Shell Commands", description: "Execute shell commands" },
  { id: "glob", label: "File Search", description: "Search for files by pattern" },
  { id: "grep", label: "Content Search", description: "Search file contents" },
  { id: "web", label: "Web Access", description: "Fetch web content" },
];

export function ToolsConfig(props: {
  value: Record<string, boolean>;
  onChange: (v: Record<string, boolean>) => void;
}) {
  const toggle = (id: string) => {
    props.onChange({ ...props.value, [id]: !props.value[id] });
  };

  return (
    <div class="space-y-2">
      <For each={TOOLS}>
        {(tool) => (
          <label
            class={cn(
              "flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2",
              "hover:bg-accent/30"
            )}
          >
            <div>
              <div class="text-sm font-medium text-foreground">{tool.label}</div>
              <div class="text-xs text-muted-foreground">{tool.description}</div>
            </div>
            <input
              type="checkbox"
              checked={props.value[tool.id] ?? false}
              onChange={() => toggle(tool.id)}
              class="h-4 w-4"
            />
          </label>
        )}
      </For>
    </div>
  );
}
